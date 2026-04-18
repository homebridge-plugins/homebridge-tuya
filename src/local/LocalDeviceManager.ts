import TuyaDevice, {
  TuyaDeviceSchema,
  TuyaDeviceSchemaMode,
  TuyaDeviceSchemaType,
  TuyaDeviceStatus,
} from '../cloud/device/TuyaDevice';
import TuyaOpenAPI from '../cloud/api/TuyaOpenAPI';
import TuyaDeviceManager from '../cloud/device/TuyaDeviceManager';
import TuyaDiscovery, { DiscoveryResult } from './TuyaDiscovery';
import LocalDevice from './LocalDevice';
import { LocalConfig, LocalDeviceConfig } from './config';
import { PrefixLogger } from '../shared/util/Logger';
import Logger from '../shared/util/Logger';
import { ConfigHash } from '../shared/util/ConfigHash';
import { ZigbeeGatewayDetection, GatewayRelationship } from './ZigbeeGatewayDetection';
import {
  discoverFromCloudList,
  buildDiscoveredChildConfig,
  supportsChildDiscovery,
} from './DynamicChildDiscovery';

/**
 * Default DP-to-code mapping used when the user hasn't supplied one.
 * Keys are Tuya standard instruction codes; values are typical DP numbers.
 * This covers the most common single-switch, dimmer and RGBTW combinations.
 * Users can override via LocalDeviceConfig.dpMapping.
 */
const DEFAULT_DP_MAP: Record<string, number> = {
  switch_1: 1,
  switch_2: 2,
  switch_3: 3,
  switch_4: 4,
  bright_value: 2,
  bright_value_v2: 22,
  temp_value: 3,
  temp_value_v2: 23,
  work_mode: 2,
  colour_data: 5,
  colour_data_v2: 24,
  switch_led: 1,
  countdown_1: 9,
};

/** Inverse of DEFAULT_DP_MAP: dp number → code */
function buildDpToCodeMap(dpMapping: Record<string, number>): Record<number, string> {
  const inv: Record<number, string> = {};
  for (const [code, dp] of Object.entries(dpMapping)) {
    // Only map first code per dp (prefer explicit mappings)
    if (!(dp in inv)) {
      inv[dp] = code;
    }
  }
  return inv;
}

/**
 * LocalDeviceManager – extends TuyaDeviceManager so the existing platform code
 * can treat it (and use its `devices` array / events) without any changes.
 *
 * Uses a dummy TuyaOpenAPI so the parent class initialises without connecting
 * to the Tuya cloud.  The MQTT client created by the parent is stopped
 * immediately in the constructor.
 *
 * Local devices are represented as TuyaDevice objects with synthetic schemas
 * derived from the user-supplied (or default) dpMapping.  Status is tracked as
 * `{code, value}` pairs, making them compatible with all existing accessory
 * handlers.
 */
export default class LocalDeviceManager extends TuyaDeviceManager {

  private localDevices: TuyaDevice[] = [];
  private localConnections: Map<string, LocalDevice> = new Map();
  private discovery: TuyaDiscovery;
  private config: LocalConfig;
  private parentLog: Logger;
  private discoveryTimeout: NodeJS.Timeout | null = null;
  private rediscoveryTimeout: NodeJS.Timeout | null = null;
  private isDiscoveryActive = false;
  private discoveredInCurrentPhase: Set<string> = new Set();

  // Maps deviceId → effective dpMapping (code → dp)
  private dpMaps: Map<string, Record<string, number>> = new Map();
  // Maps deviceId → reverse dpMapping (dp → code)
  private reverseDpMaps: Map<string, Record<number, string>> = new Map();
  // Maps discovered gwId → IP (kept even after TuyaDevice created)
  private discoveredIPs: Map<string, string> = new Map();
  // Maps discovered gwId → version
  private discoveredVersions: Map<string, string> = new Map();
  // Pending local response watches to cancel superseded commands
  private pendingLocalResponseWatchers: Map<string, Array<{
    expectedDps: Set<string>;
    cleanup: () => void;
    resolve: (value: boolean) => void;
    reject: (error: Error) => void;
  }>> = new Map();

  // Config change tracker
  private configHash: ConfigHash;
  // Tracks which devices had config changes
  private configChanged: Map<string, boolean> = new Map();

  // ── Zigbee gateway/child support ──────────────────────────────────────────
  /** Parent gateway ID → GatewayRelationship (derived from config at init). */
  private gatewayRelationships: Map<string, GatewayRelationship> = new Map();
  /** Parent gateway device ID → its active LocalDevice connection. */
  private gatewayConnections: Map<string, LocalDevice> = new Map();
  // ──────────────────────────────────────────────────────────────────────────

  constructor(localConfig: LocalConfig, log: Logger, persistPath?: string) {
    // Create a minimal dummy API so the parent initialises without connecting
    const dummyLog = new PrefixLogger(log, 'LocalDummy', false);
    const dummyApi = new TuyaOpenAPI('', '', '', dummyLog);
    super(dummyApi, false);

    // Stop the MQ that the parent started
    this.mq.stop();

    this.parentLog = log;
    this.log = new PrefixLogger(log, 'LocalDeviceManager', false);
    this.config = localConfig;
    this.discovery = new TuyaDiscovery(log);
    this.configHash = new ConfigHash(persistPath || '', 'tuya-local-configs');
  }

  /**
   * Initialise discovery and register manually configured devices.
   * Returns immediately; discovery events fire asynchronously.
   */
  async initLocalDevices(): Promise<void> {
    // ── Zigbee: detect parent-child relationships before registering devices ──
    if (this.config.devices && this.config.devices.length > 0) {
      try {
        this.gatewayRelationships = ZigbeeGatewayDetection.detectFromDevices(this.config.devices);
        if (this.gatewayRelationships.size > 0) {
          for (const [parentId, rel] of this.gatewayRelationships) {
            this.log.info(
              `Zigbee gateway detected: ${parentId} has ${rel.children.length} sub-device(s): ` +
              rel.children.map(c => `${c.name} (CID=${c.cid})`).join(', '),
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`Zigbee configuration error: ${msg}`);
        // Continue without Zigbee – non-fatal for non-Zigbee devices
      }
    }

    // Register manual device entries first (non-child devices only at this stage)
    if (this.config.devices) {
      for (const cfg of this.config.devices) {
        // Skip Zigbee children here – they are set up after their parent connects
        if (ZigbeeGatewayDetection.isChild(cfg)) {
          continue;
        }
        this._registerDeviceConfig(cfg);
      }

      // Validate devices have keys if auto-discovery is disabled
      if (this.config.autoDiscoverDevices === false) {
        for (const cfg of this.config.devices) {
          if (!cfg.tuyaKey && !ZigbeeGatewayDetection.isChild(cfg)) {
            const deviceName = cfg.name || cfg.tuyaDeviceId;
            this.log.warn(
              `Local device "${deviceName}" (${cfg.tuyaDeviceId}) is missing tuyaKey ` +
              'and auto-discovery is disabled. This device will not be usable.',
            );
          }
        }
      }
    }

    // Start UDP discovery unless explicitly disabled
    if (this.config.autoDiscoverDevices !== false) {
      this.discovery.on('discover', (result: DiscoveryResult) => {
        this._onDiscovered(result);
      });
      this._startDiscoveryPhase();

      // Schedule periodic rediscovery to handle devices that go offline and return
      // (e.g., after WiFi reset or IP change)
      const rediscoverIntervalSec = this.config.rediscoverInterval ?? 900; // Default 15 minutes
      if (rediscoverIntervalSec > 0) {
        this.log.info(`Scheduling periodic device rediscovery every ${rediscoverIntervalSec} seconds`);
        this._schedulePeriodicRediscovery(rediscoverIntervalSec);
      }
    }
  }

  /** Stop discovery and disconnect all local TCP connections. */
  stopLocalDevices(): void {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
    if (this.rediscoveryTimeout) {
      clearTimeout(this.rediscoveryTimeout);
      this.rediscoveryTimeout = null;
    }
    this.discovery.stop();
    this.isDiscoveryActive = false;
    for (const ld of this.localConnections.values()) {
      ld.disconnect();
    }
    this.localConnections.clear();
    // Gateway connections are separate from localConnections
    for (const gw of this.gatewayConnections.values()) {
      gw.disconnect();
    }
    this.gatewayConnections.clear();
  }

  /** Returns ALL devices (both local shadow entries from this manager). */
  override getDevice(deviceID: string): TuyaDevice | undefined {
    return this.localDevices.find(d => d.id === deviceID);
  }

  /**
   * Send commands to a local device.
   * `commands` is the same [{code, value}] format used by the cloud API so
   * all existing accessory handlers work without modification.
   */
  override async sendCommands(deviceID: string, commands: TuyaDeviceStatus[]): Promise<unknown> {
    const dpMap = this.dpMaps.get(deviceID);
    if (!dpMap) {
      this.log.warn(`No dpMapping for local device ${deviceID}`);
      return;
    }

    const dps: Record<string, unknown> = {};
    for (const { code, value } of commands) {
      const dp = dpMap[code];
      if (dp === undefined) {
        this.log.warn(`Unknown code "${code}" for device ${deviceID}`);
        continue;
      }
      dps[String(dp)] = value;
    }

    if (Object.keys(dps).length === 0) {
      return;
    }

    // Log the command for user visibility
    const device = this.localDevices.find(d => d.id === deviceID);
    const deviceName = device?.name || deviceID;
    const commandStr = commands.map(c => `${c.code}=${c.value}`).join(', ');
    this.log.info(`[${deviceName}] Sending command (local): ${commandStr}`);

    // ── Zigbee child path ────────────────────────────────────────────────
    const childConn = this.localConnections.get(deviceID);
    if (childConn?.parentDevice) {
      // Already set up as a Zigbee child – LocalDevice.update() delegates to parent
      childConn.update(dps);
      return true;
    }
    // ─────────────────────────────────────────────────────────────────────

    let conn = this.localConnections.get(deviceID);
    if (!conn) {
      conn = this._createConnection(deviceID);
      if (!conn) {
        return;
      }
    }

    const expectedDps = new Set<string>(Object.keys(dps));
    this._cancelSupersededLocalResponseWatchers(deviceID, expectedDps);

    const shouldWaitForResponse = conn.connected === true;
    let timer: NodeJS.Timeout | null = null;
    let responsePromise: Promise<boolean> | undefined;
    let watcher: { expectedDps: Set<string>; cleanup: () => void; resolve: (value: boolean) => void; reject: (error: Error) => void; } | null = null;

    if (shouldWaitForResponse) {
      responsePromise = new Promise<boolean>((resolve, reject) => {
        const cleanup = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          conn?.removeListener('change', onChange);
          conn?.removeListener('error', onError);
          if (!watcher) {
            return;
          }
          const watchers = this.pendingLocalResponseWatchers.get(deviceID) ?? [];
          const remaining = watchers.filter(w => w !== watcher);
          if (remaining.length > 0) {
            this.pendingLocalResponseWatchers.set(deviceID, remaining);
          } else {
            this.pendingLocalResponseWatchers.delete(deviceID);
          }
        };

        const onChange = (changes: Record<string, unknown>) => {
          for (const dp of Object.keys(changes)) {
            if (expectedDps.has(dp)) {
              cleanup();
              resolve(true);
              return;
            }
          }
        };

        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };

        watcher = { expectedDps, cleanup, resolve, reject };
        const watchers = this.pendingLocalResponseWatchers.get(deviceID) ?? [];
        watchers.push(watcher);
        this.pendingLocalResponseWatchers.set(deviceID, watchers);

        timer = setTimeout(() => {
          cleanup();
          reject(new Error('Local command response timeout'));
        }, 10 * 1000);

        conn?.on('change', onChange);
        conn?.on('error', onError);
      });
    }

    conn.update(dps);

    if (!responsePromise) {
      this.log.debug(`Local device ${deviceName} is not yet connected; skipping response wait.`);
      return true;
    }

    try {
      await responsePromise;
      return true;
    } catch (error) {
      this.log.warn(`Local command timeout or error for ${deviceName}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  private _cancelSupersededLocalResponseWatchers(deviceID: string, expectedDps: Set<string>): void {
    const watchers = this.pendingLocalResponseWatchers.get(deviceID);
    if (!watchers || watchers.length === 0) {
      return;
    }

    const remaining: typeof watchers = [];
    for (const watcher of watchers) {
      let overlap = false;
      for (const dp of watcher.expectedDps) {
        if (expectedDps.has(dp)) {
          overlap = true;
          break;
        }
      }
      if (overlap) {
        watcher.cleanup();
        watcher.resolve(true);
      } else {
        remaining.push(watcher);
      }
    }

    if (remaining.length > 0) {
      this.pendingLocalResponseWatchers.set(deviceID, remaining);
    } else {
      this.pendingLocalResponseWatchers.delete(deviceID);
    }
  }

  public handleCloudStatusUpdate(deviceID: string, statusUpdates: TuyaDeviceStatus[]): void {
    const device = this.localDevices.find(d => d.id === deviceID);
    if (!device) {
      return;
    }

    const dpMap = this.dpMaps.get(deviceID) ?? {};
    const statusDps = new Set<string>();
    for (const status of statusUpdates) {
      const dp = dpMap[status.code];
      statusDps.add(dp !== undefined ? String(dp) : String(status.code));

      const existing = device.status.find(s => s.code === status.code);
      if (existing) {
        existing.value = status.value;
      } else {
        device.status.push({ code: status.code, value: status.value });
      }
    }

    const watchers = this.pendingLocalResponseWatchers.get(deviceID);
    if (!watchers || watchers.length === 0) {
      return;
    }

    const remaining: typeof watchers = [];
    for (const watcher of watchers) {
      let matched = false;
      for (const dp of watcher.expectedDps) {
        if (statusDps.has(dp)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        watcher.cleanup();
        watcher.resolve(true);
      } else {
        remaining.push(watcher);
      }
    }

    if (remaining.length > 0) {
      this.pendingLocalResponseWatchers.set(deviceID, remaining);
    } else {
      this.pendingLocalResponseWatchers.delete(deviceID);
    }

    this.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, device, statusUpdates);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Start a discovery phase (e.g. initial startup or periodic rediscovery).
   * Runs discovery for discoverTimeout seconds, then stops.
   */
  private _startDiscoveryPhase(): void {
    if (this.isDiscoveryActive) {
      return; // Discovery already running
    }

    this.isDiscoveryActive = true;
    this.discoveredInCurrentPhase.clear();
    this.log.info('Starting discovery phase');
    this.discovery.start();

    // Stop after configurable timeout (config is in seconds, default 60s)
    // Convert to milliseconds
    const timeoutMs = (this.config.discoverTimeout ?? 60) * 1000;
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
    }
    this.discoveryTimeout = setTimeout(() => {
      this.isDiscoveryActive = false;
      this.discovery.stop();

      // Report discovery results for clarity
      if (this.discoveredInCurrentPhase.size > 0) {
        this.log.info(`Ended discovery phase – rediscovered ${this.discoveredInCurrentPhase.size} device(s)`);
      } else {
        // No devices found; they may be using cached IPs from previous discovery
        const knownDevices = this.localDevices.filter(d => (d as TuyaDevice & { localKey?: string }).localKey);
        if (knownDevices.length > 0) {
          this.log.info(
            `Ended discovery phase – no new devices found (${knownDevices.length} configured device(s) using cached IP)`,
          );
        } else {
          this.log.info('Ended discovery phase – no devices found');
        }
      }

      this.discoveryTimeout = null;
    }, timeoutMs);
    this.discoveryTimeout.unref();
  }

  /**
   * Schedule periodic rediscovery to detect devices that go offline and return.
   * This helps handle WiFi resets, IP changes, and network reconnections.
   */
  private _schedulePeriodicRediscovery(intervalSec: number): void {
    if (this.rediscoveryTimeout) {
      clearTimeout(this.rediscoveryTimeout);
    }

    const intervalMs = intervalSec * 1000;
    this.rediscoveryTimeout = setTimeout(() => {
      this.log.debug('Triggering periodic device rediscovery');
      this._startDiscoveryPhase();
      // Reschedule for the next cycle
      this._schedulePeriodicRediscovery(intervalSec);
    }, intervalMs);
    this.rediscoveryTimeout.unref();
  }

  private _registerDeviceConfig(cfg: LocalDeviceConfig): void {
    if (!cfg.tuyaDeviceId) {
      const name = cfg.name ?? 'unknown';
      this.log.warn(`Skipping invalid local config entry for ${name}: missing tuyaDeviceId`);
      return;
    }

    const effectiveMap = Object.assign({}, DEFAULT_DP_MAP, cfg.dpMapping ?? {});
    this.dpMaps.set(cfg.tuyaDeviceId, effectiveMap);
    this.reverseDpMaps.set(cfg.tuyaDeviceId, buildDpToCodeMap(effectiveMap));

    const existing = this.localDevices.find(d => d.id === cfg.tuyaDeviceId);

    // Check if config has changed since last run
    // Hash the config fields that affect device behavior
    const configToHash = {
      tuyaDeviceId: cfg.tuyaDeviceId,
      name: cfg.name,
      tuyaKey: cfg.tuyaKey,
      dpMapping: cfg.dpMapping,
      switchCount: cfg.switchCount,
      outletCount: cfg.outletCount,
      protocolVersion: cfg.protocolVersion,
      category: cfg.category,
    };
    const { changed: configChanged } = this.configHash.hasConfigChanged(cfg.tuyaDeviceId, configToHash);
    this.configChanged.set(cfg.tuyaDeviceId, configChanged);

    if (configChanged && existing) {
      this.log.info(`Device ${cfg.tuyaDeviceId}: config changed, rebuilding schema`);
    }

    if (!existing) {
      const device = this._buildTuyaDevice(cfg, configChanged);
      this.localDevices.push(device);
      this.devices.push(device); // keep parent's devices array in sync
      this.emit(TuyaDeviceManager.Events.DEVICE_ADD, device);
    }
  }

  /**
   * Set up auto-detection listener to count switches from device status updates.
   * Called BEFORE conn.connect() to avoid race conditions.
   * Uses time-based accumulation to capture all switches across multiple updates.
   */
  private _setupAutoDetectionListener(deviceId: string, device: TuyaDevice, conn: LocalDevice): void {
    const cfg = this.config.devices?.find(d => d.tuyaDeviceId === deviceId);
    if (!cfg || (cfg.switchCount || cfg.outletCount)) {
      return; // Already has explicit count
    }

    this.log.debug(`[AutoDetect] Setting up auto-detection listener for ${deviceId}`);

    const detectedSwitches = new Set<number>();
    let detectionTimer: NodeJS.Timeout | null = null;

    const onStatusChange = (changes: Record<string, unknown>) => {
      this.log.debug(`[AutoDetect] Status change received for ${deviceId}: ${JSON.stringify(Object.keys(changes))}`);

      // Collect switch numbers from incoming changes
      const dpMap = this.dpMaps.get(deviceId) ?? DEFAULT_DP_MAP;
      const reverseMap = buildDpToCodeMap(dpMap);

      for (const dpStr of Object.keys(changes)) {
        const dpNum = parseInt(dpStr, 10);
        const code = reverseMap[dpNum];
        const switchMatch = code?.match(/^switch_(\d+)$/);
        if (switchMatch) {
          const switchNum = parseInt(switchMatch[1], 10);
          detectedSwitches.add(switchNum);
          this.log.debug(`[AutoDetect] Found switch_${switchNum} (dp=${dpNum}, code=${code})`);
        }
      }

      // Restart the detection timer
      if (detectionTimer) {
        clearTimeout(detectionTimer);
      }

      detectionTimer = setTimeout(() => {
        // After 2 seconds of no new switches, finalize auto-detection
        if (detectedSwitches.size > 0) {
          const detectedCount = Math.max(...Array.from(detectedSwitches));
          const switchList = Array.from(detectedSwitches).sort((a, b) => a - b).join(', ');
          this.log.info(
            `[AutoDetect] Auto-detected ${detectedCount} switch(es) for "${cfg.name}" (${deviceId}): ` +
            `switches=[${switchList}]`,
          );
          // Update device schema with detected switch count
          device.schema = this._buildSyntheticSchema(
            this.dpMaps.get(deviceId) ?? DEFAULT_DP_MAP,
            detectedCount,
          );
          (device as TuyaDevice & { switchCount?: number }).switchCount = detectedCount;
          // Auto-detection is now complete
          (device as TuyaDevice & { isAutoDetecting?: boolean }).isAutoDetecting = false;

          // Recalculate config hash since the schema has changed
          // This ensures SwitchAccessory knows to rebuild services
          const updatedConfigToHash = {
            tuyaDeviceId: cfg.tuyaDeviceId,
            name: cfg.name,
            tuyaKey: cfg.tuyaKey,
            dpMapping: cfg.dpMapping,
            switchCount: detectedCount,
            outletCount: cfg.outletCount,
            protocolVersion: cfg.protocolVersion,
            category: cfg.category,
          };
          const { changed: schemaChanged } = this.configHash.hasConfigChanged(deviceId, updatedConfigToHash);
          if (schemaChanged) {
            this.log.debug('[AutoDetect] Schema changed after auto-detection, marking config as changed');
            (device as TuyaDevice & { configChanged?: boolean }).configChanged = true;
            this.configChanged.set(deviceId, true);
          }

          // Notify the platform so configureServices() is re-run and switch_2+ services are added.
          this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, device, { schemaUpdated: true });
        } else {
          this.log.debug(`[AutoDetect] No switches detected after 2 seconds for ${deviceId}`);
        }

        // Remove listener after detection is complete
        conn.removeListener('change', onStatusChange);
      }, 2000);
    };

    // Listen for status changes (multiple events to capture all switches)
    conn.on('change', onStatusChange);
    this.log.debug(`[AutoDetect] Listener attached to connection for ${deviceId}`);
  }

  private _onDiscovered(result: DiscoveryResult): void {
    this.discoveredIPs.set(result.id, result.ip);
    this.discoveredVersions.set(result.id, result.version);
    this.discoveredInCurrentPhase.add(result.id);

    // If we already have a TuyaDevice for this ID (from manual config), update its IP
    const existing = this.localDevices.find(d => d.id === result.id);
    if (existing) {
      this.log.info(
        `Device ${result.id} (v${result.version}) rediscovered @ ${result.ip} ` +
          '– updating connection',
      );
      existing.ip = result.ip;
      // Update protocol version if not user-configured
      const typed = existing as TuyaDevice & { localVersion?: string; cfgVersion?: string };
      if (!typed.cfgVersion) {
        typed.localVersion = result.version;
      }
      // If a connection exists, reconnect with updated IP/version
      const conn = this.localConnections.get(result.id);
      if (conn) {
        conn.disconnect();
        this.localConnections.delete(result.id);
      }
      // Try to establish a connection if the device has a local key
      const localKey = (existing as TuyaDevice & { localKey?: string }).localKey;
      if (localKey) {
        this._createConnection(result.id);
      }
      return;
    }

    // New device discovered via UDP – create a placeholder TuyaDevice
    // (it won't be controllable until the user provides a tuyaKey via config)
    const device = this._buildDiscoveredDevice(result);
    this.localDevices.push(device);
    this.devices.push(device);
    const productInfo = result.productKey ? ` productKey=${result.productKey}` : '';
    this.log.info(
      `Local device discovered: ${result.id} @ ${result.ip} (v${result.version}${productInfo}) ` +
        '– add to config with tuyaKey to control',
    );
    this.emit(TuyaDeviceManager.Events.DEVICE_ADD, device);
  }

  private _buildTuyaDevice(cfg: LocalDeviceConfig, configChanged = false): TuyaDevice {
    const device = new TuyaDevice({});
    const deviceId = cfg.tuyaDeviceId ?? '';
    device.id = deviceId;
    device.uuid = deviceId;
    device.name = cfg.name ?? `LocalDevice-${deviceId ? deviceId.slice(0, 8) : 'unknown'}`;
    device.category = cfg.category ?? 'unknown';
    device.ip = cfg.ip ?? (deviceId ? this.discoveredIPs.get(deviceId) ?? '' : '');
    device.online = false;
    device.product_id = '';
    device.product_name = 'Local Device';
    device.model = '';
    device.icon = '';
    device.owner_id = '';
    device.lat = '';
    device.lon = '';
    device.time_zone = '';
    device.create_time = 0;
    device.active_time = 0;
    device.update_time = 0;
    device.status = [];
    const switchCount = cfg.switchCount ?? cfg.outletCount ?? 1;
    const autoDetectNote = !cfg.switchCount && !cfg.outletCount && cfg.tuyaKey ? ' (auto-detecting on connect)' : '';
    const isAutoDetecting = !!(cfg.tuyaKey && !cfg.switchCount && !cfg.outletCount);
    this.log.info(`Building synthetic schema for ${cfg.name} with switchCount=${switchCount}${autoDetectNote}`);
    device.schema = this._buildSyntheticSchema(
      Object.assign({}, DEFAULT_DP_MAP, cfg.dpMapping ?? {}),
      switchCount,
    );
    this.log.info(`Device "${cfg.name}" schema includes ${device.schema.length} codes: ${device.schema.map(s => s.code).join(', ')}`);
    // Store local-specific metadata directly on the device object for later use
    (device as TuyaDevice & { localKey?: string }).localKey = cfg.tuyaKey;
    (device as TuyaDevice & { localIp?: string }).localIp = cfg.ip;
    (device as TuyaDevice & { localVersion?: string }).localVersion =
      cfg.protocolVersion ?? this.discoveredVersions.get(cfg.tuyaDeviceId);
    // Track whether version was user-configured (prevents overwrite on re-discovery)
    (device as TuyaDevice & { cfgVersion?: string }).cfgVersion = cfg.protocolVersion;
    (device as TuyaDevice & { isLocal: boolean }).isLocal = true;
    (device as TuyaDevice & { switchCount?: number }).switchCount = switchCount;
    (device as TuyaDevice & { isAutoDetecting?: boolean }).isAutoDetecting = isAutoDetecting;
    // Track whether config changed (used by SwitchAccessory to decide whether to remove cached extras)
    (device as TuyaDevice & { configChanged?: boolean }).configChanged = configChanged;
    return device;
  }

  private _buildDiscoveredDevice(result: DiscoveryResult): TuyaDevice {
    const device = new TuyaDevice({});
    device.id = result.id;
    device.uuid = result.id;
    device.name = `Local-${result.id.slice(0, 8)}`;
    device.category = 'unknown';
    device.ip = result.ip;
    device.online = false;
    device.product_id = result.productKey ?? '';
    device.product_name = 'Local Device';
    device.model = '';
    device.icon = '';
    device.owner_id = '';
    device.lat = '';
    device.lon = '';
    device.time_zone = '';
    device.create_time = 0;
    device.active_time = 0;
    device.update_time = 0;
    device.status = [];
    device.schema = [];
    (device as TuyaDevice & { isLocal: boolean }).isLocal = true;
    (device as TuyaDevice & { localVersion?: string }).localVersion = result.version;
    return device;
  }

  private _buildSyntheticSchema(dpMapping: Record<string, number>, switchCount = 1): TuyaDeviceSchema[] {
    // If switchCount is limited, filter switch-related entries to only the needed ones
    let filteredMapping = dpMapping;
    if (switchCount > 0) {
      // Only include switch_1 through switch_N where N = switchCount
      // Also exclude other switch variants (like switch_led, switch_inching) if limited
      filteredMapping = {};
      const switchCodes: string[] = [];
      for (const [code, dp] of Object.entries(dpMapping)) {
        // Keep non-switch DPs (brightness, temp, color, etc.)
        if (!code.startsWith('switch')) {
          filteredMapping[code] = dp;
        }
        // For switches, only include switch_1..switch_N
        const switchMatch = code.match(/^switch_(\d+)$/);
        if (switchMatch) {
          const switchNum = parseInt(switchMatch[1], 10);
          if (switchNum <= switchCount) {
            filteredMapping[code] = dp;
            switchCodes.push(code);
          }
        }
      }
      if (switchCodes.length < Object.keys(dpMapping).filter(k => k.startsWith('switch')).length) {
        this.log.debug(`Filtered switches: kept [${switchCodes.join(', ')}], excluded others`);
      }
    }

    return Object.keys(filteredMapping).map(code => ({
      code,
      mode: TuyaDeviceSchemaMode.READ_WRITE,
      type: TuyaDeviceSchemaType.Boolean, // best-effort default; handlers may override
      property: {},
    }));
  }

  private _createConnection(deviceID: string): LocalDevice | undefined {
    const device = this.localDevices.find(d => d.id === deviceID);
    if (!device) {
      return undefined;
    }

    const localKey = (device as TuyaDevice & { localKey?: string }).localKey;
    if (!localKey) {
      this.log.warn(`No tuyaKey configured for local device ${deviceID} — cannot connect.`);
      return undefined;
    }

    const ip = device.ip || (device as TuyaDevice & { localIp?: string }).localIp;
    if (!ip) {
      this.log.warn(`No IP known for local device ${deviceID} — cannot connect.`);
      return undefined;
    }

    const version: string =
      (device as TuyaDevice & { localVersion?: string }).localVersion
      ?? this.discoveredVersions.get(deviceID)
      ?? '3.3';

    const conn = new LocalDevice(
      {
        id: deviceID,
        key: Buffer.from(localKey, 'utf8'),
        ip,
        version,
        name: device.name,
      },
      this.parentLog,
    );

    conn.on('connect', () => {
      device.online = true;
      this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, device, { online: true });
      // ── Zigbee: when a gateway connects, set up its children ──
      if (this.gatewayRelationships.has(deviceID)) {
        this.gatewayConnections.set(deviceID, conn);
        this._setupZigbeeChildren(deviceID, conn);
      }
    });

    conn.on('disconnect', () => {
      device.online = false;
      this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, device, { online: false });
    });

    conn.on('change', (changes: Record<string, unknown>) => {
      const reverseMap = this.reverseDpMaps.get(deviceID) ?? {};
      const statusUpdates: TuyaDeviceStatus[] = [];

      for (const [dp, val] of Object.entries(changes)) {
        const code = reverseMap[parseInt(dp, 10)] ?? dp;
        // Update device.status array
        const existing = device.status.find(s => s.code === code);
        if (existing) {
          existing.value = val as string | number | boolean;
        } else {
          device.status.push({ code, value: val as string | number | boolean });
        }
        statusUpdates.push({ code, value: val as string | number | boolean });
      }

      if (statusUpdates.length > 0) {
        this.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, device, statusUpdates);
      }
    });

    conn.on('error', (err: Error) => {
      this.log.warn(`Error for local device ${deviceID}: ${err.message}`);
    });

    // Set up auto-detection listener BEFORE connecting to avoid race conditions
    this._setupAutoDetectionListener(deviceID, device, conn);

    conn.connect();
    this.localConnections.set(deviceID, conn);

    return conn;
  }

  /**
   * After a Zigbee gateway connects, configure all its child sub-devices.
   * Each child gets a lightweight LocalDevice whose update() call delegates
   * to the parent, with the CID embedded in the payload.
   *
   * If a child connection already exists (e.g. after a gateway reconnect),
   * re-link it to the parent and restore its connected state.
   */
  private _setupZigbeeChildren(parentId: string, parentConn: LocalDevice): void {
    const rel = this.gatewayRelationships.get(parentId);
    if (!rel) {
      return;
    }

    for (const entry of rel.children) {
      const existingConn = this.localConnections.get(entry.deviceId);
      if (existingConn && existingConn.parentDevice) {
        // Child connection already exists – re-bind to new parent connection
        this._reconnectZigbeeChild(entry.deviceId, entry.cid, existingConn, parentConn);
      } else {
        // New child – set up from scratch
        this._setupZigbeeChild(entry.deviceId, entry.cid, parentConn);
      }
    }
  }

  /**
   * Re-bind an existing Zigbee child connection to a newly reconnected parent gateway.
   * Preserves the child's state and event listeners while updating the parent reference.
   */
  private _reconnectZigbeeChild(childDeviceId: string, cid: string, childConn: LocalDevice, newParentConn: LocalDevice): void {
    const childTuyaDevice = this.localDevices.find(d => d.id === childDeviceId);
    if (!childTuyaDevice) {
      this.log.warn(`Zigbee child ${childDeviceId}: TuyaDevice not found during reconnect`);
      return;
    }

    // Update parent reference and CID
    childConn.parentDevice = newParentConn;
    childConn.childId = cid;
    newParentConn.children.set(cid, childConn);

    // Mark child as connected (mirrors parent state)
    childConn.connected = true;

    this.log.info(`Zigbee child ${childDeviceId} (CID=${cid}): re-linked to parent on reconnect`);

    // Notify that device is now online
    childTuyaDevice.online = true;
    this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, childTuyaDevice, { online: true });

    // Request fresh state from child via parent
    newParentConn.queryStateChild(cid);
  }

  /**
   * Set up a single Zigbee child device.
   * Registers the child's TuyaDevice (if not already done), links it to the
   * parent LocalDevice connection, and subscribes to status updates.
   */
  private _setupZigbeeChild(childDeviceId: string, cid: string, parentConn: LocalDevice): void {
    const cfg = this.config.devices?.find(d => d.tuyaDeviceId === childDeviceId);
    if (!cfg) {
      this.log.warn(`Zigbee child config not found for device ${childDeviceId}`);
      return;
    }

    // Check if child has per-child overrides for DP mapping or category
    const effectiveChildCfg = { ...cfg };
    if (cfg.childDpMapping) {
      effectiveChildCfg.dpMapping = cfg.childDpMapping;
      this.log.debug(`Zigbee child ${childDeviceId}: using per-child DP mapping override`);
    }
    if (cfg.childCategory) {
      effectiveChildCfg.category = cfg.childCategory;
      this.log.debug(`Zigbee child ${childDeviceId}: using per-child category override`);
    }

    // Register TuyaDevice if not already present
    if (!this.localDevices.find(d => d.id === childDeviceId)) {
      this._registerDeviceConfig(effectiveChildCfg);
    }

    const childTuyaDevice = this.localDevices.find(d => d.id === childDeviceId);
    if (!childTuyaDevice) {
      this.log.warn(`Could not build TuyaDevice for Zigbee child ${childDeviceId}`);
      return;
    }

    // Create a lightweight LocalDevice for the child (no socket of its own)
    const childConn = new LocalDevice(
      {
        id: childDeviceId,
        key: parentConn['context'].key,
        ip: parentConn['context'].ip,
        version: parentConn['context'].version,
        name: cfg.name ?? childDeviceId,
      },
      this.parentLog,
    );
    // Link parent ↔ child
    childConn.parentDevice = parentConn;
    childConn.childId = cid;
    parentConn.children.set(cid, childConn);

    // Mark child as connected immediately (it's online whenever parent is)
    childConn.connected = true;

    childConn.on('disconnect', () => {
      childTuyaDevice.online = false;
      this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, childTuyaDevice, { online: false });
    });

    childConn.on('change', (changes: Record<string, unknown>) => {
      const reverseMap = this.reverseDpMaps.get(childDeviceId) ?? {};
      const statusUpdates: TuyaDeviceStatus[] = [];

      for (const [dp, val] of Object.entries(changes)) {
        const code = reverseMap[parseInt(dp, 10)] ?? dp;
        const existing = childTuyaDevice.status.find(s => s.code === code);
        if (existing) {
          existing.value = val as string | number | boolean;
        } else {
          childTuyaDevice.status.push({ code, value: val as string | number | boolean });
        }
        statusUpdates.push({ code, value: val as string | number | boolean });
      }

      if (statusUpdates.length > 0) {
        this.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, childTuyaDevice, statusUpdates);
      }
    });

    // Also handle the 'connect' event that parent propagation may emit
    parentConn.on('connect', () => {
      if (!childConn.connected) {
        childConn.connected = true;
        childTuyaDevice.online = true;
        this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, childTuyaDevice, { online: true });
        // Refresh child state after gateway reconnects
        parentConn.queryStateChild(cid);
      }
    });

    this.localConnections.set(childDeviceId, childConn);
    childTuyaDevice.online = true;
    this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, childTuyaDevice, { online: true });

    // Request child's current state immediately
    parentConn.queryStateChild(cid);

    this.log.info(
      `Zigbee child "${cfg.name ?? childDeviceId}" (${childDeviceId}, CID=${cid}) ` +
      `connected via gateway ${parentConn['context'].id}`,
    );
  }

  /**
   * Discover and register Zigbee children from Tuya Cloud device list.
   * If cloud API provides gateway_id field, we can auto-detect parent-child relationships
   * and create child configs without manual config.
   *
   * @param cloudDeviceList - Optional array of cloud devices with id and gateway_id fields
   */
  discoverChildrenFromCloud(cloudDeviceList?: Array<{ id: string; gateway_id?: string }>): void {
    if (!cloudDeviceList || cloudDeviceList.length === 0) {
      return;
    }

    // Find parent-child relationships from cloud metadata
    const gatewayToChildren = discoverFromCloudList(cloudDeviceList);

    if (gatewayToChildren.size === 0) {
      return;
    }

    // For each discovered parent-child relationship, ensure child config exists
    for (const [gatewayDeviceId, childDeviceIds] of gatewayToChildren) {
      const parentCfg = this.config.devices?.find(d => d.tuyaDeviceId === gatewayDeviceId);
      if (!parentCfg) {
        this.log.debug(`Cloud parent ${gatewayDeviceId}: no local config found, skipping auto-discovery`);
        continue;
      }

      // Only auto-discover for gateways that support it
      if (!supportsChildDiscovery(parentCfg)) {
        continue;
      }

      for (const childDeviceId of childDeviceIds) {
        // Check if child config already exists
        const existingChildCfg = this.config.devices?.find(d => d.tuyaDeviceId === childDeviceId);
        if (existingChildCfg) {
          continue; // Already configured manually
        }

        // Auto-create child config from cloud metadata
        // Use a placeholder CID (will be replaced by LAN discovery when gateway connects)
        const placeholderCid = `00000000${childDeviceId.substring(0, 8).toLowerCase().padEnd(8, '0')}`;
        const autoChildCfg = buildDiscoveredChildConfig(
          gatewayDeviceId,
          placeholderCid,
          undefined,
          parentCfg.ip,
          parentCfg.tuyaKey,
        );
        autoChildCfg.zigbeeChildId = undefined; // Will be discovered dynamically

        if (!this.config.devices) {
          this.config.devices = [];
        }
        this.config.devices.push(autoChildCfg);

        this.log.info(
          `Zigbee child auto-discovery: registered ${childDeviceId} as child of ${gatewayDeviceId} ` +
          '(from cloud metadata)',
        );
      }
    }

    // Re-detect Zigbee relationships now that we've added auto-discovered children
    if (this.config.devices && this.config.devices.length > 0) {
      try {
        this.gatewayRelationships = ZigbeeGatewayDetection.detectFromDevices(this.config.devices);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`Re-detection of Zigbee relationships after auto-discovery failed: ${msg}`);
      }
    }
  }

  /** Connect all configured local devices eagerly (called after init). */
  connectAllDevices(): void {
    for (const device of this.localDevices) {
      const localKey = (device as TuyaDevice & { localKey?: string }).localKey;
      if (!localKey) {
        continue; // Skip if no local key configured
      }

      // Only connect if device has an explicit IP in config
      // Devices relying on auto-discovery will be connected later after discovery completes
      const localIp = (device as TuyaDevice & { localIp?: string }).localIp;
      if (!localIp) {
        this.log.debug(
          `Skipping initial connection for ${device.name} (${device.id}): ` +
          'waiting for auto-discovery to find IP address',
        );
        continue;
      }

      if (device.ip) {
        this._createConnection(device.id);
      }
    }
  }
}
