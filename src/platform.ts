import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Validator } from 'jsonschema';
import path from 'path';
import fs from 'fs';

// Cloud imports (from src/cloud/)
import TuyaDevice, { TuyaDeviceStatus } from './cloud/device/TuyaDevice';
import TuyaDeviceManager from './cloud/device/TuyaDeviceManager';
import TuyaCustomDeviceManager from './cloud/device/TuyaCustomDeviceManager';
import TuyaHomeDeviceManager from './cloud/device/TuyaHomeDeviceManager';
import TuyaOpenAPI, { LOGIN_ERROR_MESSAGES } from './cloud/api/TuyaOpenAPI';

// Local imports (from src/local/)
import LocalDeviceManager from './local/LocalDeviceManager';

// Shared imports (from src/shared/)
import AccessoryFactory from './shared/accessories/AccessoryFactory';
import BaseAccessory from './shared/accessories/BaseAccessory';
import { sanitizeName } from './shared/util/util';
import { ConfigHash } from './shared/util/ConfigHash';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  TuyaPlatformConfig,
  TuyaPlatformCloudConfigOptions,
  customOptionsSchema,
  homeOptionsSchema,
} from './config';

/** Generic API response type used throughout platform initialization */
type ApiResponse<T = any> = {
  success: boolean;
  code?: string | number;
  msg?: string;
  result?: T;
};

/**
 * TuyaPlatform — unified Homebridge platform supporting both Tuya Cloud (REST/MQTT)
 * and Tuya Local (direct LAN TCP) device communication.
 *
 * Set `mode` in your config to:
 *   "cloud"  — cloud only (default, backward-compatible)
 *   "local"  — local LAN only
 *   "both"   — cloud + local simultaneously
 */
export class TuyaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  /** Cast config to our typed shape for easy access. */
  public platformConfig = this.config as TuyaPlatformConfig;

  /** Cloud credentials block (options.projectType, accessId, etc.) */
  public options = (this.config as TuyaPlatformConfig).options as TuyaPlatformCloudConfigOptions;

  /** Active communication mode. Defaults to "cloud" for backward compatibility. */
  public mode = (this.config as TuyaPlatformConfig).mode ?? 'cloud';

  // this is used to track restored cached accessories
  public cachedAccessories: PlatformAccessory[] = [];

  /** Cloud device manager — active when mode is "cloud" or "both". */
  public deviceManager?: TuyaDeviceManager;

  /** Local device manager — active when mode is "local" or "both". */
  public localDeviceManager?: LocalDeviceManager;

  /** Config change detector (used by both local and cloud). */
  public configHash?: ConfigHash;

  /** All active accessory handler instances. */
  public accessoryHandlers: BaseAccessory[] = [];


  validate() {
    // Local-only mode does not need cloud options
    if (this.mode === 'local') {
      if (!this.platformConfig.local) {
        this.log.error('mode is "local" but no "local" config block found.');
        return false;
      }
      return true;
    }

    // Both mode requires a local block in addition to cloud options
    if (this.mode === 'both' && !this.platformConfig.local) {
      this.log.error('mode is "both" but no "local" config block found.');
      return false;
    }

    // Cloud or "both" mode requires cloud options
    let result;
    if (!this.options) {
      this.log.error('Not configured — "options" block is required for cloud mode, exit.');
      return false;
    } else if (this.options.projectType === '1') {
      result = new Validator().validate(this.options, customOptionsSchema);
    } else if (this.options.projectType === '2') {
      result = new Validator().validate(this.options, homeOptionsSchema);
    } else {
      this.log.error(`Unsupported projectType: ${this.options['projectType']}, exit.`);
      return false;
    }
    result.errors.forEach(error => this.log.error(error.stack));
    if (result.errors.length > 0) {
      return false;
    }

    if (!this.validateDeviceOverrides() || !this.validateSchema()) {
      return false;
    }

    return true;
  }

  validateDeviceOverrides() {
    if (!this.options.deviceOverrides) {
      return true;
    }

    const idMap = new Map();
    for (const item of this.options.deviceOverrides) {
      if (idMap.has(item.id)) {
        idMap.get(item.id)?.push(item);
      } else {
        idMap.set(item.id, [item]);
      }
    }
    for (const items of idMap.values()) {
      if (items.length > 1) {
        this.log.error('"deviceOverrides" conflict, "id" must be unique: %o.', items);
        return false;
      }
    }
    return true;
  }

  validateSchema() {
    if (!this.options.deviceOverrides) {
      return true;
    }

    for (const deviceOverride of this.options.deviceOverrides) {
      if (!deviceOverride.schema) {
        continue;
      }
      const idMap = new Map();
      for (const item of deviceOverride.schema) {
        if (idMap.has(item.code)) {
          idMap.get(item.code)?.push(item);
        } else {
          idMap.set(item.code, [item]);
        }
      }
      for (const items of idMap.values()) {
        if (items.length > 1) {
          this.log.error('"schema" conflict, "code" must be unique: %o.', items);
          return false;
        }
      }
    }
    return true;
  }

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {

    if (!this.validate()) {
      return;
    }

    this.log.debug('Finished initializing platform');

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.initDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    AccessoryFactory.configAccessory(this, accessory);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.cachedAccessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async initDevices() {
    const cloudEnabled = this.mode === 'cloud' || this.mode === 'both';
    const localEnabled = this.mode === 'local' || this.mode === 'both';

    // For "both" mode, initialize cloud FIRST to fetch device details for enrichment
    let cloudDevices: TuyaDevice[] | undefined;
    if (cloudEnabled && this.options && this.mode === 'both') {
      this.log.info('[Cloud] Initializing cloud device manager for hybrid mode enrichment…');
      if (this.options.projectType === '1') {
        cloudDevices = await this.initCustomProject();
      } else if (this.options.projectType === '2') {
        cloudDevices = await this.initHomeProject();
      }
    }

    // ── Local devices ────────────────────────────────────────────────────────
    if (localEnabled && this.platformConfig.local) {
      // If "both" mode and we successfully got cloud devices, enrich local config
      if (this.mode === 'both' && cloudDevices && this.deviceManager) {
        this.log.info('[Local] Enriching local config with cloud device details…');
        await this.enrichLocalConfigFromCloud(cloudDevices);
      }

      this.log.info('[Local] Initialising local device manager…');
      this.localDeviceManager = new LocalDeviceManager(
        this.platformConfig.local,
        this.log,
        this.api.user.storagePath(),
      );
      await this.localDeviceManager.initLocalDevices();
      this.localDeviceManager.connectAllDevices();

      this.localDeviceManager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device) => this.addAccessory(device, 'local'));
      this.localDeviceManager.on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.updateAccessoryInfo.bind(this));
      this.localDeviceManager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.updateAccessoryStatus.bind(this));
      this.localDeviceManager.on(TuyaDeviceManager.Events.DEVICE_DELETE, this.removeAccessory.bind(this));

      const localDevices = [...this.localDeviceManager.devices.values()];
      this.log.info(`[Local] Registered ${localDevices.length} local device(s).`);
      for (const device of localDevices) {
        this.addAccessory(device, 'local');
      }
    }

    // ── Cloud devices (if not already initialized in "both" mode) ──────────────
    if (cloudEnabled && this.options && this.mode !== 'both') {
      let devices: TuyaDevice[] | undefined;

      if (this.options.projectType === '1') {
        devices = await this.initCustomProject();
      } else if (this.options.projectType === '2') {
        devices = await this.initHomeProject();
      } else {
        this.log.warn(`Unsupported projectType: ${this.options['projectType']}.`);
      }

      if (devices && this.deviceManager) {
        // Initialize config hash tracker for cloud devices
        this.configHash = new ConfigHash(this.api.user.storagePath(), 'tuya-cloud-configs');

        // Apply device config overrides
        for (const device of devices) {
          const deviceConfig = this.getDeviceConfig(device, 'cloud');
          if (deviceConfig?.category) {
            this.log.warn('Override %o category from %o to %o', device.name, device.category, deviceConfig.category);
            device.category = deviceConfig.category;
          }
          if (deviceConfig?.unbridged) {
            this.log.warn('Unbridge %o category %o', device.name, device.category);
            device.unbridged = deviceConfig.unbridged;
          }

          // Check if config has changed since last run
          // Hash the device override fields that affect accessory structure
          const configToHash = {
            deviceId: device.id,
            customCategory: deviceConfig?.category,
            unbridged: deviceConfig?.unbridged ?? false,
            schemaOverrides: deviceConfig?.schema ? JSON.stringify(deviceConfig.schema) : undefined,
            adaptiveLighting: deviceConfig?.adaptiveLighting ?? false,
          };
          const { changed: configChanged } = this.configHash.hasConfigChanged(device.id, configToHash);
          (device as any).configChanged = configChanged;
          if (configChanged) {
            this.log.info(`[Cloud] Device config changed for "${device.name}" (${device.id}), will rebuild services`);
          }
        }

        await this.deviceManager.updateInfraredRemotes(devices);

        this.log.info(`[Cloud] Got ${devices.length} device(s) and scene(s).`);
        const file = path.join(this.api.user.persistPath(), `TuyaDeviceList.${this.deviceManager.api.tokenInfo.uid}.json`);
        this.log.info('Device list saved at %s', file);
        if (!fs.existsSync(this.api.user.persistPath())) {
          await fs.promises.mkdir(this.api.user.persistPath());
        }
        await fs.promises.writeFile(file, JSON.stringify(devices, null, 2));

        for (const device of devices) {
          this.addAccessory(device, 'cloud');
        }

        this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device) => this.addAccessory(device, 'cloud'));
        this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.updateAccessoryInfo.bind(this));
        this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.updateAccessoryStatus.bind(this));
        this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_DELETE, this.removeAccessory.bind(this));
      }
    } else if (cloudEnabled && this.mode === 'both' && cloudDevices && this.deviceManager) {
      // "both" mode: finish setting up cloud devices that were already initialized
      this.configHash = new ConfigHash(this.api.user.storagePath(), 'tuya-cloud-configs');

      // Apply device config overrides
      for (const device of cloudDevices) {
        const deviceConfig = this.getDeviceConfig(device, 'cloud');
        if (deviceConfig?.category) {
          this.log.warn('Override %o category from %o to %o', device.name, device.category, deviceConfig.category);
          device.category = deviceConfig.category;
        }
        if (deviceConfig?.unbridged) {
          this.log.warn('Unbridge %o category %o', device.name, device.category);
          device.unbridged = deviceConfig.unbridged;
        }

        // Check if config has changed since last run
        const configToHash = {
          deviceId: device.id,
          customCategory: deviceConfig?.category,
          unbridged: deviceConfig?.unbridged ?? false,
          schemaOverrides: deviceConfig?.schema ? JSON.stringify(deviceConfig.schema) : undefined,
          adaptiveLighting: deviceConfig?.adaptiveLighting ?? false,
        };
        const { changed: configChanged } = this.configHash.hasConfigChanged(device.id, configToHash);
        (device as any).configChanged = configChanged;
        if (configChanged) {
          this.log.info(`[Cloud] Device config changed for "${device.name}" (${device.id}), will rebuild services`);
        }
      }

      await this.deviceManager.updateInfraredRemotes(cloudDevices);

      this.log.info(`[Cloud] Got ${cloudDevices.length} device(s) and scene(s).`);
      const file = path.join(this.api.user.persistPath(), `TuyaDeviceList.${this.deviceManager.api.tokenInfo.uid}.json`);
      this.log.info('Device list saved at %s', file);
      if (!fs.existsSync(this.api.user.persistPath())) {
        await fs.promises.mkdir(this.api.user.persistPath());
      }
      await fs.promises.writeFile(file, JSON.stringify(cloudDevices, null, 2));

      for (const device of cloudDevices) {
        this.addAccessory(device, 'cloud');
      }

      this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device) => this.addAccessory(device, 'cloud'));
      this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.updateAccessoryInfo.bind(this));
      this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.updateAccessoryStatus.bind(this));
      if (this.localDeviceManager) {
        this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, (device, status) => {
          this.localDeviceManager?.handleCloudStatusUpdate(device.id, status);
        });
      }
      this.deviceManager.on(TuyaDeviceManager.Events.DEVICE_DELETE, this.removeAccessory.bind(this));
    }

    // Remove stale cached accessories not claimed by any device
    for (const cachedAccessory of this.cachedAccessories) {
      this.log.warn('Removing unused accessory from cache:', cachedAccessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
    }
    this.cachedAccessories = [];
  }

  getDeviceConfig(device: TuyaDevice, source?: 'local' | 'cloud') {
    if (!this.options.deviceOverrides) {
      return undefined;
    }

    // Find matching override, respecting source filtering
    // Since deviceOverrides are in the cloud config, they default to cloud-only
    const effectiveSource = source || 'cloud';
    const matches = this.options.deviceOverrides.filter(config => {
      const sourceMatch = config.source
        ? (config.source === 'both' || config.source === effectiveSource)  // explicit source
        : effectiveSource === 'cloud';                                    // default: cloud-only
      const idMatch = config.id === device.id || config.id === device.uuid ||
                      config.id === device.product_id || config.id === 'global';
      return sourceMatch && idMatch;
    });

    // Return device-specific config, then product, then global
    return matches.find(config => config.id === device.id || config.id === device.uuid) ||
           matches.find(config => config.id === device.product_id) ||
           matches.find(config => config.id === 'global');
  }

  getDeviceSchemaConfig(device: TuyaDevice, code: string, source?: 'local' | 'cloud') {
    const deviceConfig = this.getDeviceConfig(device, source);
    if (!deviceConfig || !deviceConfig.schema) {
      return undefined;
    }

    // migrate old config
    deviceConfig.schema.forEach(item => {
      if (item['oldCode']) {
        item.newCode = item.code;
        item.code = item['oldCode'];
        item['oldCode'] = undefined;
      }
    });

    // ignore case - allow both old (code) and migrated (newCode) names
    const schemaConfig = deviceConfig.schema.find(item => {
      if (!code) {
        return false;
      }
      const target = code.toString().toLowerCase();
      const legacyCode = item.code?.toString().toLowerCase();
      const migratedCode = item.newCode?.toString().toLowerCase();
      return legacyCode === target || migratedCode === target;
    });
    if (!schemaConfig) {
      return undefined;
    }

    return schemaConfig;
  }

  /**
   * Enrich local device config with cloud device details (local_key, ip, etc.)
   * Called during "both" mode initialization to populate local credentials from cloud API
   */
  async enrichLocalConfigFromCloud(devices: TuyaDevice[]): Promise<void> {
    if (!this.deviceManager || !this.platformConfig.local || !this.platformConfig.local.devices) {
      return;
    }

    // Create a map of cloud devices by ID for quick lookup
    const cloudDeviceMap = new Map<string, TuyaDevice>(devices.map(d => [d.id, d]));

    for (const device of devices) {
      try {
        // Skip if already manually configured in local section
        const existingConfig = this.platformConfig.local.devices.find(
          cfg => cfg.tuyaDeviceId === device.id || cfg.tuyaDeviceId === device.uuid
        );
        if (existingConfig && existingConfig.tuyaKey) {
          this.log.debug(`[Hybrid] Device ${device.name} (${device.id}) already has manual local config, skipping cloud enrichment`);
          continue;
        }

        // Fetch device details from cloud API (includes local_key)
        const detailRes = await this.deviceManager.getDeviceDetails(device.id);
        if (!detailRes.success || !detailRes.result) {
          this.log.debug(`[Hybrid] Could not fetch device details for ${device.name} (${device.id}) from cloud API`);
          continue;
        }

        const details = detailRes.result;
        const deviceId = device.id || device.uuid;
        const localKey = details.local_key || details.localKey;
        const ip = details.ip || details.address;

        if (!deviceId) {
          this.log.warn(`[Hybrid] Skipping enrichment for ${device.name} because cloud device ID is missing`);
          continue;
        }

        if (!localKey) {
          this.log.debug(`[Hybrid] No local_key available for ${device.name} (${deviceId}), will use cloud-only`);
          continue;
        }

        if (existingConfig) {
          // Update existing manual config with cloud-provided local_key and optional IP
          existingConfig.tuyaKey = localKey;
          if (ip) {
            existingConfig.ip = ip;
          }
          this.log.info(`[Hybrid] Enriched local config for ${device.name} (${deviceId}) with cloud-provided local_key and ip`);
        } else {
          // Create new local device config entry from cloud device details
          const localDeviceConfig: any = {
            tuyaDeviceId: deviceId,
            tuyaKey: localKey,
            name: device.name || `LocalDevice-${deviceId.slice(0, 8)}`,
            category: device.category,
          };
          if (ip) {
            localDeviceConfig.ip = ip;
          }
          if (device.product_id) {
            localDeviceConfig.productId = device.product_id;
          }

          if (!this.platformConfig.local.devices) {
            this.platformConfig.local.devices = [];
          }
          this.platformConfig.local.devices.push(localDeviceConfig);
          this.log.info(`[Hybrid] Added cloud device ${device.name} (${deviceId}) to local config with local_key`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.warn(`[Hybrid] Error enriching device ${device.name} (${device.id}): ${msg}`);
        // Continue with next device - this is non-fatal
      }
    }
  }

  async initCustomProject() {
    if (this.options.projectType !== '1') {
      return undefined;
    }

    const DEFAULT_USER = 'homebridge';
    const DEFAULT_PASS = 'homebridge';

    let res: ApiResponse<any>;
    const { endpoint, accessId, accessKey, debug, debugLevel } = this.options;
    const debugMode = debug && ((debugLevel ?? '').length > 0 ? debugLevel?.includes('api') : true);
    const api = new TuyaOpenAPI(endpoint, accessId, accessKey, this.log, 'en', debugMode);
    const deviceManager = new TuyaCustomDeviceManager(api, debugMode);

    this.log.info('Get token.');
    res = await api.getToken();
    if (res.success === false) {
      this.log.error(`Get token failed. code=${res.code}, msg=${res.msg}`);
      return undefined;
    }


    this.log.info(`Search default user "${DEFAULT_USER}"`);
    res = await api.customGetUserInfo(DEFAULT_USER);
    if (res.success === false) {
      this.log.error(`Search user failed. code=${res.code}, msg=${res.msg}`);
      return undefined;
    }


    if (!res.result.user_name) {
      this.log.info(`Default user "${DEFAULT_USER}" not exist.`);
      this.log.info(`Creating default user "${DEFAULT_USER}".`);
      res = await api.customCreateUser(DEFAULT_USER, DEFAULT_PASS);
      if (res.success === false) {
        this.log.error(`Create default user failed. code=${res.code}, msg=${res.msg}`);
        return undefined;
      }
    } else {
      this.log.info(`Default user "${DEFAULT_USER}" exists.`);
    }
    const uid = res.result.user_id;


    this.log.info('Fetching asset list.');
    res = await deviceManager.getAssetList();
    if (res.success === false) {
      this.log.error(`Fetching asset list failed. code=${res.code}, msg=${res.msg}`);
      return undefined;
    }

    const assetIDList: string[] = [];
    for (const { asset_id, asset_name } of res.result.list) {
      this.log.info(`Got asset_id=${asset_id}, asset_name=${asset_name}`);
      assetIDList.push(asset_id);
    }

    if (assetIDList.length === 0) {
      this.log.warn('Asset list is empty. exit.');
      return undefined;
    }


    this.log.info('Authorize asset list.');
    res = await deviceManager.authorizeAssetList(uid, assetIDList, true);
    if (res.success === false) {
      this.log.error(`Authorize asset list failed. code=${res.code}, msg=${res.msg}`);
      return undefined;
    }


    this.log.info(`Log in with user "${DEFAULT_USER}".`);
    res = await api.customLogin(DEFAULT_USER, DEFAULT_USER);
    if (res.success === false) {
      this.log.error(`Login failed. code=${res.code}, msg=${res.msg}`);
      if (res.code && LOGIN_ERROR_MESSAGES[res.code]) {
        this.log.error(LOGIN_ERROR_MESSAGES[res.code]);
      }
      return undefined;
    }

    this.log.info('Start MQTT connection.');
    deviceManager.mq.start();

    this.log.info('Fetching device list.');
    deviceManager.ownerIDs = assetIDList;
    const devices = await deviceManager.updateDevices(assetIDList);

    this.deviceManager = deviceManager;
    return devices;
  }

  async initHomeProject() {
    if (this.options.projectType !== '2') {
      return undefined;
    }

    let res: ApiResponse<any>;
    const { accessId, accessKey, countryCode, username, password, appSchema, endpoint, debug, debugLevel } = this.options;
    const debugMode = debug && ((debugLevel ?? '').length > 0 ? debugLevel?.includes('api') : true);
    const api = new TuyaOpenAPI(
      (endpoint && endpoint.length > 0) ? endpoint : TuyaOpenAPI.getDefaultEndpoint(countryCode),
      accessId,
      accessKey,
      this.log,
      'en',
      debugMode);
    const deviceManager = new TuyaHomeDeviceManager(api, debugMode);

    this.log.info('Log in to Tuya Cloud.');
    res = await api.homeLogin(countryCode, username, password, appSchema);
    if (res.success === false) {
      this.log.error(`Login failed. code=${res.code}, msg=${res.msg}`);
      if (res.code && LOGIN_ERROR_MESSAGES[res.code]) {
        this.log.error(LOGIN_ERROR_MESSAGES[res.code]);
      }
      return undefined;
    }

    this.log.info('Start MQTT connection.');
    deviceManager.mq.start();

    this.log.info('Fetching home list.');
    res = await deviceManager.getHomeList();
    if (res.success === false) {
      this.log.error(`Fetching home list failed. code=${res.code}, msg=${res.msg}`);
      return undefined;
    }

    const homeIDList: number[] = [];
    for (const { home_id, name } of res.result) {
      this.log.info(`Got home_id=${home_id}, name=${name}`);
      if (this.options.homeWhitelist) {
        if (this.options.homeWhitelist.includes(home_id)) {
          this.log.info(`Found home_id=${home_id} in whitelist; including devices from this home.`);
          homeIDList.push(home_id);
        } else {
          this.log.info(`Did not find home_id=${home_id} in whitelist; excluding devices from this home.`);
        }
      } else {
        homeIDList.push(home_id);
      }
    }

    if (homeIDList.length === 0) {
      this.log.warn('Home list is empty.');
    }

    this.log.info('Fetching device list.');
    deviceManager.ownerIDs = homeIDList.map(homeID =>homeID.toString());
    const devices = await deviceManager.updateDevices(homeIDList);

    this.log.info('Fetching scene list.');
    for (const homeID of homeIDList) {
      const scenes = await deviceManager.getSceneList(homeID);
      for (const scene of scenes) {
        this.log.info(`Got scene_id=${scene.id}, name=${scene.name}`);
      }
      devices.push(...scenes);
    }

    this.deviceManager = deviceManager;

    if (this.options.generateWeatherAccessory) {
      const targetDevice = devices.find(device => device.lat && device.lon);
      if (targetDevice) {
        devices.push(this.createWeatherDevice(targetDevice, res.result));
      }
    }

    return devices;
  }

  addAccessory(device: TuyaDevice, source?: 'local' | 'cloud') {
    // Apply device override config before checking if hidden
    const deviceConfig = this.getDeviceConfig(device, source);
    if (deviceConfig?.category) {
      this.log.warn('Override %o category from %o to %o', device.name, device.category, deviceConfig.category);
      device.category = deviceConfig.category;
    }
    if (deviceConfig?.unbridged) {
      this.log.warn('Unbridge %o category %o', device.name, device.category);
      device.unbridged = deviceConfig.unbridged;
    }

    if (device.category === 'hidden') {
      this.log.info('Hide Accessory:', device.name);
      return;
    }

    const uuid = this.api.hap.uuid.generate(device.id);
    const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory && !device.unbridged) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // Update context
      if (!existingAccessory.context || !existingAccessory.context.deviceID) {
        this.log.info('Update accessory context:', existingAccessory.displayName);
        existingAccessory.context.deviceID = device.id;
        this.api.updatePlatformAccessories([existingAccessory]);
      }

      // create the accessory handler for the restored accessory
      const handler = AccessoryFactory.createAccessory(this, existingAccessory, device);
      this.accessoryHandlers.push(handler);

      const index = this.cachedAccessories.indexOf(existingAccessory);
      if (index >= 0) {
        this.cachedAccessories.splice(index, 1);
      }

    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.name);

      // create a new accessory (sanitize name to conform to HAP rules)
      const safeName = sanitizeName(device.name) ?? (device.id || 'Tuya Device');
      const accessory = new this.api.platformAccessory(safeName, uuid);
      accessory.context.deviceID = device.id;

      // create the accessory handler for the newly create accessory
      const handler = AccessoryFactory.createAccessory(this, accessory, device);
      this.accessoryHandlers.push(handler);

      // link the accessory to your platform
      if (device.unbridged) {
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      } else {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      AccessoryFactory.configAccessory(this, accessory);
    }
  }

  updateAccessoryInfo(device: TuyaDevice, info) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }

    // this.log.debug('onDeviceInfoUpdate devId = %s, status = %o}', device.id, info);
    handler.onDeviceInfoUpdate(info);
  }

  updateAccessoryStatus(device: TuyaDevice, status: TuyaDeviceStatus[]) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }

    // this.log.debug('onDeviceStatusUpdate devId = %s, status = %o}', device.id, status);
    handler.onDeviceStatusUpdate(status);
  }

  removeAccessory(deviceID: string) {
    const handler = this.getAccessoryHandler(deviceID);
    if (!handler) {
      return;
    }

    const index = this.accessoryHandlers.indexOf(handler);
    if (index >= 0) {
      this.accessoryHandlers.splice(index, 1);
    }

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [handler.accessory]);
    this.log.info('Removing existing accessory from cache:', handler.accessory.displayName);
  }

  getAccessoryHandler(deviceID: string) {
    return this.accessoryHandlers.find(handler => handler.device?.id === deviceID);
  }

  createWeatherDevice(device: TuyaDevice, result: { home_id: string; name: string }[]): TuyaDevice {
    const key = `weather-${device.owner_id}`;
    const uuid = this.api.hap.uuid.generate(key);
    this.log.info(`add weather device:${key}`);
    const virtualDevice = this.deviceManager!.createVirtualDevice(device, uuid);
    virtualDevice.product_id = 'virtual-product-id-weather';
    virtualDevice.category = 'wsdcg';
    virtualDevice.name = `Weather(${result.find(home => home.home_id === device.owner_id)?.name})`;
    return virtualDevice;
  }
}

