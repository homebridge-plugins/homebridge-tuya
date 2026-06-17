import TuyaOpenAPI from '../api/TuyaOpenAPI';
import TuyaOpenMQ from '../api/TuyaOpenMQ';
import TuyaDeviceManager from '../../shared/TuyaDeviceManager';
import TuyaDevice, {
  TuyaDeviceSchema,
  TuyaDeviceSchemaMode,
  TuyaDeviceSchemaProperty,
  TuyaDeviceStatus,
  TuyaIRRemoteKeyListItem,
} from './TuyaDevice';
import { TuyaPlatformCloudConfig, TuyaPluginMode } from '../../config';
import { ConfigHash } from '../../shared/util/ConfigHash';

enum TuyaMQTTProtocol {
  DEVICE_STATUS_UPDATE = 4,
  DEVICE_INFO_UPDATE = 20,
}

export default abstract class TuyaCloudDeviceManager extends TuyaDeviceManager {
  public mq: TuyaOpenMQ;
  public ownerIDs: string[] = [];

  constructor(
    public api: TuyaOpenAPI,
    public config: TuyaPlatformCloudConfig,
    public override debug = false,
  ) {
    super(debug);

    this.mq = new TuyaOpenMQ(api);
    this.mq.addMessageListener(this.onMQTTMessage.bind(this));
  }

  override createDeviceConfigHash(device: TuyaDevice): string {
    const deviceConfig = this.getDeviceConfig(device);
    if (!deviceConfig) {
      return '';
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
    return ConfigHash.computeHash(configToHash);
  }

  override configDevice(device: TuyaDevice): void {
    const deviceConfig = this.getDeviceConfig(device);
    if (deviceConfig?.category) {
      this.log.warn('Override %o category from %o to %o', device.name, device.category, deviceConfig.category);
      device.category = deviceConfig.category;
    }
    if (deviceConfig?.unbridged) {
      this.log.warn('Unbridge %o category %o', device.name, device.category);
      device.unbridged = deviceConfig.unbridged;
    }
  }

  override enableAdaptiveLighting(device: TuyaDevice): boolean {
    return !!this.getDeviceConfig(device)?.adaptiveLighting;
  }

  override enableGarageDoorUseContactSensorForState(device: TuyaDevice): boolean {
    return this.getDeviceConfig(device)?.garageDoorUseContactSensorForState === true;
  }

  getDeviceConfig(device: TuyaDevice) {
    if (!this.config) {
      return undefined;
    }

    // Find matching override, respecting source filtering
    const matches = this.config.deviceOverrides?.filter(config => {
      const sourceMatch = config.configFor === TuyaPluginMode.cloud;
      const idMatch = config.id === device.id || config.id === device.uuid ||
                      config.id === device.product_id || config.id === 'global';
      return sourceMatch && idMatch;
    }) ?? [];

    // Return device-specific config, then product, then global
    return matches.find(config => config.id === device.id || config.id === device.uuid) ||
            matches.find(config => config.id === device.product_id) ||
            matches.find(config => config.id === 'global');
  }

  override getDevice(deviceID: string) {
    return Array.from(this.devices).find(device => device.id === deviceID);
  }

  override getDeviceSchemaConfig(device: TuyaDevice, dpCode: string) {
    const deviceConfig = this.getDeviceConfig(device);
    if (!deviceConfig || !deviceConfig.schema) {
      return undefined;
    }

    // ignore case - allow both old (code) and migrated (newCode) names
    const schemaConfig = deviceConfig.schema.find(item => {
      if (!dpCode) {
        return false;
      }
      const target = dpCode.toString().toLowerCase();
      const legacyCode = item.code?.toString().toLowerCase();
      const migratedCode = item.newCode?.toString().toLowerCase();
      return legacyCode === target || migratedCode === target;
    });
    if (!schemaConfig) {
      return undefined;
    }

    return schemaConfig;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateDevices(ownerIDs: []): Promise<TuyaDevice[]> {
    return [];
  }

  async updateDevice(deviceID: string) {

    const res = await this.getDeviceInfo(deviceID);
    if (!res.success) {
      return null;
    }

    const device = new TuyaDevice(res.result);
    device.schema = await this.getDeviceSchema(deviceID);

    const oldDevice = this.getDevice(deviceID);
    if (oldDevice) {
      this.devices.splice(this.devices.indexOf(oldDevice), 1);
    }

    this.configDevice(device);
    this.devices.push(device);

    return device;
  }

  async getDeviceInfo(deviceID: string) {
    const res = await this.api.get(`/v1.0/devices/${deviceID}`);
    return res;
  }

  async getDeviceListInfo(deviceIDs: string[] = []) {
    const res = await this.api.get('/v1.0/devices', { 'device_ids': deviceIDs.join(',') });
    return res;
  }

  async getDeviceDetails(deviceID: string) {
    const res = await this.api.getDeviceDetails(deviceID);
    return res;
  }

  async getDeviceSchema(deviceID: string) {
    // const res = await this.api.get(`/v1.2/iot-03/devices/${deviceID}/specification`);
    const res = await this.api.get(`/v1.1/devices/${deviceID}/specifications`);
    if (!res.success) {
      this.log.warn('Get device specification failed. devId = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
      return [];
    }

    // Combine functions and status together, as it used to be.
    const schemas = new Map<string, TuyaDeviceSchema>();
    for (const { code, type, values, dp_id } of [...res.result.status, ...res.result.functions]) {
      if (schemas[code]) {
        continue;
      }

      const read = (res.result.status).find(schema => schema.code === code) !== undefined;
      const write = (res.result.functions).find(schema => schema.code === code) !== undefined;
      let mode = TuyaDeviceSchemaMode.UNKNOWN;
      if (read && write) {
        mode = TuyaDeviceSchemaMode.READ_WRITE;
      } else if (read && !write) {
        mode = TuyaDeviceSchemaMode.READ_ONLY;
      } else if (!read && write) {
        mode = TuyaDeviceSchemaMode.WRITE_ONLY;
      }
      let property: TuyaDeviceSchemaProperty;
      try {
        property = JSON.parse(values);
        schemas[code] = { code, mode, type, property, dp_id };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
        // ignore infrared remote's invalid schema because it's not used.
      }
    }

    return Object.values(schemas).sort((a, b) => a.code > b.code ? 1 : -1) as TuyaDeviceSchema[];
  }

  async getInfraredRemotes(infraredID: string) {
    const res = await this.api.get(`/v2.0/infrareds/${infraredID}/remotes`);
    return res;
  }

  async getInfraredKeys(infraredID: string, remoteID: string) {
    const res = await this.api.get(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/keys`);
    return res;
  }

  async getInfraredACStatus(infraredID: string, remoteID: string) {
    const res = await this.api.get(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/ac/status`);
    return res;
  }

  async getInfraredDIYKeys(infraredID: string, remoteID: string) {
    const res = await this.api.get(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/learning-codes`);
    return res;
  }

  resolveInfraredRemotes(parentDevice: TuyaDevice, allDevices: TuyaDevice[]) {
    const isInfraredRemoteDevice = (parent:TuyaDevice, target:TuyaDevice) => {
      if (!target.sub || !target.category.startsWith('infrared_')) {
        return false;
      }
      if (parent.lat === target.lat && parent.lon === target.lon) {
        return true;
      }
      if (parent.update_time === target.update_time) {
        return true;
      }
      return false;
    };
    const infraredRemotes = allDevices.filter(device => {
      return isInfraredRemoteDevice(parentDevice, device);
    }).map(device => {
      return {
        'category_id': 999,
        'remote_id': device.id,
        'resolved': true,
      };
    });
    return infraredRemotes;
  }

  fixInfraredDevice(subDevice: TuyaDevice) {
    subDevice.remote_keys!.org_category_id = subDevice.remote_keys!.category_id;
    subDevice.remote_keys!.category_id = this.resolveHAPCategoryID(subDevice);
  }

  resolveHAPCategoryID(subDevice: TuyaDevice) {
    this.log.debug(`resolve HAP category ID. subDevice category:${subDevice.category}, categoryID:${subDevice.remote_keys?.category_id}`);
    let category_id;
    switch(subDevice.product_id) {
      case 'prsgoryjfdtb42r4':
        category_id = 8; // Fan
        break;
      case 'k6ozylayfgnskuq6':
        category_id = 999; // DIY
        break;
      default:
        category_id = subDevice.remote_keys?.category_id || 999; // DIY;
    }
    this.log.debug(`resolved HAP category ID:${category_id}`);
    return category_id;
  }

  override async updateInfraredRemotes(allDevices: TuyaDevice[]) {
    const irDevices = allDevices.filter(device => device.isIRControlHub());
    for (const irDevice of irDevices) {
      const res = await this.getInfraredRemotes(irDevice.id);

      if (!res.success) {
        this.log.warn('Get infrared remotes failed. deviceId = %s, code = %s, msg = %s', irDevice.id, res.code, res.msg);
        continue;
      }
      let resResult = res.result;
      for (const resolvedRemoteDevice of this.resolveInfraredRemotes(irDevice, allDevices)) {
        resResult.forEach(remoteDevice => {
          if (remoteDevice.remote_id === resolvedRemoteDevice.remote_id) {
            remoteDevice.org_category_id = remoteDevice.category_id;
            remoteDevice.category_id = resolvedRemoteDevice.category_id;
            remoteDevice.resolved = true;
          }
        });
      }
      if (resResult.length === 0) {
        // for legacy devices
        this.log.warn('no result for Get infrared remotes.');
        this.log.info('resolving infrared remotes from device list...');
        resResult = this.resolveInfraredRemotes(irDevice, allDevices);
        this.log.success(`${resResult.length} infrared remote device found.`);
      }

      for (const { category_id, remote_id, resolved } of resResult) {
        const subDevice = allDevices.find(device => device.id === remote_id);
        if (!subDevice) {
          continue;
        }
        subDevice.parent_id = irDevice.id;
        subDevice.schema = [];
        const res = await this.getInfraredKeys(irDevice.id, subDevice.id);
        if (!res.success) {
          this.log.warn('Get infrared remote keys failed. deviceId = %s, code = %s, msg = %s', subDevice.id, res.code, res.msg);
          continue;
        }
        subDevice.remote_keys = res.result || {};
        this.log.debug(`infrared keys lengh:${subDevice.remote_keys?.key_list?.length}`);

        if (resolved) {
          this.fixInfraredDevice(subDevice);
        }

        if (subDevice.category === 'infrared_ac') { // AC Device
          const res = await this.getInfraredACStatus(irDevice.id, subDevice.id);
          if (!res.success) {
            this.log.warn('Get infrared ac status failed. deviceId = %s, code = %s, msg = %s', subDevice.id, res.code, res.msg);
            continue;
          }
          subDevice.status = Object.entries(res.result).map(([key, value]) => ({code: key, value} as TuyaDeviceStatus));
        } else if (category_id === 999) { // DIY Device
          const res = await this.getInfraredDIYKeys(irDevice.id, subDevice.id);
          if (!res.success) {
            this.log.warn('Get infrared diy keys failed. deviceId = %s, code = %s, msg = %s', subDevice.id, res.code, res.msg);
            continue;
          }
          const key_list = subDevice.remote_keys?.key_list || [];
          this.log.debug(`key list length:${key_list.length}`);
          const ignoreList:TuyaIRRemoteKeyListItem[] = [];
          for (const key of key_list) {
            if (key.standard_key) {
              if (resolved) {
                ignoreList.push(key);
              }
              continue;
            }
            const item = (res.result as []).find(item => item['id'] === key.key_id && item['key'] === key.key);
            if (!item) {
              if (resolved) {
                ignoreList.push(key);
              }
              continue;
            }
            this.log.debug('learning_code:', item['code']);
            key.learning_code = item['code'];
          }
          if (subDevice.remote_keys && ignoreList.length !== 0) {
            this.log.debug('remove standard instructions. not need for DIY Device');
            subDevice.remote_keys.key_list = subDevice.remote_keys?.key_list.filter(item => !ignoreList.includes(item));
            this.log.debug(`new key list length:${subDevice.remote_keys?.key_list.length}`);
          }
        }
      }
    }
  }

  // eslint-disable-next-line max-len
  override async sendInfraredCommands(infraredID: string, remoteID: string, category_id: number, remote_index: number, key: string, key_id: number) {
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/raw/command`, {
      category_id, remote_index, key, key_id,
    });
    return res;
  }

  override async sendInfraredACCommands(infraredID: string, remoteID: string, power: number, mode: number, temp: number, wind: number) {
    const commands = (power === 1) ? { power, mode, temp, wind } : { power };
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/air-conditioners/${remoteID}/scenes/command`, commands);
    if (!res.success) {
      this.log.info('Send AC command failed. code = %d, msg = %s', res.code, res.msg);
    }
    return res;
  }

  override async sendInfraredDIYCommands(infraredID: string, remoteID: string, code: string) {
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/learning-codes`, { code });
    return res;
  }


  override async getLockTemporaryKey(deviceID: string) {
    // const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/door-lock/password-ticket`);
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-ticket`);
    if (!res.success) {
      this.log.warn('Get Temporary Pass failed. devID = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
      return null;
    }
    return res.result;
  }

  override async sendLockCommands(deviceID: string, ticketID: string, open: boolean) {
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-free/door-operate`, {
      device_id: deviceID,
      ticket_id: ticketID,
      open,
    });
    return res;
  }


  override async sendCommands(deviceID: string, commands: TuyaDeviceStatus[]) {
    // Log the command for user visibility
    const device = this.getDevice(deviceID);
    const deviceName = device?.name || deviceID;
    const commandStr = commands.map(c => `${c.code}=${c.value}`).join(', ');
    this.log.info(`[${deviceName}] Sending command (cloud): ${commandStr}`);

    const res = await this.api.post(`/v1.0/devices/${deviceID}/commands`, { commands });
    return res.result;
  }

  override async getCurrentWeather(lat: string, lon: string) {
    const res = await this.api.get(`/v2.0/iot-03/weather/current?lat=${lat}&lon=${lon}`);
    return res.result;
  }

  override async retrieveDeviceRTSP(deviceID: string): Promise<string> {
    const data = await this.api.post(
      `/v1.0/devices/${deviceID}/stream/actions/allocate`,
      {
        type: 'rtsp',
      },
    );

    return data.result.url;
  }

  async onMQTTMessage(topic: string, protocol: TuyaMQTTProtocol, message) {
    switch(protocol) {
      case TuyaMQTTProtocol.DEVICE_STATUS_UPDATE: {
        const { devId, status } = message;
        const device = this.getDevice(devId);
        if (!device) {
          return;
        }

        for (const item of device.status) {
          const _item = status.find(_item => _item.code === item.code);
          if (!_item) {
            continue;
          }
          item.value = _item.value;
        }

        this.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, device, status);
        break;
      }
      case TuyaMQTTProtocol.DEVICE_INFO_UPDATE: {
        const { bizCode, bizData, devId } = message;
        if (bizCode === 'bindUser') {
          const { ownerId } = bizData;
          if (!this.ownerIDs.includes(ownerId)) {
            this.log.warn('Update devId = %s not included in your ownerIDs. Skip.', devId);
            return;
          }

          // TODO failed if request to quickly
          await new Promise(resolve => setTimeout(resolve, 10000));

          const device = await this.updateDevice(devId);
          if (!device) {
            return;
          }
          this.mq.start(); // Force reconnect, unless new device status update won't get received
          this.emit(TuyaDeviceManager.Events.DEVICE_ADD, device);
        } else if (bizCode === 'nameUpdate') {
          const { name } = bizData;
          const device = this.getDevice(devId);
          if (!device) {
            return;
          }
          device.name = name;
          this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, device, bizData);
        } else if (bizCode === 'online' || bizCode === 'offline') {
          const device = this.getDevice(devId);
          if (!device) {
            return;
          }
          device.online = (bizCode === 'online') ? true : false;
          this.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, device, bizData);
        } else if (bizCode === 'delete') {
          const { ownerId } = bizData;
          if (!this.ownerIDs.includes(ownerId)) {
            this.log.warn('Remove devId = %s not included in your ownerIDs. Skip.', devId);
            return;
          }

          const device = this.getDevice(devId);
          if (!device) {
            return;
          }
          this.devices.splice(this.devices.indexOf(device), 1);
          this.emit(TuyaDeviceManager.Events.DEVICE_DELETE, devId);
        } else if (bizCode === 'event_notify') {
          // doorbell event
        } else if (bizCode === 'p2pSignal') {
          // p2p signal
        } else {
          this.log.warn('Unhandled mqtt message: bizCode = %s, bizData = %o', bizCode, bizData);
        }
        break;
      }
      default:
        this.log.warn('Unhandled mqtt message: protocol = %s, message = %o', protocol, message);
        break;
    }
  }

}
