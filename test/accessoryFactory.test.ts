/* eslint-disable no-console */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { PlatformAccessory } from 'homebridge';
import AccessoryFactory from '../src/shared/AccessoryFactory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../src/cloud/device/TuyaDevice';
import { TuyaPlatform } from '../src/platform';

describe('AccessoryFactory', () => {
  let mockPlatform: Partial<TuyaPlatform>;
  let mockAccessory: Partial<PlatformAccessory>;

  beforeEach(() => {
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
      static Active = { UUID: 'uuid-active', INACTIVE: 0, ACTIVE: 1 };
      static CurrentHeatingCoolingState = { UUID: 'uuid-heating-cooling', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
      static TargetHeatingCoolingState = { UUID: 'uuid-target-heating-cooling', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
      static TemperatureDisplayUnits = { UUID: 'uuid-temp-units', CELSIUS: 0, FAHRENHEIT: 1 };
      static CurrentHeaterCoolerState = { UUID: 'uuid-current-heater-cooler', IDLE: 0, HEATING: 1, COOLING: 2 };
      static TargetHeaterCoolerState = { UUID: 'uuid-target-heater-cooler', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
    }

    mockPlatform = {
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
      },
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
      options: {
        debug: false,
        debugLevel: '',
      },
      deviceManager: {
        getDevice: jest.fn().mockReturnValue({
          id: 'test_device',
          name: 'Test Device',
          schema: [],
          status: [],
          product_id: 'test_product',
          category: 'dj',
          product_name: 'Light',
          uuid: 'test-device-uuid',
          model: 'Model X',
          isVirtualDevice: jest.fn().mockReturnValue(false),
          isIRControlHub: jest.fn().mockReturnValue(false),
        }),
      },
      getDeviceSchemaConfig: jest.fn().mockReturnValue(null),
      getDeviceStatusProperty: jest.fn().mockReturnValue(undefined),
    } as any;

    mockAccessory = {
      UUID: 'test-uuid',
      displayName: 'Test Device',
      context: {
        deviceID: 'test_device',
      },
      services: [],
      getService: jest.fn().mockReturnValue(undefined),
      addService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn(function() { return this; }),
          onSet: jest.fn(function() { return this; }),
          setProps: jest.fn().mockReturnThis(),
        }),
      }),
      removeAllListeners: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      configureController: jest.fn(),
    } as any;
  });

  describe('createAccessory', () => {
    test('creates accessory for valid device', () => {
      const device = new TuyaDevice({
        id: 'test_device',
        product_id: 'test_product',
        category: 'light',
        name: 'Test Light',
      });

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
      expect(accessory).not.toBeNull();
    });

    test('creates accessory with category fallback', () => {
      const device = new TuyaDevice({
        id: 'test_device',
        product_id: 'unknown_product',
        category: 'switch',
        name: 'Test Switch',
      });

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles unknown category gracefully', () => {
      const device = new TuyaDevice(
        {
          id: 'test_device',
          product_id: 'unknown_product',
          category: 'unknown_category',
          name: 'Unknown Device',
        }
      );

      // Should not throw
      expect(() => {
        AccessoryFactory.createAccessory(
          mockPlatform as TuyaPlatform,
          mockAccessory as PlatformAccessory,
          device,
        );
      }).not.toThrow();
    });
  });

  describe('device categories', () => {
    test('handles light category', () => {
      const device = new TuyaDevice(
        {
          id: 'light_1',
          product_id: 'prod_light',
          category: 'dj',
          name: 'Smart Light',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles switch category', () => {
      const device = new TuyaDevice(
        {
          id: 'switch_1',
          product_id: 'prod_switch',
          category: 'kg',
          name: 'Smart Switch',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles outlet category', () => {
      const device = new TuyaDevice(
        {
          id: 'outlet_1',
          product_id: 'prod_outlet',
          category: 'cz',
          name: 'Smart Outlet',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles fan category', () => {
      const device = new TuyaDevice(
        {
          id: 'fan_1',
          product_id: 'prod_fan',
          category: 'fs',
          name: 'Smart Fan',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles thermostat category', () => {
      const device = new TuyaDevice(
        {
          id: 'thermostat_1',
          product_id: 'prod_thermostat',
          category: 'wk',
          name: 'Smart Thermostat',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles lock category', () => {
      const device = new TuyaDevice(
        {
          id: 'lock_1',
          product_id: 'prod_lock',
          category: 'jtmspro',
          name: 'Smart Lock',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles security system category', () => {
      const device = new TuyaDevice(
        {
          id: 'security_1',
          product_id: 'prod_security',
          category: 'zd_3in1',
          name: 'Security Hub',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles camera category', () => {
      const device = new TuyaDevice(
        {
          id: 'camera_1',
          product_id: 'prod_camera',
          category: 'sp',
          name: 'Smart Camera',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });
  });

  describe('device properties', () => {
    test('handles device with standard schema', () => {
      const device = new TuyaDevice(
        {
          id: 'device_with_schema',
          product_id: 'prod_123',
          category: 'kg',
          name: 'Device',
          status: [
            { code: 'switch_1', value: true },
          ],
          schema: [
            {
              code: 'switch_1',
              mode: TuyaDeviceSchemaMode.READ_WRITE,
              type: TuyaDeviceSchemaType.Boolean,
              property: {} as any,
            },
          ],
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles device with minimal properties', () => {
      const device = new TuyaDevice(
        {
          id: 'minimal_device',
          product_id: 'prod_minimal',
          category: 'kg',
          name: 'Minimal',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles device with no product_id', () => {
      const device = new TuyaDevice(
        {
          id: 'device_no_product',
          product_id: '',
          category: 'kg',
          name: 'No Product ID',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });
  });

  describe('IR Remote Control devices', () => {
    test('handles IR remote control - generic', () => {
      const device = new TuyaDevice(
        {
          id: 'ir_remote_1',
          product_id: 'ir_prod',
          category: 'ir',
          name: 'IR Remote',
          remote_keys: {
            category_id: 99,
            org_category_id: 99,
            brand_id: 0,
            remote_index: 0,
            single_air: false,
            duplicate_power: false,
            key_list: [],
            key_range: [],
          },
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles IR remote control - AC', () => {
      const device = new TuyaDevice(
        {
          id: 'ir_ac_1',
          product_id: 'ir_ac_prod',
          category: 'ir',
          name: 'IR AC Remote',
          remote_keys: {
            category_id: 5, // AC
            org_category_id: 5,
            brand_id: 0,
            remote_index: 0,
            single_air: false,
            duplicate_power: false,
            key_list: [],
            key_range: [],
          },
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('handles device with special characters in name', () => {
      const device = new TuyaDevice(
        {
          id: 'device_special',
          product_id: 'prod_special',
          category: 'kg',
          name: 'Device "Test" & More!',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles device with empty name', () => {
      const device = new TuyaDevice(
        {
          id: 'device_no_name',
          product_id: 'prod_no_name',
          category: 'kg',
          name: '',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });

    test('handles device with unicode characters', () => {
      const device = new TuyaDevice(
        {
          id: 'device_unicode',
          product_id: 'prod_unicode',
          category: 'kg',
          name: '智能开关 中文设备',
        }
      );

      const accessory = AccessoryFactory.createAccessory(
        mockPlatform as TuyaPlatform,
        mockAccessory as PlatformAccessory,
        device,
      );

      expect(accessory).toBeDefined();
    });
  });
});
