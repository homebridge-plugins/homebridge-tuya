/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import SmokeSensorAccessory from '../../src/accessory/SmokeSensorAccessory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import { initLogger } from '../../src/util/Logger';

// HAP constants, mirroring the real values.
const SmokeDetected = { SMOKE_NOT_DETECTED: 0, SMOKE_DETECTED: 1 };
const CarbonMonoxideDetected = { CO_LEVELS_NORMAL: 0, CO_LEVELS_ABNORMAL: 1 };
const StatusLowBattery = { BATTERY_LEVEL_NORMAL: 0, BATTERY_LEVEL_LOW: 1 };
const StatusFault = { NO_FAULT: 0, GENERAL_FAULT: 1 };

const enumSchema = (code: string, range: string[]) => ({
  code,
  mode: TuyaDeviceSchemaMode.READ_ONLY,
  type: TuyaDeviceSchemaType.Enum,
  property: { range },
});

// Schema of a combo smoke + CO detector reported as category `ywbj`.
const COMBO_SCHEMA = [
  enumSchema('smoke_sensor_state', ['alarm', 'normal']),
  enumSchema('checking_result', ['checking', 'check_success', 'check_failure']),
  { code: 'fault', mode: TuyaDeviceSchemaMode.READ_ONLY, type: 'Bitmap' as any, property: { label: ['fault'] } },
  enumSchema('battery_state', ['low', 'middle', 'high']),
  enumSchema('co_state', ['alarm', 'normal']),
  { code: 'mute', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Boolean, property: {} },
];

const NORMAL_STATUS = [
  { code: 'smoke_sensor_state', value: 'normal' },
  { code: 'checking_result', value: 'check_success' },
  { code: 'fault', value: 0 },
  { code: 'battery_state', value: 'high' },
  { code: 'co_state', value: 'normal' },
  { code: 'mute', value: false },
];

describe('SmokeSensorAccessory', () => {

  let services: any[];
  let mockAccessory: any;
  let mockPlatform: any;
  let device: TuyaDevice;

  const makeService = (type: any) => {
    const characteristics = new Map<any, any>();
    return {
      UUID: type,
      displayName: `${type}`,
      subtype: undefined,
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
    id: 'smoke-device-id',
    uuid: 'smoke-uuid',
    name: 'Smoke and CO alarm',
    online: true,
    owner_id: 'owner-1',
    product_id: 'smoke-co-product',
    product_name: 'Smoke and CO alarm',
    category: 'ywbj',
    sub: false,
    schema,
    status,
  } as any);

  beforeEach(() => {
    services = [];

    const hap = {
      Service: {
        SmokeSensor: 'SmokeSensor',
        CarbonMonoxideSensor: 'CarbonMonoxideSensor',
        AccessoryInformation: 'AccessoryInformation',
        Battery: 'Battery',
      },
      Characteristic: {
        SmokeDetected,
        CarbonMonoxideDetected,
        CarbonMonoxideLevel: 'CarbonMonoxideLevel',
        StatusLowBattery,
        StatusFault,
        ChargingState: { NOT_CHARGING: 0, CHARGING: 1 },
        BatteryLevel: 'BatteryLevel',
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
      UUID: 'smoke-uuid',
      displayName: 'Smoke and CO alarm',
      context: { deviceID: 'smoke-device-id' },
      services,
      getService: jest.fn((type: any) => services.find(s => s.UUID === type)),
      addService: jest.fn((type: any) => {
        const service = makeService(type);
        services.push(service);
        return service;
      }),
      removeService: jest.fn(),
    };
  });

  const setup = (schema: any[], status: any[]) => {
    device = createDevice(schema, status);
    const accessory = new SmokeSensorAccessory(mockPlatform as any, mockAccessory as any);
    accessory.configureServices();
    return accessory;
  };

  const service = (type: string) => services.find(s => s.UUID === type);
  const read = (serviceType: string, characteristicType: any) =>
    service(serviceType)?.getCharacteristic(characteristicType).getHandler();
  const setStatus = (code: string, value: any) => {
    device.status.find(s => s.code === code)!.value = value;
  };

  test('smoke-only detector keeps a single SmokeSensor service', () => {
    setup([enumSchema('smoke_sensor_state', ['alarm', 'normal'])], [{ code: 'smoke_sensor_state', value: 'normal' }]);

    expect(service('SmokeSensor')).toBeDefined();
    expect(service('CarbonMonoxideSensor')).toBeUndefined();
    expect(read('SmokeSensor', SmokeDetected)).toBe(SmokeDetected.SMOKE_NOT_DETECTED);

    setStatus('smoke_sensor_state', 'alarm');
    expect(read('SmokeSensor', SmokeDetected)).toBe(SmokeDetected.SMOKE_DETECTED);
  });

  test('combo detector exposes both SmokeSensor and CarbonMonoxideSensor', () => {
    setup(COMBO_SCHEMA, NORMAL_STATUS.map(s => ({ ...s })));

    expect(service('SmokeSensor')).toBeDefined();
    expect(service('CarbonMonoxideSensor')).toBeDefined();
    expect(read('SmokeSensor', SmokeDetected)).toBe(SmokeDetected.SMOKE_NOT_DETECTED);
    expect(read('CarbonMonoxideSensor', CarbonMonoxideDetected)).toBe(CarbonMonoxideDetected.CO_LEVELS_NORMAL);
  });

  test('smoke and CO alarms are reported independently', () => {
    setup(COMBO_SCHEMA, NORMAL_STATUS.map(s => ({ ...s })));

    setStatus('co_state', 'alarm');
    expect(read('CarbonMonoxideSensor', CarbonMonoxideDetected)).toBe(CarbonMonoxideDetected.CO_LEVELS_ABNORMAL);
    expect(read('SmokeSensor', SmokeDetected)).toBe(SmokeDetected.SMOKE_NOT_DETECTED);

    setStatus('co_state', 'normal');
    setStatus('smoke_sensor_state', 'alarm');
    expect(read('CarbonMonoxideSensor', CarbonMonoxideDetected)).toBe(CarbonMonoxideDetected.CO_LEVELS_NORMAL);
    expect(read('SmokeSensor', SmokeDetected)).toBe(SmokeDetected.SMOKE_DETECTED);
  });

  test('battery_state without a percentage DP maps to StatusLowBattery on the sensors', () => {
    setup(COMBO_SCHEMA, NORMAL_STATUS.map(s => ({ ...s })));

    expect(service('Battery')).toBeUndefined();
    expect(read('SmokeSensor', StatusLowBattery)).toBe(StatusLowBattery.BATTERY_LEVEL_NORMAL);

    setStatus('battery_state', 'low');
    expect(read('SmokeSensor', StatusLowBattery)).toBe(StatusLowBattery.BATTERY_LEVEL_LOW);
    expect(read('CarbonMonoxideSensor', StatusLowBattery)).toBe(StatusLowBattery.BATTERY_LEVEL_LOW);
  });

  test('a non-zero fault bitmap maps to StatusFault', () => {
    setup(COMBO_SCHEMA, NORMAL_STATUS.map(s => ({ ...s })));

    expect(read('SmokeSensor', StatusFault)).toBe(StatusFault.NO_FAULT);

    setStatus('fault', 4);
    expect(read('SmokeSensor', StatusFault)).toBe(StatusFault.GENERAL_FAULT);
    expect(read('CarbonMonoxideSensor', StatusFault)).toBe(StatusFault.GENERAL_FAULT);
  });

});
