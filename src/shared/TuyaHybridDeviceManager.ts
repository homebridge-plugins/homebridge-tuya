import TuyaOpenAPI, { TuyaOpenAPIResponse } from '../cloud/api/TuyaOpenAPI';
import TuyaCloudDeviceManager from '../cloud/device/TuyaCloudDeviceManager';
import TuyaCustomDeviceManager from '../cloud/device/TuyaCustomDeviceManager';
import TuyaDevice, { TuyaDeviceStatus } from '../cloud/device/TuyaDevice';
import TuyaHomeDeviceManager from '../cloud/device/TuyaHomeDeviceManager';
import {
  LocalConfig,
  TuyaPlatformCloudConfig,
  TuyaPlatformCustomConfig,
  TuyaPlatformDeviceSchemaConfig,
  TuyaPlatformHomeConfig,
} from '../config';
import { LocalDeviceConfig } from '../local/config';
import LocalDeviceManager from '../local/LocalDeviceManager';
import TuyaDeviceManager from './TuyaDeviceManager';
import { deepClone, merge } from './util/util';

export default class TuyaHybridDeviceManager extends TuyaDeviceManager {
  private cloudDeviceManager: TuyaCloudDeviceManager;
  private localDeviceManager: LocalDeviceManager;
  constructor(
    private api: TuyaOpenAPI,
    private cloudConfig: TuyaPlatformCloudConfig,
    private localConfig: LocalConfig,
    public override debug = false,
  ) {
    super(debug);
    this.cloudDeviceManager = cloudConfig.projectType === '1' ?
      new TuyaCustomDeviceManager(this.api, this.cloudConfig as TuyaPlatformCustomConfig, debug)
      : new TuyaHomeDeviceManager(this.api, this.cloudConfig as TuyaPlatformHomeConfig, debug);
    this.localDeviceManager = new LocalDeviceManager(localConfig, debug);

    this.cloudDeviceManager!
      .on(TuyaDeviceManager.Events.DEVICE_ADD, this.mergeCloudDevice.bind(this))
      .on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.emit.bind(this, TuyaDeviceManager.Events.DEVICE_INFO_UPDATE))
      .on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.emit.bind(this, TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE))
      .on(TuyaDeviceManager.Events.DEVICE_DELETE, this.emit.bind(this, TuyaDeviceManager.Events.DEVICE_DELETE));

    this.localDeviceManager!
      .on(TuyaDeviceManager.Events.DEVICE_ADD, this.mergeLocalDevice.bind(this))
      .on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, this.emit.bind(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE))
      .on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, this.emit.bind(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE))
      .on(TuyaDeviceManager.Events.DEVICE_DELETE, this.emit.bind(TuyaDeviceManager.Events.DEVICE_DELETE));
  }

  override async pullDevices(): Promise<TuyaDevice[]> {
    this.log.debug('Initializing...');
    const cloudDevices = await this.cloudDeviceManager.pullDevices();
    // If "both" mode and we successfully got cloud devices, enrich local config
    if (0 < cloudDevices.length) {
      this.log.info('Enriching local config with cloud device details…');
      this.localConfig = await this.enrichLocalConfigFromCloud(cloudDevices, this.localConfig);
    }
    const localDevices = await this.localDeviceManager.pullDevices();
    const mergedDevices:TuyaDevice[] = [];
    for (const localDevice of localDevices) {
      const cloudDevice = cloudDevices.find(cd => cd.id === localDevice.id);
      if (cloudDevice) {
        const mergedDevice = merge(localDevice, cloudDevice);
        this.log.error(`mergedDevice:${JSON.stringify(mergedDevice)}`);
        mergedDevices.push(mergedDevice);
      } else {
        mergedDevices.push(localDevice);
      }
    }
    // Sub‑devices generally cannot be added unless their information is retrieved from the Cloud.
    mergedDevices.push(...cloudDevices.filter(cd => !mergedDevices.some(md => md.id === cd.id)));
    this.devices = mergedDevices;
    return mergedDevices;
  }

  override createDeviceConfigHash(device: TuyaDevice): string {
    return this.localDeviceManager.createDeviceConfigHash(device)
      + this.cloudDeviceManager.createDeviceConfigHash(device);
  }

  override configDevice(device: TuyaDevice): void {
    this.localDeviceManager.configDevice(device);
    this.cloudDeviceManager.configDevice(device);
  }

  override getDevice(deviceID: string): TuyaDevice | undefined {
    return this.devices.find(device => device.id === deviceID)
      || this.localDeviceManager.getDevice(deviceID)
      || this.cloudDeviceManager.getDevice(deviceID);
  }

  override getDeviceSchemaConfig(device: TuyaDevice, dpCode: string): TuyaPlatformDeviceSchemaConfig | undefined {
    return this.localDeviceManager.getDeviceSchemaConfig(device, dpCode)
      || this.cloudDeviceManager.getDeviceSchemaConfig(device, dpCode);
  }

  override async sendCommands(deviceID: string, commands: TuyaDeviceStatus[]): Promise<boolean> {
    return this.localDeviceManager.sendCommands(deviceID, commands)
      .then((value) => {
        if (!value) {
          return this.cloudDeviceManager.sendCommands(deviceID, commands);
        }
        return value;
      })
      .catch(() => this.cloudDeviceManager.sendCommands(deviceID, commands));
  }

  override async executeScene(ownerID: string, deviceID: string) : Promise<TuyaOpenAPIResponse> {
    return this.localDeviceManager.executeScene(ownerID, deviceID)
      .then((value) => {
        if (!value.success) {
          return this.cloudDeviceManager.executeScene(ownerID, deviceID);
        }
        return value;
      })
      .catch(() => this.cloudDeviceManager.executeScene(ownerID, deviceID));
  }

  override async updateInfraredRemotes(allDevices: TuyaDevice[]): Promise<void> {
    this.localDeviceManager.updateInfraredRemotes(allDevices);
    this.cloudDeviceManager.updateInfraredRemotes(allDevices);
  }

  override async getCurrentWeather(lat: string, lon: string) : Promise<TuyaOpenAPIResponse> {
    return this.localDeviceManager.getCurrentWeather(lat, lon)
      .then((value) => {
        if (!value.success) {
          return this.cloudDeviceManager.getCurrentWeather(lat, lon);
        }
        return value;
      })
      .catch(() => this.cloudDeviceManager.getCurrentWeather(lat, lon));
  }

  override enableAdaptiveLighting(device: TuyaDevice): boolean {
    return this.localDeviceManager.getDeviceConfig(device)?.adaptiveLighting
      ?? !!this.cloudDeviceManager.getDeviceConfig(device)?.adaptiveLighting;
  }

  override enableGarageDoorUseContactSensorForState(device: TuyaDevice): boolean {
    return this.localDeviceManager.enableGarageDoorUseContactSensorForState(device)
      ?? this.cloudDeviceManager.enableGarageDoorUseContactSensorForState(device);
  }

  override async retrieveDeviceRTSP(deviceID: string): Promise<string> {
    return this.localDeviceManager.retrieveDeviceRTSP(deviceID)
      .then((value) => {
        if (!value) {
          return this.cloudDeviceManager.retrieveDeviceRTSP(deviceID);
        }
        return value;
      })
      .catch(() => this.cloudDeviceManager.retrieveDeviceRTSP(deviceID));
  }

  /**
   * Enrich local device config with cloud device details (local_key, dp_codes, etc.)
   * Called during "both" mode initialization to populate local credentials from cloud API
   */
  private async enrichLocalConfigFromCloud(devices: TuyaDevice[], localConfig: LocalConfig): Promise<LocalConfig> {
    let clonedConfig = deepClone(localConfig);
    for (const device of devices) {
      try {
        // Check whether the device is one that should not operate over LAN.
        if (!LocalDeviceManager.isTargetDevice(device)) {
          this.log.debug(`Device ${device.name} (${device.id}) not operate over LAN`);
          continue;
        }
        // Skip if already manually configured in local section
        const existingConfig = clonedConfig.devices!.find(
          cfg => cfg.tuyaDeviceId === device.id || cfg.tuyaDeviceId === device.uuid,
        );
        if (existingConfig && existingConfig.tuyaKey) {
          this.log.debug(`Device ${device.name} (${device.id}) already has manual local config, skipping cloud enrichment`);
          continue;
        }

        const deviceId = device.id || device.uuid;
        const localKey = device['local_key'];
        // note: cloud device ip is not a local ip.

        const dpMapping:Record<string, number> = {};
        device.schema?.filter(s => s.dp_id !== undefined).forEach(s => dpMapping[s.code]=s.dp_id!);

        if (!deviceId) {
          this.log.warn(`Skipping enrichment for ${device.name} because cloud device ID is missing`);
          continue;
        }

        if (!localKey) {
          this.log.debug(`No local_key available for ${device.name} (${deviceId}), will use cloud-only`);
          continue;
        }

        if (existingConfig) {
          // Update existing manual config with cloud-provided local_key and optional IP
          existingConfig.tuyaKey = localKey;
          for (const [key, value] of Object.entries(existingConfig.dpMapping ?? {}) as [string, number][]) {
            dpMapping[key] = value;
          }
          this.log.info(`Enriched local config for ${device.name} (${deviceId}) with cloud-provided local_key and ip`);
        } else {
          // Create new local device config entry from cloud device details
          const localDeviceConfig: LocalDeviceConfig = {
            tuyaDeviceId: deviceId,
            tuyaKey: localKey,
            name: device.name || `LocalDevice-${deviceId.slice(0, 8)}`,
            category: device.category,
          };
          for (const [key, value] of Object.entries(localDeviceConfig.dpMapping ?? {}) as [string, number][]) {
            dpMapping[key] = value;
          }
          localDeviceConfig.dpMapping = dpMapping;

          clonedConfig.devices!.push(localDeviceConfig);
          this.log.info(`Added cloud device ${device.name} (${deviceId}) to local config with local_key`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log.warn(`Error enriching device ${device.name} (${device.id}): ${msg}`);
        // Continue with next device - this is non-fatal
      }
    }
    this.log.debug(`enrichedLocalConfig:${JSON.stringify(clonedConfig, null, 2)}`);
    return clonedConfig;
  }

  private mergeCloudDevice(cloudDevice: TuyaDevice) {
    const localDevice = this.localDeviceManager.devices.find(device => device.id === cloudDevice.id);
    if (!!localDevice) {
      const mergedDevice = merge(localDevice, cloudDevice);
      this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, mergedDevice);
    } else {
      this.emit(TuyaDeviceManager.Events.DEVICE_ADD, cloudDevice);
    }
  }

  private mergeLocalDevice(localDevice: TuyaDevice) {
    const cloudDevice = this.cloudDeviceManager.devices.find(device => device.id === localDevice.id);
    if (!!cloudDevice) {
      const mergedDevice = merge(localDevice, cloudDevice);
      this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, mergedDevice);
    } else {
      this.emit(TuyaDeviceManager.Events.DEVICE_ADD, localDevice);
    }
  }
}
