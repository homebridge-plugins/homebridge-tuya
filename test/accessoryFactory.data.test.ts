/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { PlatformAccessory, Service } from 'homebridge';
import AccessoryFactory from '../src/shared/accessory/AccessoryFactory';
import TuyaDevice from '../src/cloud/device/TuyaDevice';
import { TuyaPlatform, TuyaPluginAccessoryContext } from '../src/platform';
import { ExLogger, initLogger } from '../src/shared/util/Logger';
import cz from './data/cz/wja8imamn8sj2sjf.json';
import qn from './data/qn/eabctkdf7akikibf.json';
import SwitchAccessory from '../src/shared/accessory/SwitchAccessory';
import HeaterAccessory from '../src/shared/accessory/HeaterAccessory';

describe('AccessoryFactory data sample', () => {
  let mockPlatform: Partial<TuyaPlatform>;
  let mockAccessory: Partial<PlatformAccessory>;
  let mockAccessoryService: Partial<Service>;

  beforeEach(() => {
    // Mock Logger
    const mockLog: ExLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      success: jest.fn(),
    } as unknown as ExLogger;
    initLogger(console);

    // Create proper HAP mock structure
    class MockService {
      static AccessoryInformation = class {};
      static Lightbulb = class {};
      static Switch = class {};
      static Outlet = class {};
      static Fan = class {};
      static Thermostat = class {};
      static WindowCovering = class {};
      static GarageDoorOpener = class {};
      static LockMechanism = class {};
      static Valve = class {};
      static HeaterCooler = class {};
      static Microphone = class {};
      static Speaker = class {};
    }

    class MockCharacteristic {
      static On = { UUID: 'uuid-on' };
      static Brightness = { UUID: 'uuid-brightness' };
      static Name = { UUID: 'uuid-name' };
      static Manufacturer = { UUID: 'uuid-manufacturer' };
      static Model = { UUID: 'uuid-model' };
      static SerialNumber = { UUID: 'uuid-sn' };
      static AccessoryFlags = { UUID: 'uuid-flags' };
      static Identify = { UUID: 'uuid-identify' };
      static CurrentTemperature = { UUID: 'uuid-temp' };
      static TargetTemperature = { UUID: 'uuid-target-temp' };
      static CurrentRelativeHumidity = { UUID: 'uuid-humidity' };
      static Saturation = { UUID: 'uuid-saturation' };
      static Hue = { UUID: 'uuid-hue' };
      static ColorTemperature = { UUID: 'uuid-color-temp' };
      static RotationSpeed = { UUID: 'uuid-rotation' };
      static CurrentPosition = { UUID: 'uuid-position' };
      static TargetPosition = { UUID: 'uuid-target-pos' };
      static LockCurrentState = { UUID: 'uuid-lock-state' };
      static LockTargetState = { UUID: 'uuid-lock-target' };
      static LockPhysicalControls = { UUID: 'uuid-lock-physical-controls' };
      static Active = { UUID: 'uuid-active', INACTIVE: 0, ACTIVE: 1 };
      static CurrentHeatingCoolingState = { UUID: 'uuid-heating-cooling', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
      static TargetHeatingCoolingState = { UUID: 'uuid-target-heating-cooling', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
      static TemperatureDisplayUnits = { UUID: 'uuid-temp-units', CELSIUS: 0, FAHRENHEIT: 1 };
      static CurrentHeaterCoolerState = { UUID: 'uuid-current-heater-cooler', IDLE: 0, HEATING: 1, COOLING: 2 };
      static TargetHeaterCoolerState = { UUID: 'uuid-target-heater-cooler', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
    }

    mockPlatform = {
      log: mockLog,
      config: {} as any,
      api: {
        hap: {
          Service: MockService as any,
          Characteristic: MockCharacteristic as any,
          CameraController: jest.fn(),
        },
      } as any,
      accessories: [],
      Service: MockService as any,
      Characteristic: MockCharacteristic as any,
      platformConfig: {
        options: {
          debug: false,
          debugLevel: '',
        }
      },
      deviceManager: {
        getDevice: jest.fn(),
        getDeviceConfig: jest.fn().mockReturnValue(undefined),
        getDeviceSchemaConfig: jest.fn().mockReturnValue({})
      },
    } as any;

    mockAccessoryService = {
      testCharacteristic: jest.fn().mockReturnValue(true),
      setCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn().mockReturnValue({
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        setProps: jest.fn().mockReturnThis(),
      }),
    } as any;

    mockAccessory = {
      UUID: 'test-uuid',
      displayName: 'Test Device',
      context: {
        deviceID: 'test_device',
      },
      services: [],
      getService: jest.fn().mockReturnValue(mockAccessoryService),
      addService: jest.fn().mockReturnValue(mockAccessoryService),
      removeService: jest.fn().mockReturnThis(),
      removeAllListeners: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      configureController: jest.fn(),
    } as any;
  });

  test('SwitchAccessory', () => {
    const device = new TuyaDevice(cz as any);

    mockPlatform.deviceManager = {
      ...mockPlatform.deviceManager,
      getDevice: jest.fn().mockReturnValue(device),
      getDeviceConfig: jest.fn().mockReturnValue(undefined),
      getDeviceSchemaConfig: jest.fn().mockReturnValue(undefined)
    } as any;

    const spyGetCharacteristic = jest.spyOn(mockAccessoryService, 'getCharacteristic');

    const accessory = AccessoryFactory.createAccessory(
      mockPlatform as TuyaPlatform,
      mockAccessory as PlatformAccessory<TuyaPluginAccessoryContext>,
      device,
    );

    expect(accessory).toBeDefined();
    expect(accessory).toBeInstanceOf(SwitchAccessory);
    expect(spyGetCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic!.On);
    expect(spyGetCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic!.InUse);
  });

  test('HeaterAccessory', () => {
    const device = new TuyaDevice(qn as any);

    mockPlatform.deviceManager = {
      ...mockPlatform.deviceManager,
      getDevice: jest.fn().mockReturnValue(device),
      getDeviceConfig: jest.fn().mockReturnValue(undefined),
      getDeviceSchemaConfig: jest.fn().mockReturnValue(undefined)
    } as any;

    const spyGetCharacteristic = jest.spyOn(mockAccessoryService, 'getCharacteristic');

    const accessory = AccessoryFactory.createAccessory(
      mockPlatform as TuyaPlatform,
      mockAccessory as PlatformAccessory<TuyaPluginAccessoryContext>,
      device,
    );

    expect(accessory).toBeDefined();
    expect(accessory).toBeInstanceOf(HeaterAccessory);
    expect(spyGetCharacteristic).toHaveBeenCalledWith(mockPlatform.Characteristic!.Active);
  });
});
