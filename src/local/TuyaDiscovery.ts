import crypto from 'crypto';
import dgram from 'dgram';
import EventEmitter from 'events';
import Logger from '../shared/util/Logger';
import { PrefixLogger } from '../shared/util/Logger';

const UDP_KEY = Buffer.from('6c1ec8e2bb9bb59ab50b0daf649b410a', 'hex');
const GCM_DISCOVERY_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn').digest();

export interface DiscoveryResult {
  id: string;
  ip: string;
  version: string;
  productKey?: string;
  gwType?: string;
}

type DgramServer = dgram.Socket | null;

/**
 * TuyaDiscovery – listens on UDP 6666 / 6667 (v3.1–3.4) and 7000 (v3.5)
 * for Tuya local broadcast packets and emits 'discover' events.
 */
export default class TuyaDiscovery extends EventEmitter {

  private servers: Record<number, DgramServer> = {};
  private running = false;
  private discovered: Map<string, string> = new Map(); // id → ip

  public log: Logger;

  constructor(
    parentLog: Logger,
    private debug = false,
  ) {
    super();
    this.log = new PrefixLogger(parentLog, 'TuyaDiscovery', debug);
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this._start(6666);
    this._start(6667);
    this._start(7000);
    this._sendV35Probe();
  }

  stop(): void {
    this.running = false;
    for (const port of [6666, 6667, 7000]) {
      this._stop(port);
    }
  }

  end(): void {
    this.stop();
    process.nextTick(() => {
      // Remove all listeners except those listening for 'end'
      const endListeners = this.listeners('end');
      this.removeAllListeners();

      // Re-add the 'end' listeners
      for (const listener of endListeners) {
        this.once('end', listener as any);
      }

      this.discovered.clear();
      this.log.info('Discovery ended.');
      this.emit('end');
    });
  }

  clear(): void {
    this.discovered.clear();
  }

  private _start(port: number): void {
    this._stop(port);
    const server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.servers[port] = server;

    server.on('error', (err: NodeJS.ErrnoException) => this._onError(port, err));
    server.on('close', () => this._onClose(port));
    server.on('message', (msg, info) => this._onMessage(port, msg, info));

    server.bind(port, () => {
      this.log.info(`Discovery started on port ${port}.`);
      server.unref(); // Allow process to exit even if socket is listening
    });
  }

  private _stop(port: number): void {
    if (this.servers[port]) {
      try {
        this.servers[port]!.removeAllListeners();
        this.servers[port]!.close();
      } catch { /* already closed */ }
      this.servers[port] = null;
    }
  }

  private _onError(port: number, err: NodeJS.ErrnoException): void {
    this._stop(port);
    if (err.code === 'EADDRINUSE') {
      this.log.warn(`Port ${port} in use, retrying in 15s.`);
      setTimeout(() => {
        if (this.running) {
          this._start(port);
        }
      }, 15000);
    } else {
      this.log.error(`Port ${port} error: ${err.message}`);
    }
  }

  private _onClose(port: number): void {
    this._stop(port);
    this.log.info(`Port ${port} closed.${this.running ? ' Restarting...' : ''}`);
    if (this.running) {
      setTimeout(() => this._start(port), 1000);
    }
  }

  private _onMessage(port: number, msg: Buffer, info: dgram.RemoteInfo): void {
    if (msg.length < 8) {
      return;
    }
    const prefix = msg.readUInt32BE(0);
    const suffix = msg.readUInt32BE(msg.length - 4);
    if (prefix === 0x000055aa && suffix === 0x0000aa55) {
      this._handleV34(msg, port, info);
    } else if (prefix === 0x00006699 && suffix === 0x00009966) {
      this._handleV35(msg, port, info);
    }
  }

  private _handleV34(pkt: Buffer, port: number, info: dgram.RemoteInfo): void {
    const len = pkt.length;
    const size = pkt.readUInt32BE(12);
    if (len - size < 8) {
      this.log.error(`UDP v3.x from ${info.address}:${port} – bad packet size (len=${len}, size=${size}).`);
      return;
    }

    const cleanMsg = pkt.slice(len - size + 4, len - 8);
    let text: string;
    let decryptError: string | null = null;

    if (port === 6667) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-ecb', UDP_KEY, Buffer.alloc(0));
        text = decipher.update(cleanMsg, undefined, 'utf8') + decipher.final('utf8');
      } catch (e) {
        decryptError = e instanceof Error ? e.message : String(e);
        text = cleanMsg.toString('utf8');
      }
    } else {
      text = cleanMsg.toString('utf8');
    }

    try {
      const result = JSON.parse(text);
      if (result && result.gwId && result.ip) {
        this._onDiscover({
          id: result.gwId,
          ip: result.ip,
          version: result.version || '3.3',
          productKey: result.productKey,
          gwType: result.gwType,
        });
      } else if (decryptError) {
        this.log.debug(`v3.4 UDP from ${info.address}:${port} – decryption failed (${decryptError}), got JSON: ${JSON.stringify(result).slice(0, 100)}`);
      }
    } catch (e) {
      const parseErr = e instanceof Error ? e.message : String(e);
      if (decryptError) {
        this.log.debug(`v3.4 UDP from ${info.address}:${port} – decryption failed (${decryptError}), JSON parse also failed: ${parseErr}`);
      } else {
        this.log.debug(`Non-JSON UDP on port ${port} from ${info.address}: ${text.slice(0, 80)}`);
      }
    }
  }

  private _handleV35(pkt: Buffer, port: number, info: dgram.RemoteInfo): void {
    try {
      const len = pkt.length;
      const iv = pkt.slice(18, 30);
      const cipher = pkt.slice(30, len - 20);
      const tag = pkt.slice(len - 20, len - 4);
      const aad = pkt.slice(4, 18);

      const decipher = crypto.createDecipheriv('aes-128-gcm', GCM_DISCOVERY_KEY, iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(aad);
      let decrypted = Buffer.concat([decipher.update(cipher), decipher.final()]);

      // Remove leading 4 null bytes if present
      if (decrypted.length > 4 && decrypted.readUInt32BE(0) === 0) {
        decrypted = decrypted.slice(4);
      }

      const payload = JSON.parse(decrypted.toString('utf8').trim());
      if (payload && payload.gwId && payload.ip) {
        this._onDiscover({
          id: payload.gwId,
          ip: payload.ip,
          version: '3.5',
          productKey: payload.productKey,
          gwType: payload.gwType,
        });
      } else {
        this.log.debug(`v3.5 UDP from ${info.address}:${port} – decrypted but missing gwId/ip: ${JSON.stringify(payload).slice(0, 100)}`);
      }
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      this.log.debug(`v3.5 – failed to decrypt packet from ${info.address}:${port} (pkt_len=${pkt.length}): ${msg}`);
    }
  }

  private _onDiscover(data: DiscoveryResult): void {
    // Skip app-type broadcasts (e.g. Tuya Smart app on phones)
    if (data.gwType === 'app') {
      return;
    }

    const previous = this.discovered.get(data.id);
    if (previous && previous === data.ip) {
      return;
    } // already seen at same IP

    this.discovered.set(data.id, data.ip);
    // Format similar to tuya-plus for consistency: "Discovered Name (id) identified as Type (version)"
    const shortId = data.id.slice(-8);
    const typeInfo = data.gwType ? data.gwType : (data.productKey ? `Product(${data.productKey.slice(-6)})` : 'Unknown');
    this.log.info(`Discovered Local-${shortId} (${data.id}) identified as ${typeInfo} (${data.version})`);
    this.emit('discover', data);
  }

  /** Send a GCM-encrypted probe so v3.5 devices respond immediately. */
  private _sendV35Probe(): void {
    try {
      const socket = dgram.createSocket('udp4');
      const payload = Buffer.from('{"from":"app","ip":"255.255.255.255"}');
      const iv = crypto.randomBytes(12);
      const aad = Buffer.alloc(14);
      const cipher = crypto.createCipheriv('aes-128-gcm', GCM_DISCOVERY_KEY, iv);
      cipher.setAAD(aad);
      const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
      const tag = cipher.getAuthTag();
      const lenVal = iv.length + enc.length + tag.length;
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(lenVal, 0);

      const frame = Buffer.concat([
        Buffer.from('00006699', 'hex'),
        aad,
        lenBuf,
        iv,
        enc,
        tag,
        Buffer.from('00009966', 'hex'),
      ]);

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(frame, 7000, '255.255.255.255', () => socket.close());
      });
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      this.log.debug(`v3.5 probe failed: ${msg}`);
    }
  }
}
