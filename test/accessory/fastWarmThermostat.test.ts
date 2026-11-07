/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ThermostatAccessory from '../../src/accessory/ThermostatAccessory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import { FASTWARM_CURRENT_TEMPERATURE_SCHEMA } from '../../src/device/profile/FastWarmThermostat';
import { initLogger } from '../../src/util/Logger';

const CURRENT_STATE = { OFF: 0, HEAT: 1, COOL: 2 };
const TARGET_STATE = { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
const UNITS = { CELSIUS: 0, FAHRENHEIT: 1 };

class MockHapStatusError extends Error {
  constructor(public hapStatus: number) {
    super('Temperature unavailable');
  }
}

describe('FastWarm thermostat HomeKit characteristics', () => {
  let device: TuyaDevice;
  let manager: any;
  let accessory: ThermostatAccessory;
  let characteristics: Map<any, any>;

  beforeEach(() => {
    characteristics = new Map();
    const makeService = () => {
      const service: any = {
        getCharacteristic: (type: any) => {
          if (!characteristics.has(type)) {
            const characteristic: any = {
              onGet: (handler: any) => { characteristic.getHandler = handler; return characteristic; },
              onSet: (handler: any) => { characteristic.setHandler = handler; return characteristic; },
              setProps: jest.fn(() => characteristic),
            };
            characteristics.set(type, characteristic);
          }
          return characteristics.get(type);
        },
        setCharacteristic: () => service,
      };
      return service;
    };
    const services = new Map<any, any>();
    device = new TuyaDevice({
      id: 'thermostat-1', name: 'Room', product_id: 'lmtejj3f4kafi2k1', online: true,
      schema: [
        { ...FASTWARM_CURRENT_TEMPERATURE_SCHEMA },
        {
          code: 'temp_set', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Integer,
          property: { min: 41, max: 1040, scale: 1, step: 1, unit: '' },
        },
        { code: 'switch', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Boolean, property: {} },
        {
          code: 'temp_unit_convert', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Enum,
          property: { range: ['c', 'f'] },
        },
      ],
      status: [
        { code: 'temp_current', value: 195 }, { code: 'temp_set', value: 200 },
        { code: 'switch', value: true }, { code: 'temp_unit_convert', value: 'c' },
      ],
    });
    manager = {
      getDevice: () => device,
      refreshSupplementalTemperature: jest.fn(async () => undefined),
      sendCommands: jest.fn(async () => true),
    };
    const platform: any = {
      deviceManager: manager, options: {}, getDeviceSchemaConfig: () => undefined,
      api: { hap: {
        Service: { AccessoryInformation: 'Information', Thermostat: 'Thermostat' },
        Characteristic: {
          CurrentTemperature: 'CurrentTemperature', TargetTemperature: 'TargetTemperature',
          CurrentHeatingCoolingState: CURRENT_STATE, TargetHeatingCoolingState: TARGET_STATE,
          TemperatureDisplayUnits: UNITS,
        },
        HapStatusError: MockHapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      } },
    };
    const bridgeAccessory: any = {
      context: { deviceID: device.id },
      getService: (type: any) => services.get(type),
      addService: (type: any) => { const service = makeService(); services.set(type, service); return service; },
    };
    initLogger({ info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() });
    accessory = new ThermostatAccessory(platform, bridgeAccessory);
  });

  test('shows measured 19.5°C separately from the 20°C setpoint', async () => {
    accessory.configureServices();
    expect(await characteristics.get('CurrentTemperature').getHandler()).toBe(19.5);
    expect(characteristics.get('TargetTemperature').getHandler()).toBe(20);
  });

  test('keeps controls configured but reports unavailable when the measured value is missing', async () => {
    device.status = device.status.filter(status => status.code !== 'temp_current');
    expect(accessory.checkRequirements()).toBe(true);
    accessory.configureServices();
    await expect(characteristics.get('CurrentTemperature').getHandler()).rejects.toBeInstanceOf(MockHapStatusError);
    expect(characteristics.get('TargetTemperature').getHandler()).toBe(20);
    expect(characteristics.get(TARGET_STATE).setHandler).toBeDefined();
  });

  test('uses a measurement recovered by the read-only refresh', async () => {
    device.status = device.status.filter(status => status.code !== 'temp_current');
    manager.refreshSupplementalTemperature.mockImplementation(async () => {
      device.status.push({ code: 'temp_current', value: 180 });
    });
    accessory.configureServices();
    expect(await characteristics.get('CurrentTemperature').getHandler()).toBe(18);
  });

  test('serves a cached measurement without waiting for a slow cloud refresh', async () => {
    manager.refreshSupplementalTemperature.mockReturnValue(new Promise(() => undefined));
    accessory.configureServices();
    expect(await characteristics.get('CurrentTemperature').getHandler()).toBe(19.5);
  });

  test('reports a missing measurement immediately while a cloud refresh is still pending', async () => {
    device.status = device.status.filter(status => status.code !== 'temp_current');
    manager.refreshSupplementalTemperature.mockReturnValue(new Promise(() => undefined));
    accessory.configureServices();
    await expect(characteristics.get('CurrentTemperature').getHandler()).rejects.toBeInstanceOf(MockHapStatusError);
  });

  test('reports unavailable when offline', async () => {
    device.online = false;
    accessory.configureServices();
    await expect(characteristics.get('CurrentTemperature').getHandler()).rejects.toBeInstanceOf(MockHapStatusError);
    expect(manager.refreshSupplementalTemperature).not.toHaveBeenCalled();
  });

  test.each(['f', 'F', 'unknown'])('reports unavailable for unverified units %s', async unit => {
    device.status.find(status => status.code === 'temp_unit_convert')!.value = unit;
    accessory.configureServices();
    await expect(characteristics.get('CurrentTemperature').getHandler()).rejects.toBeInstanceOf(MockHapStatusError);
    expect(characteristics.get(CURRENT_STATE).getHandler()).toBe(CURRENT_STATE.OFF);
  });

  test('never reports Cooling for the heating-only FastWarm thermostat', () => {
    accessory.configureServices();
    expect(characteristics.get(CURRENT_STATE).getHandler()).toBe(CURRENT_STATE.HEAT);
    device.status.find(status => status.code === 'temp_current')!.value = 220;
    expect(characteristics.get(CURRENT_STATE).getHandler()).toBe(CURRENT_STATE.OFF);
    device.status.find(status => status.code === 'switch')!.value = false;
    expect(characteristics.get(CURRENT_STATE).getHandler()).toBe(CURRENT_STATE.OFF);
  });

  test('preserves standard setpoint, switch and display-unit commands', async () => {
    accessory.configureServices();
    await characteristics.get('TargetTemperature').setHandler(21);
    expect(manager.sendCommands).toHaveBeenLastCalledWith(device.id, [{ code: 'temp_set', value: 210 }]);
    await characteristics.get(TARGET_STATE).setHandler(TARGET_STATE.OFF);
    expect(manager.sendCommands).toHaveBeenLastCalledWith(device.id, [{ code: 'switch', value: false }]);
    await characteristics.get(UNITS).setHandler(UNITS.FAHRENHEIT);
    expect(manager.sendCommands).toHaveBeenLastCalledWith(device.id, [{ code: 'temp_unit_convert', value: 'f' }]);
  });

  test('leaves the generic thermostat behavior unchanged', () => {
    device.product_id = 'another-product';
    device.status = device.status.filter(status => status.code !== 'temp_current');
    device.schema = device.schema.filter(schema => schema.code !== 'temp_current');
    accessory.configureServices();
    expect(characteristics.get('CurrentTemperature').getHandler()).toBe(20);
    expect(manager.refreshSupplementalTemperature).not.toHaveBeenCalled();
  });
});
