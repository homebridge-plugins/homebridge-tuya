import { PlatformConfig } from 'homebridge';
import { TuyaDeviceSchemaProperty, TuyaDeviceSchemaType } from './cloud/device/TuyaDevice';
import { LocalConfig } from './local/config';

// ── Re-export local config so consumers can import from one place ─────────────
export { LocalConfig } from './local/config';

// ── Schema overrides (cloud device per-code overrides) ────────────────────────

export interface TuyaPlatformDeviceSchemaConfig {
  code: string;
  newCode?: string;
  type?: TuyaDeviceSchemaType;
  property?: TuyaDeviceSchemaProperty;
  onGet?: string;
  onSet?: string;
  hidden?: boolean;
}

// ── Per-device override block (applies to cloud devices by ID) ────────────────

export interface TuyaPlatformDeviceConfig {
  id: string;
  category?: string;
  schema?: Array<TuyaPlatformDeviceSchemaConfig>;
  unbridged?: boolean;
  adaptiveLighting?: boolean;
  /**
   * Optional: Limit this override to a specific source.
   * Since deviceOverrides are in the options (cloud) config, they default to 'cloud' only.
   * - 'cloud': apply only to devices from Tuya Cloud (default if not specified)
   * - 'local': apply only to devices from local LAN discovery
   * - 'both': apply to devices from both sources
   */
  configFor?: TuyaPluginMode;
  garageDoorUseContactSensorForState?: boolean;
}

export interface TuyaPlatformServiceInformationConfig {
  device_id: string;
  index: number;
  manifacturer?: string;
  model?: string;
  firmwareRevision?: string;
  configuredName?: string;
}

// ── Cloud project-type 1 (Custom / IoT project) ───────────────────────────────

export interface TuyaPlatformCustomConfig {
  projectType: '1';
  endpoint: string;
  accessId: string;
  accessKey: string;
  username: string;
  password: string;
  deviceOverrides?: Array<TuyaPlatformDeviceConfig>;
  serviceInformationOverrides?: Array<TuyaPlatformServiceInformationConfig>;
  generateWeatherAccessory: boolean;
  weatherAPI: string;
  forceIPv4: boolean;
}

// ── Cloud project-type 2 (Smart Home / app login) ────────────────────────────

export interface TuyaPlatformHomeConfig {
  projectType: '2';
  endpoint?: string;
  accessId: string;
  accessKey: string;
  countryCode: number;
  username: string;
  password: string;
  appSchema: string;
  homeWhitelist?: Array<number>;
  deviceOverrides?: Array<TuyaPlatformDeviceConfig>;
  serviceInformationOverrides?: Array<TuyaPlatformServiceInformationConfig>;
  generateWeatherAccessory: boolean;
  weatherAPI: string;
  forceIPv4: boolean;
}

export type TuyaPlatformCloudConfig =
  | TuyaPlatformCustomConfig
  | TuyaPlatformHomeConfig

export interface CommonConfig {
  debug?: boolean;
  debugLevel?: string;
}

export interface RTSPCameraConfig {
  deviceId: string;
  deviceName?: string;
  rtspUrl: string;
  username?: string;
  password?: string;
}

// ── Unified top-level plugin config ──────────────────────────────────────────

/**
 * Top-level communication mode.
 *
 * - `"cloud"` — connect via Tuya Cloud API only (default)
 * - `"local"` — connect directly to devices over LAN only
 * - `"both"`  — use cloud AND local simultaneously
 */
export enum TuyaPluginMode {
  cloud =　'cloud',
  local = 'local',
  both = 'both',
}

/**
 * datasource of device.
 *
 * - `"cloud"` — Tuya Cloud API
 * - `"local"` — LAN
 */
export enum TuyaDeviceDataSource {
  cloud = 'cloud',
  local = 'local',
}

export interface TuyaPlatformConfig extends PlatformConfig {
  /**
   * Communication mode. Defaults to "cloud" for backward compatibility.
   * When set to "local" or "both", the `local` block must be present.
   * When set to "cloud" or "both", the `options` block must be present.
   */
  mode?: TuyaPluginMode;

  /** Cloud credentials — required when mode is "cloud" or "both". */
  cloud?: TuyaPlatformCloudConfig;
  /** @deprecated for JSON Schema. use TuyaPlatformConfig.cloud for backend. */
  options?: TuyaPlatformCloudConfig;

  /** Local LAN settings — required when mode is "local" or "both". */
  local?: LocalConfig;

  /** Common settings */
  common?: CommonConfig;

  /** @deprecated for JSON Schema. RTSP Camera settings. use LocalConfig.cameras for backend. */
  cameras?: Array<RTSPCameraConfig>;
}

// ── JSON-Schema validators (used by platform.ts validation) ──────────────────

export const customOptionsSchema = {
  properties: {
    endpoint: { type: 'string', format: 'url', required: true },
    accessId: { type: 'string', required: true },
    accessKey: { type: 'string', required: true },
    deviceOverrides: { 'type': 'array' },
  },
};

export const homeOptionsSchema = {
  properties: {
    accessId: { type: 'string', required: true },
    accessKey: { type: 'string', required: true },
    endpoint: { type: 'string', format: 'url' },
    countryCode: { 'type': 'integer', 'minimum': 1, required: true },
    username: { type: 'string', required: true },
    password: { type: 'string', required: true },
    appSchema: { 'type': 'string', required: true },
    homeWhitelist: { 'type': 'array' },
    deviceOverrides: { 'type': 'array' },
  },
};
