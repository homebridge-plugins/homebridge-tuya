import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, APIEvent } from 'homebridge';
import { Validator, ValidatorResult } from 'jsonschema';
import path from 'path';
import fs from 'fs';
import { v5 as uuidv5 } from 'uuid';

// Cloud imports (from src/cloud/)
import TuyaDevice, { TuyaDeviceStatus } from './cloud/device/TuyaDevice';
import TuyaCustomDeviceManager from './cloud/device/TuyaCustomDeviceManager';
import TuyaHomeDeviceManager from './cloud/device/TuyaHomeDeviceManager';
import TuyaOpenAPI from './cloud/api/TuyaOpenAPI';

// Local imports (from src/local/)
import LocalDeviceManager from './local/LocalDeviceManager';

// Shared imports (from src/shared/)
import TuyaDeviceManager from './shared/TuyaDeviceManager';
import ConfigMigrator from './shared/util/ConfigMigrator';
import AccessoryFactory from './shared/accessory/AccessoryFactory';
import BaseAccessory from './shared/accessory/BaseAccessory';
import { sanitizeName } from './shared/util/util';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  TuyaPlatformConfig,
  TuyaPlatformCloudConfig,
  customOptionsSchema,
  homeOptionsSchema,
  TuyaPluginMode,
  TuyaPlatformCustomConfig,
  TuyaPlatformHomeConfig,
  LocalConfig,
  TuyaPlatformDeviceConfig,
} from './config';
import { initLogger } from './shared/util/Logger';
import TuyaCloudDeviceManager from './cloud/device/TuyaCloudDeviceManager';
import TuyaHybridDeviceManager from './shared/TuyaHybridDeviceManager';

export type TuyaPluginAccessoryContext = {
  deviceID: string;
  deviceConfigHash: string;
}

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
  private static readonly PLATFORM_UUID = '8CC2405F-4DB0-4586-B32F-A38CC156164D';
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  private readonly platformAccessories = new Map<string, PlatformAccessory<TuyaPluginAccessoryContext>>();

  /** platform ID */
  private platformID = uuidv5(this.config.name ?? 'TuyaPlatform', TuyaPlatform.PLATFORM_UUID);

  /** Cast config to our typed shape for easy access. */
  public platformConfig = this.config as TuyaPlatformConfig;

  /** Active communication mode. Defaults to "cloud" for backward compatibility. */
  public mode = (this.config as TuyaPlatformConfig).mode ?? TuyaPluginMode.cloud;

  /** Device manager */
  public deviceManager!: TuyaDeviceManager;

  /** All active accessory handler instances. */
  public accessoryHandlers: BaseAccessory[] = [];

  /** for writing device list */
  private tid:NodeJS.Timeout | undefined;

  /** for debug */
  public debug: boolean = false;
  public debugLevel: string | undefined;

  validate() {
    // Local-only mode does not need cloud options
    if (this.mode === TuyaPluginMode.local) {
      if (!this.platformConfig.local) {
        this.log.error('mode is "local" but no "local" config block found.');
        return false;
      }
      return true;
    }

    // Both mode requires a local block in addition to cloud options
    if (this.mode === TuyaPluginMode.both && !this.platformConfig.local) {
      this.log.error('mode is "both" but no "local" config block found.');
      return false;
    }

    // Cloud or "both" mode requires cloud options
    let result: ValidatorResult;
    if (!this.platformConfig.cloud) {
      this.log.error('Not configured — "cloud" block is required for cloud mode, exit.');
      return false;
    } else if (this.platformConfig.cloud.projectType === '1') {
      result = new Validator().validate(this.platformConfig.cloud, customOptionsSchema);
    } else if (this.platformConfig.cloud.projectType === '2') {
      result = new Validator().validate(this.platformConfig.cloud, homeOptionsSchema);
    } else {
      this.log.error(`Unsupported projectType: ${this.platformConfig.cloud['projectType']}, exit.`);
      return false;
    }
    result.errors.forEach(error => this.log.error(error.stack));
    if (result.errors.length > 0) {
      return false;
    }

    if (!this.validateDeviceOverrides(this.platformConfig.cloud.deviceOverrides!)
      || !this.validateSchema(this.platformConfig.cloud.deviceOverrides!)) {
      return false;
    }

    return true;
  }

  validateDeviceOverrides(deviceOverrides: TuyaPlatformDeviceConfig[]) {
    if (!deviceOverrides) {
      return true;
    }

    const idMap = new Map();
    for (const item of deviceOverrides) {
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

  validateSchema(deviceOverrides: TuyaPlatformDeviceConfig[]) {
    if (!deviceOverrides) {
      return true;
    }

    for (const deviceOverride of deviceOverrides) {
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
    initLogger(log);
    this.platformConfig = new ConfigMigrator(!!this.platformConfig.common?.debug).migrate(config);
    this.debug = this.platformConfig.common?.debug ?? false;
    this.debugLevel = this.platformConfig.common?.debugLevel ?? undefined;

    if (!this.validate()) {
      return;
    }

    // Error/Exception handling.
    const formatError = (e: unknown) => {
      if (e instanceof Error) {
        return `${e.message}\n${e.stack}`;
      }
      return JSON.stringify(e);
    }
    process.on('uncaughtException', (err) => {
      this.log.error('Uncaught exception: %o', formatError(err));
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.log.error('Unhandled rejection: %o', formatError(reason));
      process.exit(1);
    });

    this.log.debug('Finished initializing platform');

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.initDevices();
    });

    this.api.on(APIEvent.SHUTDOWN, async () => {
      this.log.debug('Executed shutdown callback');
      await this.saveDeviceList();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.platformAccessories.set(accessory.UUID, accessory as PlatformAccessory<TuyaPluginAccessoryContext>);
  }

  async saveDeviceList() {
    if (!this.deviceManager) {
      return;
    }
    if (this.tid !== undefined) {
      clearTimeout(this.tid);
      this.tid = undefined;
    }
    this.tid = setTimeout(async () => {
      const file = path.join(this.api.user.persistPath(), `TuyaDeviceList.${this.platformID}-${this.mode}.json`);
      this.log.info('Device list saved at %s', file);
      if (!fs.existsSync(this.api.user.persistPath())) {
        await fs.promises.mkdir(this.api.user.persistPath());
      }
      const devices = [...this.platformAccessories.values()].map(accessory => this.deviceManager.getDevice(accessory.context.deviceID));
      await fs.promises.writeFile(file, JSON.stringify(devices, null, 2));
      this.tid = undefined;
    }, 5000);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async initDevices() {
    let deviceManager!:TuyaDeviceManager;
    if (this.mode === TuyaPluginMode.cloud) {
      deviceManager = await this.initCloudMode(this.platformConfig.cloud!);
    } else if (this.mode === TuyaPluginMode.local) {
      deviceManager = await this.initLocalMode(this.platformConfig.local!);
    } else if (this.mode === TuyaPluginMode.both) {
      deviceManager = await this.initBothMode(this.platformConfig.cloud!, this.platformConfig.local!);
    }

    this.deviceManager = deviceManager;

    const devices = await this.deviceManager.pullDevices();
    this.deviceManager.updateInfraredRemotes(devices);

    for (const device of devices) {
      this.addAccessory(device);
    }

    deviceManager!.on(TuyaDeviceManager.Events.DEVICE_ADD, this.addAccessory.bind(this));
    deviceManager!.on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.updateAccessoryInfo.bind(this));
    deviceManager!.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.updateAccessoryStatus.bind(this));
    deviceManager!.on(TuyaDeviceManager.Events.DEVICE_DELETE, this.removeAccessory.bind(this));

    if (this.mode !== TuyaPluginMode.cloud) {
      // When running in local mode, a short delay is added before detecting the change.
      setTimeout(this.finishDeviceInitializing.bind(this), (this.platformConfig.local?.discoverTimeout ?? 5) * 1000);
    } else {
      this.finishDeviceInitializing();
    }
  }

  async initCloudMode(cloudConfig: TuyaPlatformCloudConfig) : Promise<TuyaCloudDeviceManager> {
    this.log.info('[Cloud] Initializing cloud device manager…');
    let deviceManager!:TuyaCloudDeviceManager;
    if (cloudConfig.projectType === '1') {
      deviceManager = await this.initCustomProject(cloudConfig as TuyaPlatformCustomConfig);
    } else if (cloudConfig.projectType === '2') {
      deviceManager = await this.initHomeProject(cloudConfig as TuyaPlatformHomeConfig);
    }
    return deviceManager;
  }

  async initLocalMode(localConfig: LocalConfig) : Promise<LocalDeviceManager> {
    this.log.info('[Local] Initializing local device manager…');
    return new LocalDeviceManager(localConfig, !!this.debug);
  }

  async initBothMode(cloudConfig: TuyaPlatformCloudConfig, localConfig: LocalConfig) : Promise<TuyaDeviceManager> {
    this.log.debug('[Hybrid] Initializing...');
    const { accessId, accessKey, endpoint, forceIPv4 } = cloudConfig;
    const debugMode = !!this.debugLevel ? this.debugLevel.includes('api') : this.debug;
    const _endpoint = (endpoint && endpoint.length > 0) ? endpoint : TuyaOpenAPI.getDefaultEndpoint(cloudConfig['countryCode']);
    const api = new TuyaOpenAPI(_endpoint, accessId, accessKey, 'en', debugMode, forceIPv4);
    return new TuyaHybridDeviceManager(api, cloudConfig, localConfig, !!this.debug);
  }

  async initCustomProject(config: TuyaPlatformCustomConfig) : Promise<TuyaCustomDeviceManager> {
    const { endpoint, accessId, accessKey, forceIPv4 } = config;
    const debugMode = !!this.debugLevel ? this.debugLevel.includes('api') : this.debug;
    const api = new TuyaOpenAPI(endpoint, accessId, accessKey, 'en', debugMode, forceIPv4);
    return new TuyaCustomDeviceManager(api, config, debugMode);
  }

  async initHomeProject(config: TuyaPlatformHomeConfig) : Promise<TuyaHomeDeviceManager> {
    const { accessId, accessKey, countryCode, endpoint, forceIPv4 } = config;
    const debugMode = !!this.debugLevel ? this.debugLevel.includes('api') : this.debug;
    const _endpoint = (endpoint && endpoint.length > 0) ? endpoint : TuyaOpenAPI.getDefaultEndpoint(countryCode);
    const api = new TuyaOpenAPI(_endpoint, accessId, accessKey, 'en', debugMode, forceIPv4);
    return new TuyaHomeDeviceManager(api, config, debugMode);
  }

  addAccessory(device: TuyaDevice) {
    if (device.category === 'hidden') {
      this.log.info('Hide Accessory:', device.name);
      return null;
    }

    const uuid = this.api.hap.uuid.generate(device.id);
    const existingAccessory = this.platformAccessories.get(uuid);
    if (existingAccessory && !device.unbridged) {
      this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);

      // create the accessory handler for the restored accessory
      const handler = AccessoryFactory.createAccessory(this, existingAccessory, device);
      this.accessoryHandlers.push(handler);

      // Always apply the user settings to ensure that any changes made after the cache was created are properly reflected.
      AccessoryFactory.configAccessory(this, existingAccessory);

      this.syncDeviceAndAccessory(device, existingAccessory);
      this.saveDeviceList();
      return existingAccessory;
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.debug('Adding new accessory:', device.name);

      // create a new accessory (sanitize name to conform to HAP rules)
      const safeName = sanitizeName(device.name) ?? (device.id || 'Tuya Device');
      const accessory = new this.api.platformAccessory<TuyaPluginAccessoryContext>(safeName, uuid);
      accessory.context.deviceID = device.id;

      // Initialize config hash tracker for device
      const currentHash = this.deviceManager.createDeviceConfigHash(device);
      accessory.context.deviceConfigHash = currentHash;

      // create the accessory handler for the newly create accessory
      const handler = AccessoryFactory.createAccessory(this, accessory, device);
      this.accessoryHandlers.push(handler);

      AccessoryFactory.configAccessory(this, accessory);

      // link the accessory to your platform
      if (device.unbridged) {
        this.log.success(`(unbridged) publish accessory: ${accessory.displayName}`);
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      } else {
        this.log.success(`publish accessory: ${accessory.displayName}`);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      this.platformAccessories.set(accessory.UUID, accessory);
      this.saveDeviceList();
      return accessory;
    }
  }

  updateAccessoryInfo(device: TuyaDevice, info: any) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }

    const accessory = this.platformAccessories.get(this.api.hap.uuid.generate(device.id))!;

    handler.onDeviceInfoUpdate(info).then(() => {
      this.syncDeviceAndAccessory(device, accessory);
    });

    this.saveDeviceList();
  }

  updateAccessoryStatus(device: TuyaDevice, status: TuyaDeviceStatus[]) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }

    // this.log.debug('onDeviceStatusUpdate devId = %s, status = %o}', device.id, status);
    handler.onDeviceStatusUpdate(status);

    // Status updates occur frequently, so the saveDeviceList process is not performed.
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

    this.saveDeviceList();

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [handler.accessory]);
    this.log.info('Removing existing accessory from cache:', handler.accessory.displayName);
    this.platformAccessories.delete(handler.accessory.UUID);
  }

  async finishDeviceInitializing() {
    // Remove stale cached accessories not claimed by any device
    for (const [uuid, accessory] of this.platformAccessories) {
      if (this.deviceManager.getDevice(accessory.context.deviceID) === undefined) {
        this.log.warn('Removing unused accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.platformAccessories.delete(uuid);
      }
    }
  }

  getAccessoryHandler(deviceID: string) {
    return this.accessoryHandlers.find(handler => handler.device?.id === deviceID);
  }

  /**
   * When device information is updated due to changes in the plugin settings,
   *  the updated data must be reflected in the accessory cache.
   * @param device
   * @param accessory
   */
  async syncDeviceAndAccessory(device:TuyaDevice, accessory: PlatformAccessory) {
    this.log.debug(`sync device to accessory cache. device: ${device.name}, accessory cache: ${accessory.displayName}`);

    // A code value used to detect changes in the plugin settings.
    const currentHash = this.deviceManager.createDeviceConfigHash(device);
    if (currentHash !== accessory.context.deviceConfigHash) {
      this.log.info(`Device config changed for "${device.name}" (${device.id}), will rebuild services`);
      accessory.context.deviceConfigHash = currentHash;

      // To reflect configuration changes without discarding the existing
      // cache instance as much as possible, the latest configuration data is created as a separate accessory.
      const cloneDevice = structuredClone(device);
      this.deviceManager.devices.push(cloneDevice);
      cloneDevice.id = 'dummyID' + cloneDevice.id;
      cloneDevice.name = 'dummy';
      let cloudConfig = this.platformConfig.cloud?.deviceOverrides?.find(i => i.id === device.id);
      let localConfig = this.platformConfig.local?.devices?.find(i => i.tuyaDeviceId === device.id);
      let serviceConfig = this.platformConfig.cloud?.serviceInformationOverrides?.find(i => i.device_id === device.id);
      if (cloudConfig) {
        cloudConfig = structuredClone(cloudConfig);
        cloudConfig.id = cloneDevice.id;
        this.platformConfig.cloud!.deviceOverrides!.push(cloudConfig);
      }
      if (localConfig) {
        localConfig = structuredClone(localConfig);
        localConfig.tuyaDeviceId = cloneDevice.id;
        this.platformConfig.local!.devices!.push(localConfig);
      }
      if (serviceConfig) {
        serviceConfig = structuredClone(serviceConfig);
        serviceConfig.device_id = cloneDevice.id;
        this.platformConfig.cloud!.serviceInformationOverrides!.push(serviceConfig);
      }
      const freshAccessory = this.addAccessory(cloneDevice);
      // The dummy item should be removed immediately.
      this.removeAccessory(cloneDevice.id);
      this.deviceManager.devices.splice(this.deviceManager.devices.indexOf(cloneDevice), 1);
      if (cloudConfig) {
        this.platformConfig.cloud!.deviceOverrides!.splice(
          this.platformConfig.cloud!.deviceOverrides!.indexOf(cloudConfig), 1,
        );
      }
      if (localConfig) {
        localConfig.tuyaDeviceId = cloneDevice.id;
        this.platformConfig.local!.devices!.splice(
          this.platformConfig.local!.devices!.indexOf(localConfig), 1,
        );
      }
      if (serviceConfig) {
        serviceConfig.device_id = cloudConfig!.id;
        this.platformConfig.cloud!.serviceInformationOverrides!.splice(
          this.platformConfig.cloud!.serviceInformationOverrides!.indexOf(serviceConfig), 1,
        );
      }

      if (freshAccessory === null) {
        // hidden
        this.removeAccessory(device.id);
        return;
      }

      const newServices = freshAccessory.services;
      const oldServices = accessory.services;

      for (const oldService of oldServices) {
        const existsInNew = newServices.some(
          newService => newService.UUID === oldService.UUID,
        );

        if (!existsInNew) {
          accessory.removeService(oldService);
          continue;
        }

        const newService = newServices.find(
          s => s.UUID === oldService.UUID,
        );

        if (!newService) {
          continue;
        }

        for (const oldChar of oldService.characteristics) {
          const existsCharInNew = newService.characteristics.some(
            newChar => newChar.UUID === oldChar.UUID,
          );

          if (!existsCharInNew) {
            oldService.removeCharacteristic(oldChar);
          }
        }
      }
    }

    this.log.success(`(update) publish accessory: ${accessory.displayName}`);
    this.api.updatePlatformAccessories([accessory]);

  }
}

