import crypto from 'crypto';
import net from 'net';
import EventEmitter from 'events';
import Logger from '../shared/util/Logger';
import { PrefixLogger } from '../shared/util/Logger';
import { ProtocolFactory } from './protocol/ProtocolFactory';
import { Protocol } from './protocol/Protocol';
import { hmac, encryptGCM, encryptECBNoPad } from './protocol/ProtocolUtilities';
import { ChildPayloadUtility, SupportedChildProtocol } from './protocol/ChildPayloadUtility';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalDeviceContext {
  id: string;
  key: Buffer;     // 16-byte device local key
  ip: string;
  version: string; // "3.1" | "3.2" | "3.3" | "3.4" | "3.5"
  name?: string;
  port?: number;
  pingGap?: number;
  connectTimeout?: number;
}

/**
 * LocalDevice – maintains a persistent TCP connection to a single Tuya local
 * device. Handles all protocol versions (3.1–3.5) including the 3-way key
 * exchange required by v3.4 and v3.5.
 *
 * Emits:
 *   'connect'       – TCP connection established and key exchange complete
 *   'change'        – { dps: {[dp]: value} , state } on any DP update
 *   'disconnect'    – connection lost
 *   'error'         – Error object
 */
export default class LocalDevice extends EventEmitter {
  public log: Logger;
  public connected = false;
  public state: Record<string, unknown> = {};

  // ── Zigbee gateway / child support ─────────────────────────────────────────
  /** Reference to the parent gateway LocalDevice. Set when this represents a Zigbee sub-device. */
  public parentDevice?: LocalDevice;
  /** Zigbee CID (Child ID) if this is a sub-device. Set alongside parentDevice. */
  public childId?: string;
  /**
   * Map of Zigbee CID → child LocalDevice for parent gateways.
   * Populated by LocalDeviceManager when children are registered.
   */
  public readonly children: Map<string, LocalDevice> = new Map();
  // ───────────────────────────────────────────────────────────────────────────

  private protocol: Protocol;
  private socket?: net.Socket;
  private cachedBuffer = Buffer.allocUnsafe(0);
  private sendCounter = 0;
  private sessionKey?: Buffer;
  private tmpLocalKey?: Buffer;
  private tmpRemoteKey?: Buffer;
  private pinger?: ReturnType<typeof setTimeout>;
  private connTimeout?: ReturnType<typeof setTimeout>;
  private errorReconnect?: ReturnType<typeof setTimeout>;
  private connectionAttempts = 0;

  constructor(
    private context: LocalDeviceContext,
    parentLog: Logger,
  ) {
    super();
    this.log = new PrefixLogger(parentLog, context.name || context.id, false);
    this.context.port = this.context.port ?? 6668;
    this.context.pingGap = this.context.pingGap ?? 9;
    this.context.connectTimeout = this.context.connectTimeout ?? 30;
    this.protocol = ProtocolFactory.createProtocol(context.version);
  }

  connect(): void {
    if (this.socket) {
      return;
    }
    this._connect();
  }

  disconnect(): void {
    this._clearTimers();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }
    this.connected = false;
    this.sessionKey = undefined;
    // Propagate disconnect to all registered Zigbee children
    for (const child of this.children.values()) {
      if (child.connected) {
        child.connected = false;
        child.emit('disconnect');
      }
    }
  }

  /**
   * Send DP update to device.
   *
   * For a Zigbee child device (parentDevice is set) this routes the command
   * through the parent gateway connection with CID injection.
   *
   * @param dps  Object mapping DP number (string key) to new value.
   */
  update(dps: Record<string, unknown>): void {
    // ── Zigbee child path ────────────────────────────────────────────────────
    if (this.parentDevice && this.childId) {
      this.parentDevice.updateChild(this.childId, dps);
      return;
    }
    // ── Standard / parent path ───────────────────────────────────────────────
    this._sendDps(dps);
  }

  /**
   * Send a DP update to a Zigbee child device via this gateway connection.
   * Only valid when this LocalDevice represents a gateway (has children registered).
   *
   * @param childId  Zigbee CID of the target sub-device
   * @param dps      DP values to set
   */
  updateChild(childId: string, dps: Record<string, unknown>): void {
    if (!ChildPayloadUtility.isValidCid(childId)) {
      this.log.warn(`updateChild called with invalid CID "${childId}"`);
      return;
    }
    const version = this.context.version as SupportedChildProtocol;
    if (version !== '3.3' && version !== '3.4' && version !== '3.5') {
      this.log.warn(`updateChild: protocol ${version} is not supported for Zigbee child routing`);
      return;
    }
    const childPayload = ChildPayloadUtility.prepareChildPayload(childId, dps, version);
    this._sendRaw(childPayload);
  }

  /**
   * Query the current state of a Zigbee child device via this gateway connection.
   *
   * @param childId  Zigbee CID of the target sub-device
   */
  queryStateChild(childId: string): void {
    if (!ChildPayloadUtility.isValidCid(childId)) {
      this.log.warn(`queryStateChild called with invalid CID "${childId}"`);
      return;
    }
    const version = this.context.version as SupportedChildProtocol;
    if (version !== '3.3' && version !== '3.4' && version !== '3.5') {
      this.log.warn(`queryStateChild: protocol ${version} is not supported for Zigbee child routing`);
      return;
    }
    const queryPayload = ChildPayloadUtility.prepareChildQueryPayload(childId, version);
    this._sendRaw(queryPayload);
  }

  // ── Private: standard DPS send (non-child path) ───────────────────────────

  private _sendDps(dps: Record<string, unknown>): void {
    const t = Math.floor(Date.now() / 1000).toString();

    let cmd: number;
    let data: unknown;

    if (this.context.version === '3.4' || this.context.version === '3.5') {
      cmd = 13;
      data = {
        data: {
          devId: this.context.id,
          uid: '',
          dps,
          ctype: 0,
        },
        protocol: 5,
        t,
      };
    } else {
      cmd = 7;
      data = { devId: this.context.id, uid: '', t, dps };
    }

    this._send({ cmd, data });
  }

  /**
   * Send an arbitrary JSON payload through this connection (used for child routing).
   * The payload is serialised as-is without DP wrapping.
   */
  private _sendRaw(payload: Record<string, unknown>): void {
    const cmd = (this.context.version === '3.4' || this.context.version === '3.5') ? 13 : 7;
    this._send({ cmd, data: payload });
  }

  /** Request current state from device (cmd=10 for v3.1-3.3, cmd=16 for v3.4-3.5). */
  queryState(): void {
    this._send({
      cmd: (this.context.version === '3.4' || this.context.version === '3.5') ? 16 : 10,
      data: { gwId: this.context.id, devId: this.context.id },
    });
  }

  // ── Private: connect / lifecycle ──────────────────────────────────────────

  private _connect(): void {
    this._clearTimers();
    this.cachedBuffer = Buffer.allocUnsafe(0);
    this.sessionKey = undefined;
    this.tmpLocalKey = undefined;
    this.tmpRemoteKey = undefined;
    this.connected = false;
    this.connectionAttempts++;

    const sock = net.createConnection({
      host: this.context.ip,
      port: this.context.port!,
    });
    this.socket = sock;

    sock.setKeepAlive(true);
    sock.setNoDelay(true);

    this.connTimeout = setTimeout(() => {
      const msg = `timeout ${this.context.connectTimeout!}s ${this.context.ip}:${this.context.port} proto=${this.context.version}`;
      this._reportError(new Error(msg));
    }, this.context.connectTimeout! * 1000);
    this.connTimeout.unref?.();

    sock.on('connect', () => {
      if (this.context.version !== '3.4' && this.context.version !== '3.5') {
        clearTimeout(this.connTimeout);
        this.connected = true;
        this.emit('connect');
        this._schedulePing();
        this.queryState();
      }
    });

    sock.on('ready', () => {
      if (this.context.version === '3.4' || this.context.version === '3.5') {
        clearTimeout(this.connTimeout);
        // Begin 3-way key exchange
        this.tmpLocalKey = crypto.randomBytes(16);
        this._send({ cmd: 3, data: this.tmpLocalKey, encrypted: true });
      }
    });

    sock.on('data', (chunk: Buffer) => {
      this.cachedBuffer = Buffer.concat([this.cachedBuffer, chunk]);
      this._drainBuffer();
    });

    sock.on('error', (err: Error) => {
      const connInfo = `${this.context.name} (${this.context.id} @ ${this.context.ip}, proto=${this.context.version})`;
      this.log.warn(`Socket error for ${connInfo}: ${err.message}`);
      this.emit('error', err);
      clearTimeout(this.connTimeout);
      if (!this.errorReconnect) {
        const delay = Math.min(30000, 1000 * Math.min(this.connectionAttempts, 10));
        this.errorReconnect = setTimeout(() => {
          this.errorReconnect = undefined;
          this._connect();
        }, delay);
        this.errorReconnect.unref?.();
      }
    });

    sock.on('close', () => {
      this.connected = false;
      this.sessionKey = undefined;
      this.emit('disconnect');
      this.socket = undefined;
    });

    sock.on('end', () => {
      this.connected = false;
      this.sessionKey = undefined;
      this.log.info(`Disconnected from ${this.context.name ?? this.context.id}`);
    });
  }

  private _reportError(err: Error): void {
    // Prefer LocalDevice error stream, then socket stream, and fall back to internal logging.
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
      return;
    }

    if (this.socket && typeof this.socket.listenerCount === 'function' && this.socket.listenerCount('error') > 0) {
      this.socket.emit('error', err);
      return;
    }

    // No listener attached, avoid throwing in process, but keep device state consistent
    this.log.warn(err.message);
    this.disconnect();
  }

  private _clearTimers(): void {
    if (this.pinger) {
      clearTimeout(this.pinger); this.pinger = undefined;
    }
    if (this.connTimeout) {
      clearTimeout(this.connTimeout); this.connTimeout = undefined;
    }
    if (this.errorReconnect) {
      clearTimeout(this.errorReconnect); this.errorReconnect = undefined;
    }
  }

  private _schedulePing(): void {
    if (this.pinger) {
      clearTimeout(this.pinger);
      this.pinger = undefined;
    }

    const primaryDelay = (this.context.pingGap ?? 20) * 1000;
    this.pinger = setTimeout(() => {
      this._send({ cmd: 9 });

      if (this.pinger) {
        clearTimeout(this.pinger);
      }

      this.pinger = setTimeout(() => {
        const msg = `ping timeout – no response within 5s for ${this.context.name} (${this.context.ip})`;
        this._reportError(new Error(msg));
      }, 5000);
      this.pinger.unref?.();
    }, primaryDelay);

    this.pinger.unref?.();
  }

  // ── Private: frame parsing ────────────────────────────────────────────────

  private _drainBuffer(): void {
    // Keep consuming complete frames until the buffer is exhausted
    while (true) {
      if (!this.protocol.isFrameComplete(this.cachedBuffer)) {
        break;
      }

      const extracted = this.protocol.extractFrame(this.cachedBuffer);
      if (!extracted) {
        break;
      }

      this.cachedBuffer = Buffer.from(extracted.remaining);
      this._handleFrame(extracted.frame);
    }
  }

  private _handleFrame(frame: Buffer): void {
    const decoded = this.protocol.decodeFrame(frame, this.context.key, this.sessionKey);
    if (!decoded) {
      this.log.debug(`Failed to decode frame for ${this.context.name} (frame_size=${frame.length}, proto=${this.context.version})`);
      return;
    }

    const { cmd, payload } = decoded;

    // Handle version-specific control commands
    if (cmd === 9) {
      // Pong
      this._schedulePing();
      return;
    }

    if (cmd === 7 || cmd === 13) {
      // Echo of our own command, ignore
      return;
    }

    if (cmd === 4) {
      // Key exchange response
      this._handleKeyExchangeResponse(payload);
      return;
    }

    // Regular data update
    if ((cmd === 8 || cmd === 10 || cmd === 16) && payload) {
      try {
        let payloadStr = payload.toString('utf8');
        // Strip version headers if present
        if (payloadStr.startsWith('3.')) {
          payloadStr = payloadStr.slice(15);
        }
        const data = JSON.parse(payloadStr) as Record<string, unknown>;

        // ── Zigbee child routing ──────────────────────────────────────────────
        const childData = ChildPayloadUtility.extractChildData(data);
        if (childData) {
          const childDevice = this.children.get(childData.childId.toLowerCase());
          if (childDevice) {
            childDevice._change(childData.dps);
          } else {
            this.log.debug(
              `Gateway ${this.context.id}: received update for unknown child CID ${childData.childId}`,
            );
          }
          return; // do not apply CID payloads to the parent's own state
        }
        // ─────────────────────────────────────────────────────────────────────

        if (data?.dps) {
          this._change(data.dps as Record<string, unknown>);
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.debug(`Failed to parse payload for ${this.context.name} (proto=${this.context.version}): ${err}`);
      }
    }
  }

  private _handleKeyExchangeResponse(payload: Buffer): void {
    if (payload.length < 48) {
      this.log.warn(`Invalid key exchange response for ${this.context.name} (${this.context.ip}) – size=${payload.length}, expected ≥48`);
      return;
    }

    this.tmpRemoteKey = payload.subarray(0, 16);
    const expHmac = payload.slice(16, 48).toString('hex');
    const calcHmac = hmac(this.tmpLocalKey!, this.context.key).toString('hex');

    if (calcHmac !== expHmac) {
      this.log.warn(`Key exchange HMAC mismatch for ${this.context.name}`);
      return;
    }

    // Send confirmation: HMAC(remoteNonce, realKey)
    this._send({ cmd: 5, data: hmac(this.tmpRemoteKey, this.context.key), encrypted: true });

    // Derive session key: AES-ECB-encrypt(localNonce XOR remoteNonce, realKey) [no padding]
    const sk = Buffer.from(this.tmpLocalKey!);
    for (let i = 0; i < sk.length; i++) {
      sk[i] ^= this.tmpRemoteKey![i];
    }

    // Session key derivation depends on version
    if (this.context.version === '3.4') {
      this.sessionKey = encryptECBNoPad(sk, this.context.key);
    } else if (this.context.version === '3.5') {
      // For v3.5, use GCM encrypt with IV=localNonce[:12]
      const iv = this.tmpLocalKey!.subarray(0, 12);
      const { ciphertext } = encryptGCM(sk, this.context.key, iv);
      this.sessionKey = ciphertext.subarray(0, 16);
    }

    this.connected = true;
    this._schedulePing();
    this.emit('connect');
    this.queryState();
  }

  /** @internal Used by gateway to propagate child state updates. */
  _change(dps: Record<string, unknown>): void {
    const changes: Record<string, unknown> = {};
    for (const [dp, val] of Object.entries(dps)) {
      if (this.state[dp] !== val) {
        changes[dp] = val;
        this.state[dp] = val;
      }
    }
    if (Object.keys(changes).length > 0) {
      this.emit('change', changes, { ...this.state });
    }
  }

  // ── Private: send ─────────────────────────────────────────────────────────

  private _send(o: { cmd: number; data?: unknown; encrypted?: boolean }): void {
    if (!this.socket) {
      return;
    }

    this.sendCounter++;
    const { cmd, data } = o;

    // Prepare data payload
    let dataBuffer: Buffer = Buffer.alloc(0);
    if (data instanceof Buffer) {
      dataBuffer = data;
    } else if (data) {
      dataBuffer = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    }

    // Use protocol handler to encode frame
    try {
      const frame = this.protocol.encodeFrame(cmd, dataBuffer, this.sendCounter, this.sessionKey, this.context.key);
      this.socket.write(frame);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.debug(`Failed to encode frame for ${this.context.name}: ${msg}`);
    }
  }
}
