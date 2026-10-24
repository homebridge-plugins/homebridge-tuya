/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import WeatherStationAccessory from '../../src/accessory/WeatherStationAccessory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import { initLogger } from '../../src/util/Logger';

const integerSchema = (code: string, unit: string, min: number, max: number, scale: number) => ({
  code,
  mode: TuyaDeviceSchemaMode.READ_ONLY,
  type: TuyaDeviceSchemaType.Integer,
  property: { unit, min, max, scale, step: 1 },
});

// Schema of a Tuya "LED temperature and humidity alarm clock" (category `qxj`), standard DPs only.
const CLOCK_SCHEMA = [
  integerSchema('temp_current', '℃', -100, 600, 1),
  integerSchema('humidity_value', '%', 0, 100, 0),
  { code: 'volume', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Enum, property: { range: ['mute', 'low'] } },
];
const CLOCK_STATUS = [
  { code: 'temp_current', value: 304 },
  { code: 'humidity_value', value: 64 },
  { code: 'volume', value: 'low' },
];

// Multi-channel weather station: per-channel outdoor sensor DPs.
const CHANNEL_SCHEMA = [
  integerSchema('ch1_ToutCh', '℃', -400, 800, 1),
  integerSchema('ch1_HoutCh', '%', 0, 100, 0),
];
const CHANNEL_STATUS = [
  { code: 'ch1_ToutCh', value: 125 },
  { code: 'ch1_HoutCh', value: 88 },
];

describe('WeatherStationAccessory', () => {

  let services: any[];
  let mockAccessory: any;
  let mockPlatform: any;
  let device: TuyaDevice;

  const Service = {
    TemperatureSensor: { UUID: 'TemperatureSensor' },
    HumiditySensor: { UUID: 'HumiditySensor' },
    AccessoryInformation: { UUID: 'AccessoryInformation' },
    Battery: { UUID: 'Battery' },
  };

  const makeService = (type: any, subtype?: string) => {
    const characteristics = new Map<any, any>();
    return {
      UUID: type.UUID,
      displayName: `${type.UUID}`,
      subtype,
      characteristics: [] as any[],
      getCharacteristic: jest.fn(function(this: any, characteristicType: any) {
        let characteristic = characteristics.get(characteristicType);
        if (!characteristic) {
          characteristic = {
            type: characteristicType,
            value: null,
            getHandler: undefined,
            onGet: jest.fn((handler: any) => (characteristic.getHandler = handler, characteristic)),
            onSet: jest.fn(() => characteristic),
            setProps: jest.fn(() => characteristic),
            updateValue: jest.fn((value: any) => (characteristic.value = value, characteristic)),
          };
          characteristics.set(characteristicType, characteristic);
          this.characteristics.push(characteristic);
        }
        return characteristic;
      }),
      setCharacteristic: jest.fn(function(this: any) {
        return this;
      }),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => true),
    };
  };

  const createDevice = (schema: any[], status: any[]) => new TuyaDevice({
    id: 'qxj-device-id',
    uuid: 'qxj-uuid',
    name: 'Clock',
    online: true,
    owner_id: 'owner-1',
    product_id: 'qxj-product',
    product_name: 'LED temperature and humidity alarm clock',
    category: 'qxj',
    sub: false,
    schema,
    status,
  } as any);

  beforeEach(() => {
    services = [];

    const hap = {
      Service,
      Characteristic: {
        CurrentTemperature: 'CurrentTemperature',
        CurrentRelativeHumidity: 'CurrentRelativeHumidity',
        StatusActive: 'StatusActive',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        Name: 'Name',
        ConfiguredName: 'ConfiguredName',
        SerialNumber: 'SerialNumber',
        ProgrammableSwitchEvent: { UUID: 'ProgrammableSwitchEvent' },
      },
    };

    const noop = () => undefined;
    mockPlatform = {
      api: { hap },
      options: { debug: false },
      deviceManager: { getDevice: jest.fn(() => device), sendCommands: jest.fn() },
      getDeviceConfig: jest.fn(() => undefined),
      getDeviceSchemaConfig: jest.fn(() => undefined),
      log: { info: noop, warn: noop, error: noop, debug: noop },
    };
    initLogger(mockPlatform.log);

    mockAccessory = {
      UUID: 'qxj-uuid',
      displayName: 'Clock',
      context: { deviceID: 'qxj-device-id' },
      services,
      getService: jest.fn((type: any) => services.find(s => s.UUID === type.UUID)),
      getServiceById: jest.fn((type: any, subtype: string) => services.find(s => s.UUID === type.UUID && s.subtype === subtype)),
      addService: jest.fn((type: any, _name?: string, subtype?: string) => {
        const service = makeService(type, subtype);
        services.push(service);
        return service;
      }),
      removeService: jest.fn(),
    };
  });

  const setup = (schema: any[], status: any[]) => {
    device = createDevice(schema, status);
    const accessory = new WeatherStationAccessory(mockPlatform as any, mockAccessory as any);
    accessory.configureServices();
    return accessory;
  };

  const find = (type: string, subtype?: string) => services.filter(s => s.UUID === type && s.subtype === subtype);
  const read = (type: string, subtype: string | undefined, characteristicType: string) =>
    find(type, subtype)[0]?.getCharacteristic(characteristicType).getHandler();

  test('standard temp_current / humidity_value are exposed (clock with no channel DPs)', () => {
    setup(CLOCK_SCHEMA, CLOCK_STATUS.map(s => ({ ...s })));

    expect(find('TemperatureSensor')).toHaveLength(1);
    expect(find('HumiditySensor')).toHaveLength(1);
    expect(read('TemperatureSensor', undefined, 'CurrentTemperature')).toBe(30.4);
    expect(read('HumiditySensor', undefined, 'CurrentRelativeHumidity')).toBe(64);
  });

  test('multi-channel station without standard DPs is unchanged', () => {
    setup(CHANNEL_SCHEMA, CHANNEL_STATUS.map(s => ({ ...s })));

    expect(find('TemperatureSensor')).toHaveLength(0);
    expect(find('HumiditySensor')).toHaveLength(0);
    expect(read('TemperatureSensor', 'temperature_sensor_1', 'CurrentTemperature')).toBe(12.5);
    expect(read('HumiditySensor', 'humidity_sensor_1', 'CurrentRelativeHumidity')).toBe(88);
  });

  test('main unit and channels get separate services, also with cached channel services', () => {
    // Restored from cache: channel services already exist before the main-unit ones.
    services.push(makeService(Service.TemperatureSensor, 'temperature_sensor_1'));
    services.push(makeService(Service.HumiditySensor, 'humidity_sensor_1'));

    setup([...CLOCK_SCHEMA, ...CHANNEL_SCHEMA], [...CLOCK_STATUS, ...CHANNEL_STATUS].map(s => ({ ...s })));

    expect(services.filter(s => s.UUID === 'TemperatureSensor')).toHaveLength(2);
    expect(services.filter(s => s.UUID === 'HumiditySensor')).toHaveLength(2);
    expect(read('TemperatureSensor', undefined, 'CurrentTemperature')).toBe(30.4);
    expect(read('HumiditySensor', undefined, 'CurrentRelativeHumidity')).toBe(64);
    expect(read('TemperatureSensor', 'temperature_sensor_1', 'CurrentTemperature')).toBe(12.5);
    expect(read('HumiditySensor', 'humidity_sensor_1', 'CurrentRelativeHumidity')).toBe(88);
  });

});
