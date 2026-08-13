import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import BaseAccessory from '../src/shared/accessory/BaseAccessory';
import { configureRotationSpeed, enumToPercentageProperty, integerToPercentageProperty } from '../src/shared/accessory/characteristic/RotationSpeed';
import { TuyaDeviceSchemaMode, TuyaDeviceSchemaType, TuyaDeviceSchemaEnumProperty, TuyaDeviceSchemaIntegerProperty, TuyaDeviceStatus, TuyaDeviceSchema } from '../src/cloud/device/TuyaDevice';
import { CharacteristicProps, PartialAllowingNull, Service } from 'homebridge';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

// モック用のダミーロガー
const mockDebug = jest.fn();
// Mock Logger
const mockLog: ExLogger = {
  debug: mockDebug,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as ExLogger;

describe('configureRotationSpeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initLogger(mockLog);
  });
  test('maps four-level fan_speed_percent values to HomeKit percentages', async () => {
    let rawLevel = 1;
    let getHandler: () => number = () => 0;
    let setHandler: (value: number) => Promise<void> = async () => undefined;
    const characteristic = {
      onGet: jest.fn((handler: () => number) => {
        getHandler = handler;
        return characteristic;
      }),
      onSet: jest.fn((handler: (value: number) => Promise<void>) => {
        setHandler = handler;
        return characteristic;
      }),
      updateValue: jest.fn((value: number) => characteristic),
      setProps: jest.fn((prop: PartialAllowingNull<CharacteristicProps>) => characteristic),
    };
    const service = {
      getCharacteristic: jest.fn(() => characteristic),
    };
    const sendCommands = jest.fn(async (command: TuyaDeviceStatus[], debounce: boolean) => undefined);
    const accessory = {
      Characteristic: { RotationSpeed: 'RotationSpeed' },
      getStatus: jest.fn(() => ({ code: 'fan_speed_percent', value: rawLevel })),
      sendCommands,
      log: { debug: jest.fn() }
    } as unknown as BaseAccessory;
    const schema = {
      code: 'fan_speed_percent',
      mode: TuyaDeviceSchemaMode.READ_WRITE,
      type: TuyaDeviceSchemaType.Integer,
      property: { min: 1, max: 4, scale: 0, step: 1, unit: '' },
    };

    configureRotationSpeed(accessory, service as never, schema);

    expect(characteristic.setProps).toHaveBeenCalledWith({ minValue: 0, maxValue: 100, minStep: 25, unit: '%' });
    expect(characteristic.updateValue).toHaveBeenCalledWith(25);
    expect([1, 2, 3, 4].map(level => {
      rawLevel = level;
      return getHandler();
    })).toEqual([25, 50, 75, 100]);

    for (const [percent, level] of [[25, 1], [50, 2], [75, 3], [100, 4]]) {
      await setHandler(percent);
      expect(sendCommands).toHaveBeenLastCalledWith(
        [{ code: 'fan_speed_percent', value: level }],
        true,
      );
    }

    await setHandler(0);
    expect(sendCommands).toHaveBeenCalledTimes(4);
  });
});

describe('switching configuration method', () => {
  test('Test whether the appropriate configure method is being selected and invoked correctly.', () => {
    let getHandler: () => number = () => 0;
    let setHandler: (value: number) => Promise<void> = async () => undefined;
    const characteristic = {
      onGet: jest.fn((handler: () => number) => {
        getHandler = handler;
        return characteristic;
      }),
      onSet: jest.fn((handler: (value: number) => Promise<void>) => {
        setHandler = handler;
        return characteristic;
      }),
      updateValue: jest.fn((value: number) => characteristic),
      setProps: jest.fn((prop: PartialAllowingNull<CharacteristicProps>) => characteristic),
    };
    const accessory = {
        log: mockLog,
        Characteristic: { RotationSpeed: 'RotationSpeed' },
        getStatus: jest.fn(() => ({ code: 'fan_speed_percent', value: 0 })),
    } as unknown as BaseAccessory;
    const service = { getCharacteristic: jest.fn(() => characteristic) } as unknown as Service;
    const schemaEnum = { type: TuyaDeviceSchemaType.Enum, property: {range: ["slow", "medium", "fast", "auto"]} } as TuyaDeviceSchema;
    const schemaInteger = { type: TuyaDeviceSchemaType.Integer, property: { min: 0, max: 50, step: 2, scale: 0, unit: 'percent' } } as TuyaDeviceSchema;
    const schemaOther = { type: 'other' } as unknown as TuyaDeviceSchema;

    mockDebug.mockReset();
    // Call the function with different schema types
    configureRotationSpeed(accessory, service, schemaEnum);
    configureRotationSpeed(accessory, service, schemaInteger);
    configureRotationSpeed(accessory, service, schemaOther);
    configureRotationSpeed(accessory, service, undefined);

    // Check if the correct functions were called
    expect(mockDebug).toHaveBeenNthCalledWith(1, 'configureRotationSpeedEnum');
    expect(mockDebug).toHaveBeenNthCalledWith(2, 'Set props for RotationSpeed:', {"maxValue": 100, "minStep": 33, "minValue": 0, "unit": "%"});
    expect(mockDebug).toHaveBeenNthCalledWith(3, 'configureRotationSpeedInteger');
    expect(mockDebug).toHaveBeenNthCalledWith(4, 'Set props for RotationSpeed:', {"maxValue": 100, "minStep": 4, "minValue": 0, "unit": "%"});
    expect(mockDebug).toHaveBeenNthCalledWith(5, 'configureRotationSpeedOn');
    expect(mockDebug).toHaveBeenNthCalledWith(6, 'Set props for RotationSpeed:', {"maxValue": 100, "minStep": 100, "minValue": 0, "unit": "%"});
    expect(mockDebug).toHaveBeenCalledTimes(6);
  });
});

describe('convert property', () => {
  test('integerToPercentageProperty no changes', () => {
    const property = { min: 1, max: 100, step: 1, scale: 0, unit: '%' } as unknown as TuyaDeviceSchemaIntegerProperty;
    expect(integerToPercentageProperty(property)).toEqual({ minValue: 0, maxValue: 100, minStep: 1, unit: '%' });
  });

  test('integerToPercentageProperty returns 25% steps for 1..4 levels', () => {
    const property = { min: 1, max: 4, step: 1, scale: 0, unit: '' } as unknown as TuyaDeviceSchemaIntegerProperty;
    expect(integerToPercentageProperty(property)).toEqual({ minValue: 0, maxValue: 100, minStep: 25, unit: '%' });
  });

  test('integerToPercentageProperty returns 33% steps for 0..3 levels', () => {
    const property = { min: 0, max: 3, step: 1, scale: 0, unit: '' } as unknown as TuyaDeviceSchemaIntegerProperty;
    expect(integerToPercentageProperty(property)).toEqual({ minValue: 0, maxValue: 100, minStep: 33, unit: '%' });
  });

  test('integerToPercentageProperty which step is not 1.', () => {
    const property = { min: 0, max: 20, step: 2, scale: 0, unit: '' } as unknown as TuyaDeviceSchemaIntegerProperty;
    expect(integerToPercentageProperty(property)).toEqual({ minValue: 0, maxValue: 100, minStep: 10, unit: '%' });
  });

  test('enumToPercentageProperty returns 25% steps for 4 enum values', () => {
    const property = { range: ['low', 'medium', 'high', 'auto'] } as unknown as TuyaDeviceSchemaEnumProperty;
    expect(enumToPercentageProperty(property)).toEqual({ minValue: 0, maxValue: 100, minStep: 25, unit: '%' });
  });

});