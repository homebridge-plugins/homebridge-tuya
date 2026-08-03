import { describe, expect, jest, test } from '@jest/globals';
import BaseAccessory from '../../src/accessory/BaseAccessory';
import { configureRotationSpeed } from '../../src/accessory/characteristic/RotationSpeed';
import { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';

describe('configureRotationSpeed', () => {
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
      updateValue: jest.fn(() => characteristic),
      setProps: jest.fn(() => characteristic),
    };
    const service = {
      getCharacteristic: jest.fn(() => characteristic),
    };
    const sendCommands = jest.fn(async () => undefined);
    const accessory = {
      Characteristic: { RotationSpeed: 'RotationSpeed' },
      getStatus: jest.fn(() => ({ code: 'fan_speed_percent', value: rawLevel })),
      sendCommands,
    } as unknown as BaseAccessory;
    const schema = {
      code: 'fan_speed_percent',
      mode: TuyaDeviceSchemaMode.READ_WRITE,
      type: TuyaDeviceSchemaType.Integer,
      property: { min: 1, max: 4, scale: 0, step: 1, unit: '' },
    };

    configureRotationSpeed(accessory, service as never, schema);

    expect(characteristic.setProps).toHaveBeenCalledWith({ minValue: 0, maxValue: 100, minStep: 25 });
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
