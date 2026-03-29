/**
 * Local (LAN) configuration types for homebridge-tuya unified plugin.
 */

export interface LocalConfig {
  /** Enable local LAN mode. Defaults to true. */
  enabled?: boolean;
  /** How long (ms) to listen for UDP device broadcasts on startup. Defaults to 60000. */
  discoverTimeout?: number;
  /** Auto-discover devices via UDP broadcasts. Defaults to true. */
  autoDiscoverDevices?: boolean;
  /**
   * Interval (in seconds) at which to periodically re-run device discovery.
   * This helps detect devices that go offline and return with a new IP (e.g., after a WiFi reset).
   * Set to 0 to disable periodic rediscovery. Defaults to 900 (15 minutes).
   */
  rediscoverInterval?: number;
  /**
   * Optional list of devices to connect to directly.
   * Can be used with or without autoDiscoverDevices.
   * Required when autoDiscoverDevices is false.
   */
  devices?: LocalDeviceConfig[];
}

export interface LocalDeviceConfig {
  /** 20–32 char device ID (gwId, shown in Tuya app or extracted via tuya-cli). */
  tuyaDeviceId: string;
  /** 16-byte (32 hex chars) device local key. Required to decrypt/encrypt TCP traffic. */
  tuyaKey?: string;
  /**
   * Optional static IP. If omitted, IP is auto-discovered via UDP broadcast.
   * Discovery attempts commence on plugin startup if auto-discovery is enabled.
   */
  ip?: string;
  /** Human-readable name shown in HomeKit. Defaults to id-based placeholder. */
  name?: string;
  /** Force a specific protocol version: "3.1", "3.2", "3.3", "3.4", "3.5".
   *  Leave unset for auto-detection from UDP broadcast. */
  protocolVersion?: '3.1' | '3.2' | '3.3' | '3.4' | '3.5';
  /**
   * Optional DP → code mapping so existing accessory handlers can work.
   * Keys are Tuya standard instruction codes (e.g. "switch_1", "bright_value").
   * Values are the integer DP number reported by the device.
   * Example: { "switch_1": 1, "bright_value": 2, "temp_value": 3 }
   */
  dpMapping?: Record<string, number>;
  /**
   * Override the device category for accessory type selection.
   * Uses Tuya category codes: "dj" (light), "cz" (outlet), "kt" (AC), etc.
   */
  category?: string;
  /**
   * For multi-switch/-outlet devices, limit the number of independently controllable switches.
   * If omitted, the switch count is auto-detected on first connection by counting how many
   * switch_1, switch_2, etc. DPs the device reports.
   * Defaults to 1 if detection fails or device cannot be reached initially.
   * Example: set to 2 for a 2-gang switch, 4 for a 4-outlet power board.
   */
  switchCount?: number;
  /**
   * Alias for switchCount (used for outlet/multi-outlet devices).
   * If both are specified, switchCount takes precedence.
   */
  outletCount?: number;

  // ── Zigbee / Gateway fields ───────────────────────────────────────────────

  /**
   * Mark this device as a Zigbee gateway (parent). When set, the manager
   * registers a persistent TCP connection for this device and routes child
   * commands through it. Usually auto-detected; set explicitly when needed.
   */
  isZigbeeGateway?: boolean;

  /**
   * For Zigbee sub-devices: the tuyaDeviceId of the parent gateway.
   * When set, this device does NOT open its own TCP connection; all commands
   * are routed through the parent's connection.
   */
  parentDeviceId?: string;

  /**
   * For Zigbee sub-devices: the Zigbee node ID (CID) assigned by the gateway.
   * This is a 16-character lowercase hex string, e.g. "0011223344556601".
   * Required when parentDeviceId is set.
   */
  zigbeeChildId?: string;

  /**
   * For Zigbee sub-devices: optional DP mapping override specific to this child.
   * If provided, overrides the parent's dpMapping for this child device.
   * Useful when child device DPs differ from parent or other children.
   * Example: { "switch_1": 1, "bright_value": 3 } if child uses different DP indices.
   */
  childDpMapping?: Record<string, number>;

  /**
   * For Zigbee sub-devices: optional category override specific to this child.
   * If provided, overrides the parent's category for this child device.
   * Useful when child is a different device type than the gateway.
   */
  childCategory?: string;
}
