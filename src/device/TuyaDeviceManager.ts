import EventEmitter from 'events';
import TuyaOpenAPI from '../core/TuyaOpenAPI';
import TuyaOpenMQ from '../core/TuyaOpenMQ';
import { ExLogger, logger, PrefixLogger } from '../util/Logger';
import TuyaDevice, {
  TuyaDeviceSchema,
  TuyaDeviceSchemaMode,
  TuyaDeviceSchemaProperty,
  TuyaDeviceSchemaType,
  TuyaDeviceStatus,
  TuyaIRRemoteKeyListItem,
} from './TuyaDevice';
import { RTSPCameraConfig } from '../config';
import { maskSecret, uuidFromSeed } from '../util/util';
import {
  FASTWARM_CURRENT_TEMPERATURE_SCHEMA, FastWarmTemperatureReport, getFastWarmTemperatureReport,
  getFastWarmSetTemperatureReport, isFastWarmSetTemperatureReport, isFastWarmTemperatureReport, isFastWarmThermostat,
} from './profile/FastWarmThermostat';

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
  public ownerIDs: string[];
  public devices: TuyaDevice[];
  public log: ExLogger;

  private supplementalTemperatureDevices = new Set<string>();
  private supplementalTemperatureSchemas = new WeakSet<TuyaDeviceSchema>();
  private supplementalTemperatureReports = new Map<string, FastWarmTemperatureReport & { time: number }>();
  private supplementalTemperatureRequests = new Map<string, Promise<void>>();
  private supplementalTemperatureRetries = new Map<string, { nextAttempt: number; failures: number }>();
  private targetTemperatureReports = new Map<string, FastWarmTemperatureReport & { time: number }>();

  constructor(
    public api: TuyaOpenAPI,
    public debug = false,
  ) {
    super();

    this.ownerIDs = [];
    this.devices = [];
    this.log = new PrefixLogger(logger(), TuyaDeviceManager.name, debug);

    this.mq = new TuyaOpenMQ(api);
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

  createRTSPCameraDevice(cameraConfig: RTSPCameraConfig): TuyaDevice {
    const device = new TuyaDevice({
      id: cameraConfig.deviceId ?? uuidFromSeed(cameraConfig.rtspUrl),
      uuid: cameraConfig.deviceId ?? uuidFromSeed(cameraConfig.rtspUrl),
      name: cameraConfig.deviceName ?? 'RTSP Camera',
      online: true,
      owner_id: '',
      product_id: 'rstp-camera-product',
      product_name: 'RTSP Camera',
      icon: '',
      category: 'sp',
      schema: [
        {
          code: 'motion_switch', // camera accessory requires a motion sensor service, so we add a dummy schema for it
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Boolean,
          property: {},
        },
      ],
      status: [],
      ip: '',
      lat: '',
      lon: '',
      time_zone: '',
      create_time: 0,
      active_time: 0,
      update_time: 0,
    });
    this.devices.push(device);
    return device;
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
    await this.enrichDeviceStatus(device);

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
      } catch (error) {
        // ignore infrared remote's invalid schema because it's not used.
      }
    }

    return Object.values(schemas).sort((a, b) => a.code > b.code ? 1 : -1) as TuyaDeviceSchema[];
  }

  /** Supplement this product's incomplete standard schema without changing its command API. */
  async enrichDeviceStatus(device: TuyaDevice) {
    const currentSchema = device.schema.find(schema => schema.code.toLowerCase() === 'temp_current');
    if (!isFastWarmThermostat(device) || (currentSchema && !this.supplementalTemperatureSchemas.has(currentSchema))) {
      this.supplementalTemperatureDevices.delete(device.id);
      return;
    }
    this.supplementalTemperatureDevices.add(device.id);
    if (!currentSchema) {
      const schema = { ...FASTWARM_CURRENT_TEMPERATURE_SCHEMA };
      this.supplementalTemperatureSchemas.add(schema);
      device.schema.push(schema);
    }
    await this.refreshSupplementalTemperature(device);
    // A device rediscovery can overlap a newer MQTT update on the previous device object.
    const latest = this.supplementalTemperatureReports.get(device.id);
    if (latest) {
      this.applySupplementalTemperature(device, latest);
    }
    const target = this.targetTemperatureReports.get(device.id);
    if (target && this.hasFastWarmCelsiusTarget(device)) {
      this.applyTargetTemperature(device, target);
    }
  }

  /** MQTT supplies normal updates; HomeKit reads can recover a missed report, at most once per five minutes. */
  async refreshSupplementalTemperature(device: TuyaDevice): Promise<void> {
    if (!isFastWarmThermostat(device) || !this.supplementalTemperatureDevices.has(device.id) || !device.online) {
      return;
    }
    const pending = this.supplementalTemperatureRequests.get(device.id);
    if (pending) {
      return pending;
    }
    const retry = this.supplementalTemperatureRetries.get(device.id);
    if (retry && Date.now() < retry.nextAttempt) {
      return;
    }

    const request = this.fetchSupplementalTemperature(device);
    this.supplementalTemperatureRequests.set(device.id, request);
    try {
      await request;
    } finally {
      this.supplementalTemperatureRequests.delete(device.id);
    }
  }

  private async fetchSupplementalTemperature(device: TuyaDevice): Promise<void> {
    try {
      const response = await this.api.get(`/v2.0/cloud/thing/${device.id}/shadow/properties`, {
        codes: this.hasFastWarmCelsiusTarget(device) ? 'RoomTemper,SetTemp' : 'RoomTemper',
      });
      const properties: unknown[] = Array.isArray(response.result?.properties) ? response.result.properties : [];
      if (response.success !== false && this.hasFastWarmCelsiusTarget(device)) {
        const target = properties.map(getFastWarmSetTemperatureReport).find(value => value !== undefined);
        const status = target && this.applyTargetTemperature(device, target);
        if (status) {
          this.emit(Events.DEVICE_STATUS_UPDATE, device, [status]);
        }
      }
      const report = properties.map(getFastWarmTemperatureReport).find(value => value !== undefined);
      if (response.success === false || !report) {
        throw new Error(response.success === false ? `${response.code}: ${response.msg}` : 'RoomTemper was not returned');
      }
      this.supplementalTemperatureRetries.set(device.id, { failures: 0, nextAttempt: Date.now() + 5 * 60 * 1000 });
      const status = this.applySupplementalTemperature(device, report);
      if (status) {
        this.emit(Events.DEVICE_STATUS_UPDATE, device, [status]);
      }
    } catch (error) {
      const failures = (this.supplementalTemperatureRetries.get(device.id)?.failures ?? 0) + 1;
      const delay = Math.min(60 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.min(failures - 1, 6)));
      this.supplementalTemperatureRetries.set(device.id, { failures, nextAttempt: Date.now() + delay });
      this.log.warn('Could not read FastWarm room temperature. devId = %s, error = %s', device.id, String(error));
    }
  }

  private applySupplementalTemperature(device: TuyaDevice, report: FastWarmTemperatureReport): TuyaDeviceStatus | undefined {
    const time = report.time ?? Date.now();
    if (time > Date.now() + 5 * 60_000 || time < (this.supplementalTemperatureReports.get(device.id)?.time ?? 0)) {
      return undefined;
    }
    this.supplementalTemperatureReports.set(device.id, { ...report, time });
    const status = { code: 'temp_current', value: report.value };
    const existing = device.status.find(item => item.code === status.code);
    if (existing) {
      if (existing.value === status.value) {
        return undefined;
      }
      existing.value = status.value;
    } else {
      device.status.push(status);
    }
    return status;
  }

  private hasFastWarmCelsiusTarget(device: TuyaDevice): boolean {
    return isFastWarmThermostat(device) && device.status.some(item => item.code === 'temp_unit_convert' && item.value === 'c')
      && device.schema.some(item => item.code === 'temp_set');
  }

  /** Keep the active native target truthful without treating it as a room measurement. */
  private applyTargetTemperature(device: TuyaDevice, report: FastWarmTemperatureReport): TuyaDeviceStatus | undefined {
    const time = report.time ?? Date.now();
    if (time > Date.now() + 5 * 60_000 || time < (this.targetTemperatureReports.get(device.id)?.time ?? 0)) {
      return undefined;
    }
    this.targetTemperatureReports.set(device.id, { ...report, time });
    const existing = device.status.find(item => item.code === 'temp_set');
    if (existing?.value === report.value) {
      return undefined;
    }
    const status = { code: 'temp_set', value: report.value, ...(report.time === undefined ? {} : { t: report.time }) };
    if (existing) {
      existing.value = report.value;
    } else {
      device.status.push({ code: status.code, value: status.value });
    }
    return status;
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


  /**
   * Smart Lock "Get Temporary Key".
   * Applies to Wi-Fi, Zigbee, Bluetooth and hotel Zigbee locks.
   * https://developer.tuya.com/en/docs/cloud/doorlock-api-remoteopen?id=Kbe2nm6j9hcsj
   *
   * The response carries a `ticket_key` (a 256-bit encryption key). It must
   * never be written to the log.
   */
  async getLockTemporaryKey(deviceID: string) {
    // const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/door-lock/password-ticket`);
    this.log.debug('Requesting smart lock password ticket. devID = %s', deviceID);
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-ticket`);
    if (res.success === false) {
      this.log.warn('Get Temporary Pass failed. devID = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
    } else {
      this.log.debug('Got smart lock password ticket. devID = %s, ticket_id = %s, expire_time = %s',
        deviceID, maskSecret(res.result?.ticket_id), res.result?.expire_time);
    }
    return res;
  }

  /**
   * Smart Lock "Remote Locking and Unlocking Without Password".
   * Applies to Wi-Fi, Zigbee, Bluetooth and hotel Zigbee locks.
   * `open = true` unlocks, `open = false` locks.
   * https://developer.tuya.com/en/docs/cloud/8b36eabd4d?id=Kayexavknr6dt
   */
  async sendLockCommands(deviceID: string, ticketID: string, open: boolean) {
    this.log.debug('Sending smart lock door operation. devID = %s, ticket_id = %s, open = %s',
      deviceID, maskSecret(ticketID), open);
    const res = await this.api.post(`/v1.0/smart-lock/devices/${deviceID}/password-free/door-operate`, {
      device_id: deviceID,
      ticket_id: ticketID,
      open,
    });
    if (res.success === false) {
      this.log.warn('Send lock command failed. devID = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
    } else {
      this.log.debug('Smart lock door operation accepted by Tuya Cloud. devID = %s, result = %o', deviceID, res.result);
    }
    return res;
  }

  /**
   * Lists the remote unlocking methods a lock actually exposes.
   * Applies to Zigbee and Bluetooth locks; used for diagnostics when a door
   * operation is rejected.
   */
  async getLockRemoteUnlockMethods(deviceID: string) {
    const res = await this.api.get(`/v1.0/devices/${deviceID}/door-lock/remote-unlocks`);
    if (res.success === false) {
      this.log.warn('Get remote unlock methods failed. devID = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
    }
    return res;
  }


  async sendCommands(deviceID: string, commands: TuyaDeviceStatus[]) {
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

  async retrieveDeviceRTSP(device: TuyaDevice): Promise<string> {
    if (device['camera'] && device['camera'].rtspUrl) {
      const cameraConfig = device['camera'] as RTSPCameraConfig;
      const rtspUrl = cameraConfig.rtspUrl;
      if (rtspUrl.includes('@') || !cameraConfig.username) {
        return rtspUrl;
      } else {
        return `rtsp://${cameraConfig.username}:${cameraConfig.password}@${rtspUrl.substring('rtsp://'.length)}`;
      }
    }
    const data = await this.api.post(`/v1.0/devices/${device.id}/stream/actions/allocate`, { type: 'rtsp' });
    return data.result.url;
  }


  async onMQTTMessage(topic: string, protocol: TuyaMQTTProtocol, message) {
    switch(protocol) {
      case TuyaMQTTProtocol.DEVICE_STATUS_UPDATE: {
        const { devId } = message;
        let status = message.status;
        const device = this.getDevice(devId);
        if (!device) {
          return;
        }

        if (this.hasFastWarmCelsiusTarget(device) && Array.isArray(status)) {
          // Raw native changes do not always have a standardized temp_set MQTT twin.
          // Order both forms together, independently of the measured room temperature.
          const targets = status.map(item => getFastWarmSetTemperatureReport(
            item?.code === 'temp_set' ? { ...item, dp_id: 102 } : item,
          )).filter(report => report !== undefined);
          status = status.filter(item => item?.code !== 'temp_set' && !isFastWarmSetTemperatureReport(item));
          let latestTarget: TuyaDeviceStatus | undefined;
          for (const report of targets) {
            const target = this.applyTargetTemperature(device, report);
            if (target) {
              latestTarget = target;
            }
          }
          if (latestTarget) {
            status = [...status, latestTarget];
          }
        }

        if (isFastWarmThermostat(device) && this.supplementalTemperatureDevices.has(device.id) && Array.isArray(status)) {
          const reports = status.map(getFastWarmTemperatureReport).filter(report => report !== undefined);
          // Remove raw entries, including malformed/stale reports, before updating the standard status cache.
          status = status.filter(item => !isFastWarmTemperatureReport(item));
          let latestTemperature: TuyaDeviceStatus | undefined;
          for (const report of reports) {
            const temperature = this.applySupplementalTemperature(device, report);
            if (temperature) {
              latestTemperature = temperature;
            }
          }
          if (latestTemperature) {
            status = [...status, latestTemperature];
          }
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
