/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import TuyaDevice from '../src/cloud/device/TuyaDevice';

// Mock Logger
jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}
    info() {}
    warn() {}
    error() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: any, public name: string, public debug: boolean) {}
  },
}));

describe('Error Handling & Edge Cases', () => {
  describe('device initialization edge cases', () => {
    test('handles device with minimal properties', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
      });

      expect(device).toBeDefined();
      expect(device.id).toBe('device_001');
    });

    test('handles device with null optional fields', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        icon: null as any,
        model: undefined,
        status: [],
      });

      expect(device.id).toBe('device_001');
    });

    test('handles empty string fields', () => {
      const device = new TuyaDevice({
        id: '',
        product_id: '',
        category: 'dj',
        name: '',
        status: [],
      });

      expect(device).toBeDefined();
    });

    test('handles special characters in device name', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device @#$% & ()',
        status: [],
      });

      expect(device.name).toBe('Device @#$% & ()');
    });

    test('handles very long device name', () => {
      const longName = 'A'.repeat(1000);
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: longName,
        status: [],
      });

      expect(device.name).toBe(longName);
    });

    test('handles unicode characters in device name', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: '智能灯 🏠 スマートライト',
        status: [],
      });

      expect(device.name).toBe('智能灯 🏠 スマートライト');
    });
  });

  describe('status handling edge cases', () => {
    test('handles empty status array', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
      });

      expect(device.status.length).toBe(0);
    });

    test('handles status with boolean values', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [
          { code: 'switch', value: true },
          { code: 'online', value: false },
        ],
      });

      expect(device.status[0].value).toBe(true);
      expect(device.status[1].value).toBe(false);
    });

    test('handles status with numeric values', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [
          { code: 'brightness', value: 255 },
          { code: 'temperature', value: -40 },
          { code: 'zero_value', value: 0 },
        ],
      });

      expect(device.status[0].value).toBe(255);
      expect(device.status[1].value).toBe(-40);
      expect(device.status[2].value).toBe(0);
    });

    test('handles status with string values', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [{ code: 'mode', value: 'heat' }],
      });

      expect(device.status[0].value).toBe('heat');
    });

    test('preserves status order from input', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [
          { code: 'zebra', value: 1 },
          { code: 'alpha', value: 2 },
          { code: 'beta', value: 3 },
        ],
      });

      // Status should maintain input order, not be sorted
      expect(device.status[0].code).toBe('zebra');
      expect(device.status[1].code).toBe('alpha');
      expect(device.status[2].code).toBe('beta');
    });

    test('handles duplicate status codes', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [
          { code: 'switch', value: true },
          { code: 'switch', value: false },
        ],
      });

      expect(device.status.length).toBe(2);
    });
  });

  describe('schema handling edge cases', () => {
    test('handles empty schema array', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        schema: [],
      });

      expect(device.schema.length).toBe(0);
    });

    test('handles schema with complex properties', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        schema: [
          {
            code: 'brightness',
            mode: 'rw' as any,
            type: 'Integer' as any,
            property: {
              min: 0,
              max: 255,
              scale: 0,
              step: 1,
              unit: 'lux',
            },
          },
        ],
      });

      expect(device.schema.length).toBe(1);
      expect((device.schema[0].property as any).min).toBe(0);
    });

    test('handles very large schema arrays', () => {
      const largeSchema = Array.from({ length: 1000 }, (_, i) => ({
        code: `property_${i}`,
        mode: 'rw' as any,
        type: 'Boolean' as any,
        property: {} as any,
      }));

      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        schema: largeSchema,
      });

      expect(device.schema.length).toBe(1000);
    });
  });

  describe('device virtual status', () => {
    test('handles virtual device flag', () => {
      const device = new TuyaDevice({
        id: 'virtual_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Virtual',
        status: [],
        sub: true,
        parent_id: 'parent_device',
      });

      expect(device.sub).toBe(true);
      expect(device.parent_id).toBe('parent_device');
    });

    test('detects virtual device by ID prefix', () => {
      const virtualDevice = new TuyaDevice({
        id: 'vdevo123456789',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Virtual',
        status: [],
      });

      expect(virtualDevice.isVirtualDevice()).toBe(true);
    });

    test('regular device is not virtual', () => {
      const regularDevice = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
      });

      expect(regularDevice.isVirtualDevice()).toBe(false);
    });
  });

  describe('device type detection', () => {
    test('detects IR control hub', () => {
      const irHub = new TuyaDevice({
        id: 'wnykq_001',
        product_id: 'ir_prod',
        category: 'wnykq',
        name: 'IR Hub',
        status: [],
      });

      expect(irHub.isIRControlHub()).toBe(true);
    });

    test('detects IR remote control', () => {
      const irRemote = new TuyaDevice({
        id: 'remote_001',
        product_id: 'ir_prod',
        category: 'infrared_ac',
        name: 'IR Remote',
        status: [],
      });

      expect(irRemote.isIRRemoteControl()).toBe(true);
    });

    test('regular device is not IR control', () => {
      const regular = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Light',
        status: [],
      });

      expect(regular.isIRControlHub()).toBe(false);
      expect(regular.isIRRemoteControl()).toBe(false);
    });
  });

  describe('device properties boundary cases', () => {
    test('handles max values for numeric properties', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        create_time: Number.MAX_SAFE_INTEGER,
      });

      expect(device.create_time).toBe(Number.MAX_SAFE_INTEGER);
    });

    test('handles negative values', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        lat: '-90',
        lon: '-180',
      });

      expect(device.lat).toBe('-90');
      expect(device.lon).toBe('-180');
    });

    test('handles geographic coordinates', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        lat: '40.7128',
        lon: '-74.0060',
      });

      expect(device.lat).toBe('40.7128');
      expect(device.lon).toBe('-74.0060');
    });
  });

  describe('array operations on devices', () => {
    test('handles sorting array of devices', () => {
      const devices = [
        new TuyaDevice({
          id: 'z_device',
          product_id: 'prod_z',
          category: 'dj',
          name: 'Z Device',
          status: [],
        }),
        new TuyaDevice({
          id: 'a_device',
          product_id: 'prod_a',
          category: 'dj',
          name: 'A Device',
          status: [],
        }),
        new TuyaDevice({
          id: 'm_device',
          product_id: 'prod_m',
          category: 'dj',
          name: 'M Device',
          status: [],
        }),
      ];

      const sorted = devices.sort((a, b) => a.id.localeCompare(b.id));

      expect(sorted[0].id).toBe('a_device');
      expect(sorted[1].id).toBe('m_device');
      expect(sorted[2].id).toBe('z_device');
    });

    test('handles filtering devices by category', () => {
      const devices = [
        new TuyaDevice({
          id: 'light_1',
          product_id: 'prod_1',
          category: 'dj',
          name: 'Light',
          status: [],
        }),
        new TuyaDevice({
          id: 'switch_1',
          product_id: 'prod_2',
          category: 'kg',
          name: 'Switch',
          status: [],
        }),
        new TuyaDevice({
          id: 'light_2',
          product_id: 'prod_3',
          category: 'dj',
          name: 'Another Light',
          status: [],
        }),
      ];

      const lights = devices.filter((d) => d.category === 'dj');
      expect(lights.length).toBe(2);
    });

    test('handles mapping device properties', () => {
      const devices = [
        new TuyaDevice({
          id: 'dev_1',
          product_id: 'prod_1',
          category: 'dj',
          name: 'Device 1',
          status: [],
        }),
        new TuyaDevice({
          id: 'dev_2',
          product_id: 'prod_2',
          category: 'kg',
          name: 'Device 2',
          status: [],
        }),
      ];

      const ids = devices.map((d) => d.id);
      expect(ids).toEqual(['dev_1', 'dev_2']);
    });
  });

  describe('configuration validation edge cases', () => {
    test('handles missing required fields gracefully', () => {
      const minimalDevice = new TuyaDevice({
        id: 'dev',
        product_id: 'prod',
        category: 'dj',
        name: 'Device',
        status: [],
      });

      expect(minimalDevice).toBeDefined();
      expect(minimalDevice.id).toBe('dev');
    });

    test('handles undefined overwriting default values', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        online: undefined,
      });

      expect(device).toBeDefined();
    });
  });

  describe('concurrent device operations', () => {
    test('handles multiple device instantiations', () => {
      const devices = Array.from({ length: 100 }, (_, i) =>
        new TuyaDevice({
          id: `dev_${i}`,
          product_id: `prod_${i}`,
          category: i % 2 === 0 ? 'dj' : 'kg',
          name: `Device ${i}`,
          status: [],
        })
      );

      expect(devices.length).toBe(100);
      expect(devices[0].id).toBe('dev_0');
      expect(devices[99].id).toBe('dev_99');
    });

    test('devices maintain independent state', () => {
      const device1 = new TuyaDevice({
        id: 'dev_1',
        product_id: 'prod_1',
        category: 'dj',
        name: 'Device 1',
        status: [{ code: 's1', value: 1 }],
      });

      const device2 = new TuyaDevice({
        id: 'dev_2',
        product_id: 'prod_2',
        category: 'kg',
        name: 'Device 2',
        status: [{ code: 's2', value: 2 }],
      });

      expect(device1.status[0].code).toBe('s1');
      expect(device2.status[0].code).toBe('s2');
    });
  });

  describe('null and undefined handling', () => {
    test('handles null in optional fields', () => {
      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        status: [],
        model: null as any,
        icon: null as any,
      });

      expect(device.model).toBe(null);
      expect(device.icon).toBe(null);
    });

    test('distinguishes between undefined and null', () => {
      const device1 = new TuyaDevice({
        id: 'dev1',
        product_id: 'prod1',
        category: 'dj',
        name: 'Dev1',
        status: [],
        model: undefined,
      });

      const device2 = new TuyaDevice({
        id: 'dev2',
        product_id: 'prod2',
        category: 'dj',
        name: 'Dev2',
        status: [],
        model: null as any,
      });

      expect(device1.model).toBeUndefined();
      expect(device2.model).toBeNull();
    });
  });
});
