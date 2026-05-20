import EventEmitter from 'events';
import { ExLogger, logger, PrefixLogger } from './util/Logger';
import TuyaDevice, { TuyaDeviceStatus } from '../cloud/device/TuyaDevice';
import { TuyaOpenAPIResponse } from '../cloud/api/TuyaOpenAPI';
import { TuyaPlatformDeviceSchemaConfig } from '../config';
import { v5 as uuidv5 } from 'uuid';

enum Events {
  DEVICE_ADD = 'DEVICE_ADD',
  DEVICE_INFO_UPDATE = 'DEVICE_INFO_UPDATE',
  DEVICE_STATUS_UPDATE = 'DEVICE_STATUS_UPDATE',
  DEVICE_DELETE = 'DEVICE_DELETE',
}

export default abstract class TuyaDeviceManager extends EventEmitter {
  static readonly Events = Events;
  private static readonly UUID = '9B98886D-EB49-4635-9096-DC826A31A390';

  protected log: ExLogger;
  public devices: TuyaDevice[] = [];

  constructor(
    public debug = false,
  ) {
    super();
    this.log = new PrefixLogger(logger(), this.constructor.name, debug);
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

  createWeatherDevice(device: TuyaDevice, result: { home_id: string; name: string }[]): TuyaDevice {
    const key = `weather-${device.owner_id}`;
    this.log.info(`add weather device:${key}`);
    const uuid = uuidv5(key, TuyaDeviceManager.UUID);
    const virtualDevice = this.createVirtualDevice(device, uuid);
    virtualDevice.product_id = 'virtual-product-id-weather';
    virtualDevice.category = 'wsdcg';
    virtualDevice.name = `Weather(${result.find(home => home.home_id === device.owner_id)?.name})`;
    return virtualDevice;
  }

  async getCurrentWeatherByOpenMeteo(lat: string, lon: string) {
    /** <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> */
    // eslint-disable-next-line max-len
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`, { cache: 'no-cache' });
    return await res.json();
  }

  abstract pullDevices() : Promise<TuyaDevice[]>;
  abstract createDeviceConfigHash(device: TuyaDevice) : string;
  abstract configDevice(device: TuyaDevice) : void;
  abstract getDevice(deviceID: string): TuyaDevice | undefined;
  abstract getDeviceSchemaConfig(device: TuyaDevice, dpCode: string) : TuyaPlatformDeviceSchemaConfig | undefined;
  abstract sendCommands(deviceID: string, commands: TuyaDeviceStatus[]): Promise<unknown>;

  // TODO: Unimplemented methods in LocalDeviceManager.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendInfraredACCommands(infraredID: string, remoteID: string, power: number, mode: number, temp: number, wind: number) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendInfraredCommands(infraredID: string, remoteID: string, category_id: number, remote_index: number, key: string, key_id: number) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendInfraredDIYCommands(infraredID: string, remoteID: string, code: string) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendLockCommands(deviceID: string, ticketID: string, open: boolean) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, max-len
  getLockTemporaryKey(deviceID: string) : Promise<{ ticket_id: string | undefined, ticket_key?: string | null, expire_time?: number | null }> {
    return Promise.resolve({ ticket_id: undefined });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateInfraredRemotes(allDevices: TuyaDevice[]) : void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCurrentWeather(lat: string, lon: string) : Promise<TuyaOpenAPIResponse> {
    return Promise.resolve({ success: false, result: undefined, code: 200, msg: 'unimplemented', t: new Date().getTime(), tid: 'default' });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  retrieveDeviceRTSP(deviceID: string): Promise<string> {
    return Promise.resolve('rtsp://localhost:7000/')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enableAdaptiveLighting(device: TuyaDevice): boolean {
    return false;
  };
}