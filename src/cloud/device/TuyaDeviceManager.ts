import EventEmitter from 'events';
import TuyaOpenAPI from '../api/TuyaOpenAPI';
import TuyaOpenMQ from '../api/TuyaOpenMQ';
import { ExLogger, PrefixLogger } from '../../shared/util/Logger';
import TuyaDevice, {
  TuyaDeviceSchema,
  TuyaDeviceSchemaMode,
  TuyaDeviceSchemaProperty,
  TuyaDeviceStatus,
  TuyaIRRemoteKeyListItem,
} from './TuyaDevice';

enum Events {
  DEVICE_ADD = 'DEVICE_ADD',
  DEVICE_INFO_UPDATE = 'DEVICE_INFO_UPDATE',
  DEVICE_STATUS_UPDATE = 'DEVICE_STATUS_UPDATE',
  DEVICE_DELETE = 'DEVICE_DELETE',
}

enum TuyaMQTTProtocol {
  DEVICE_STATUS_UPDATE = 4,
  DEVICE_INFO_UPDATE = 20,
}

export default class TuyaDeviceManager extends EventEmitter {

  static readonly Events = Events;

  public mq: TuyaOpenMQ;
  public ownerIDs: string[] = [];
  public devices: TuyaDevice[] = [];
  public log: ExLogger;

  constructor(
    public api: TuyaOpenAPI,
    public debug = false,
  ) {
    super();

    const log = (this.api.log as PrefixLogger).log;
    this.log = new PrefixLogger(log, TuyaDeviceManager.name, debug);

    this.mq = new TuyaOpenMQ(api, log);
    this.mq.addMessageListener(this.onMQTTMessage.bind(this));
  }

  createVirtualDevice(baseDevice: TuyaDevice, uuid: string): TuyaDevice {
    const cloneDevice = new TuyaDevice(baseDevice);
    const uniqueId = uuid || Date.now().toString(36) + Math.random().toString(36).substring(2);
    cloneDevice.id = `${uniqueId}`;
    cloneDevice.uuid = `${uniqueId}`;
    cloneDevice.name = 'Virtual Device';
    cloneDevice.product_id = `${uniqueId}`;
    cloneDevice.product_name = 'virtual product';
    cloneDevice.sub = true;
    cloneDevice.ip = '';
    cloneDevice.parent_id = baseDevice.id;
    cloneDevice.remote_keys = undefined;
    return cloneDevice;
  }

  getDevice(deviceID: string) {
    return Array.from(this.devices).find(device => device.id === deviceID);
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
    const res = await this.api.get(`/v1.0/devices/${deviceID}/specifications`);
    if (res.success === false) {
      this.log.warn('Get device specification failed. devId = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
      return [];
    }

    // Combine functions and status together, as it used to be.
    const schemas = new Map<string, TuyaDeviceSchema>();
    for (const { code, type, values } of [...res.result.status, ...res.result.functions]) {
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
        schemas[code] = { code, mode, type, property };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dump(obj:any) {
    for (const key in obj) {
      try {
        if ((typeof obj[key]) === 'function') {
          this.log.warn(`\t function ${key}:${obj[key].name}`);
        } else {
          this.log.warn(`\t ${key}:${obj[key]}`);
        }
      } catch (e) {
        this.dump(e);
      }
      if ((typeof obj[key]) !== 'string') {
        for (const key2 in obj[key]) {
          try {
            if ((typeof obj[key][key2]) === 'function') {
              this.log.warn(`\t function ${key2}:${obj[key][key2].name}`);
            } else {
              this.log.warn(`\t ${key2}:${obj[key][key2]}`);
            }
          } catch (e) {
            this.dump(e);
          }
        }
      }
    }
  }

  async updateInfraredRemotes(allDevices: TuyaDevice[]) {
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

  async sendInfraredCommands(infraredID: string, remoteID: string, category_id: number, remote_index: number, key: string, key_id: number) {
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/raw/command`, {
      category_id, remote_index, key, key_id,
    });
    return res;
  }

  async sendInfraredACCommands(infraredID: string, remoteID: string, power: number, mode: number, temp: number, wind: number) {
    const commands = (power === 1) ? { power, mode, temp, wind } : { power };
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/air-conditioners/${remoteID}/scenes/command`, commands);
    if (!res.success) {
      this.log.info('Send AC command failed. code = %d, msg = %s', res.code, res.msg);
    }
    return res;
  }

  async sendInfraredDIYCommands(infraredID: string, remoteID: string, code: string) {
    const res = await this.api.post(`/v2.0/infrareds/${infraredID}/remotes/${remoteID}/learning-codes`, { code });
    // const res = await this.api.post(`/v1.0/infrareds/${infraredID}/remotes/${remoteID}/learning-codes`, { code });
    return res;
  }


  async getLockTemporaryKey(deviceID: string) {
    // const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/door-lock/password-ticket`);
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-ticket`);
    if (res.success === false) {
      this.log.warn('Get Temporary Pass failed. devID = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
    }
    return res;
  }

  async sendLockCommands(deviceID: string, ticketID: string, open: boolean) {
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-free/door-operate`, {
      device_id: deviceID,
      ticket_id: ticketID,
      open,
    });
    return res;
  }


  async sendCommands(deviceID: string, commands: TuyaDeviceStatus[]) {
    // Log the command for user visibility
    const device = this.getDevice(deviceID);
    const deviceName = device?.name || deviceID;
    const commandStr = commands.map(c => `${c.code}=${c.value}`).join(', ');
    this.log.info(`[${deviceName}] Sending command (cloud): ${commandStr}`);

    const res = await this.api.post(`/v1.0/devices/${deviceID}/commands`, { commands });
    return res.result;
  }

  async getCurrentWeather(lat: string, lon: string) {
    const res = await this.api.get(`/v2.0/iot-03/weather/current?lat=${lat}&lon=${lon}`);
    return res.result;
  }

  async getCurrentWeatherByOpenMeteo(lat: string, lon: string) {
    /** <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> */
    // eslint-disable-next-line max-len
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`, { cache: 'no-cache' });
    return await res.json();
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

        this.emit(Events.DEVICE_STATUS_UPDATE, device, status);
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
          this.emit(Events.DEVICE_ADD, device);
        } else if (bizCode === 'nameUpdate') {
          const { name } = bizData;
          const device = this.getDevice(devId);
          if (!device) {
            return;
          }
          device.name = name;
          this.emit(Events.DEVICE_INFO_UPDATE, device, bizData);
        } else if (bizCode === 'online' || bizCode === 'offline') {
          const device = this.getDevice(devId);
          if (!device) {
            return;
          }
          device.online = (bizCode === 'online') ? true : false;
          this.emit(Events.DEVICE_INFO_UPDATE, device, bizData);
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
          this.emit(Events.DEVICE_DELETE, devId);
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
