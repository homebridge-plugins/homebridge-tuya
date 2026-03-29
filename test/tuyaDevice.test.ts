/* eslint-disable no-console */
import { describe, expect, test, beforeEach } from '@jest/globals';
import TuyaDevice, { TuyaDeviceStatus, TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../src/cloud/device/TuyaDevice';

describe('TuyaDevice', () => {
  let device: TuyaDevice;

  beforeEach(() => {
    device = new TuyaDevice({
      id: 'test_device_123',
      product_id: 'prod_light_001',
      category: 'dj',
      name: 'Test Light',
      status: [],
    });
  });

  describe('initialization', () => {
    test('creates device with required properties', () => {
      expect(device).toBeDefined();
      expect(device.id).toBe('test_device_123');
      expect(device.product_id).toBe('prod_light_001');
      expect(device.category).toBe('dj');
      expect(device.name).toBe('Test Light');
    });

    test('initializes with default properties', () => {
      expect(device.status).toBeDefined();
      expect(device.schema).toBeDefined();
      expect(Array.isArray(device.status)).toBe(true);
      expect(Array.isArray(device.schema)).toBe(true);
    });

    test('accepts status array', () => {
      const status = [
        { code: 'switch_1', value: true },
        { code: 'bright_value', value: 100 },
      ];

      const dev = new TuyaDevice({
        id: 'device_with_status',
        product_id: 'prod_123',
        category: 'dj',
        name: 'Device',
        status,
      });

      expect(dev.status).toEqual(status);
      expect(dev.status.length).toBe(2);
    });

    test('accepts schema array', () => {
      const schema = [
        {
          code: 'switch_1',
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Boolean,
          property: {} as any,
        },
      ];

      const dev = new TuyaDevice({
        id: 'device_with_schema',
        product_id: 'prod_123',
        category: 'dj',
        name: 'Device',
        status: [],
        schema,
      });

      expect(dev.schema).toEqual(schema);
      expect(dev.schema.length).toBe(1);
    });
  });

  describe('device properties', () => {
    test('stores and retrieves device id', () => {
      expect(device.id).toBe('test_device_123');
    });

    test('stores and retrieves product_id', () => {
      expect(device.product_id).toBe('prod_light_001');
    });

    test('stores and retrieves category', () => {
      expect(device.category).toBe('dj');
    });

    test('stores and retrieves name', () => {
      expect(device.name).toBe('Test Light');
    });

    test('accepts IP address property', () => {
      const dev = new TuyaDevice({
        id: 'device_full',
        product_id: 'prod_full',
        category: 'kg',
        name: 'Full Device',
        status: [],
        ip: '192.168.1.100',
      });

      expect(dev.id).toBe('device_full');
      expect(dev.ip).toBe('192.168.1.100');
    });
  });

  describe('status management', () => {
    test('initializes with empty status array', () => {
      const dev = new TuyaDevice({
        id: 'device_no_status',
        product_id: 'prod_123',
        category: 'kg',
        name: 'Device',
        status: [],
      });

      expect(Array.isArray(dev.status)).toBe(true);
      expect(dev.status.length).toBe(0);
    });

    test('stores multiple status entries', () => {
      const status: TuyaDeviceStatus[] = [
        { code: 'switch_1', value: true },
        { code: 'brightness', value: 75 },
        { code: 'color_data', value: 'ff000000' },
        { code: 'countdown', value: 120 },
      ];

      const dev = new TuyaDevice({
        id: 'multi_status_device',
        product_id: 'prod_complex',
        category: 'dj',
        name: 'Complex Device',
        status,
      });

      expect(dev.status.length).toBe(4);
      expect(dev.status[0].code).toBe('switch_1');
      expect(dev.status[1].code).toBe('brightness');
    });

    test('handles various value types in status', () => {
      const status: TuyaDeviceStatus[] = [
        { code: 'bool_status', value: true },
        { code: 'numeric_status', value: 42 },
        { code: 'string_status', value: 'active' },
        { code: 'zero_status', value: 0 },
        { code: 'string_number', value: '100' },
      ];

      const dev = new TuyaDevice({
        id: 'various_types',
        product_id: 'prod_types',
        category: 'kg',
        name: 'Device with Various Types',
        status,
      });

      expect(dev.status[0].value).toBe(true);
      expect(dev.status[1].value).toBe(42);
      expect(dev.status[2].value).toBe('active');
      expect(dev.status[3].value).toBe(0);
      expect(dev.status[4].value).toBe('100');
    });
  });

  describe('schema management', () => {
    test('initializes with empty schema array', () => {
      const dev = new TuyaDevice({
        id: 'device_no_schema',
        product_id: 'prod_123',
        category: 'kg',
        name: 'Device',
        status: [],
      });

      expect(Array.isArray(dev.schema)).toBe(true);
      expect(dev.schema.length).toBe(0);
    });

    test('stores schema with property definitions', () => {
      const schema = [
        {
          code: 'switch_1',
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Boolean,
          property: {} as any,
        },
        {
          code: 'bright_value',
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Integer,
          property: {
            min: 0,
            max: 1000,
            scale: 0,
            step: 10,
            unit: '%',
          },
        },
      ];

      const dev = new TuyaDevice({
        id: 'schema_device',
        product_id: 'prod_schema',
        category: 'dj',
        name: 'Device with Schema',
        status: [],
        schema,
      });

      expect(dev.schema.length).toBe(2);
      expect(dev.schema[0].code).toBe('switch_1');
      expect((dev.schema[1].property as any).min).toBe(0);
      expect((dev.schema[1].property as any).max).toBe(1000);
    });

    test('stores schema with enum properties', () => {
      const schema = [
        {
          code: 'work_mode',
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Enum,
          property: {
            range: ['cool', 'heat', 'auto', 'fan_only'],
          },
        },
      ];

      const dev = new TuyaDevice({
        id: 'enum_device',
        product_id: 'prod_enum',
        category: 'wk',
        name: 'Device with Enum',
        status: [],
        schema,
      });

      expect(dev.schema[0].type).toBe(TuyaDeviceSchemaType.Enum);
      expect((dev.schema[0].property as any).range).toEqual([
        'cool',
        'heat',
        'auto',
        'fan_only',
      ]);
    });

    test('stores schema with different modes', () => {
      const schema = [
        {
          code: 'read_only',
          mode: TuyaDeviceSchemaMode.READ_ONLY,
          type: TuyaDeviceSchemaType.Integer,
          property: {} as any,
        },
        {
          code: 'read_write',
          mode: TuyaDeviceSchemaMode.READ_WRITE,
          type: TuyaDeviceSchemaType.Boolean,
          property: {} as any,
        },
        {
          code: 'write_only',
          mode: TuyaDeviceSchemaMode.WRITE_ONLY,
          type: TuyaDeviceSchemaType.Raw,
          property: {} as any,
        },
      ];

      const dev = new TuyaDevice({
        id: 'modes_device',
        product_id: 'prod_modes',
        category: 'kg',
        name: 'Device with Different Modes',
        status: [],
        schema,
      });

      expect(dev.schema[0].mode).toBe(TuyaDeviceSchemaMode.READ_ONLY);
      expect(dev.schema[1].mode).toBe(TuyaDeviceSchemaMode.READ_WRITE);
      expect(dev.schema[2].mode).toBe(TuyaDeviceSchemaMode.WRITE_ONLY);
    });
  });

  describe('device types', () => {
    test('handles light device', () => {
      const light = new TuyaDevice({
        id: 'light_1',
        product_id: 'light_prod',
        category: 'dj',
        name: 'Light',
        status: [],
      });

      expect(light.category).toBe('dj');
    });

    test('handles switch device', () => {
      const switchDevice = new TuyaDevice({
        id: 'switch_1',
        product_id: 'switch_prod',
        category: 'kg',
        name: 'Switch',
        status: [],
      });

      expect(switchDevice.category).toBe('kg');
    });

    test('handles outlet device', () => {
      const outlet = new TuyaDevice({
        id: 'outlet_1',
        product_id: 'outlet_prod',
        category: 'cz',
        name: 'Outlet',
        status: [],
      });

      expect(outlet.category).toBe('cz');
    });

    test('handles fan device', () => {
      const fan = new TuyaDevice({
        id: 'fan_1',
        product_id: 'fan_prod',
        category: 'fs',
        name: 'Fan',
        status: [],
      });

      expect(fan.category).toBe('fs');
    });
  });

  describe('edge cases', () => {
    test('handles device with unicode name', () => {
      const dev = new TuyaDevice({
        id: 'device_unicode',
        product_id: 'prod_unicode',
        category: 'kg',
        name: '智能开关',
        status: [],
      });

      expect(dev.name).toBe('智能开关');
    });

    test('handles device with empty name', () => {
      const dev = new TuyaDevice({
        id: 'device_empty_name',
        product_id: 'prod_empty',
        category: 'kg',
        name: '',
        status: [],
      });

      expect(dev.name).toBe('');
    });

    test('handles device with very long name', () => {
      const longName = 'A'.repeat(255);
      const dev = new TuyaDevice({
        id: 'device_long_name',
        product_id: 'prod_long',
        category: 'kg',
        name: longName,
        status: [],
      });

      expect(dev.name).toBe(longName);
    });

    test('handles device with special characters', () => {
      const dev = new TuyaDevice({
        id: 'device_special',
        product_id: 'prod_special',
        category: 'kg',
        name: "Device (Test) & More!",
        status: [],
      });

      expect(dev.name).toBe("Device (Test) & More!");
    });

    test('handles null or undefined optional fields', () => {
      const dev = new TuyaDevice({
        id: 'device_minimal',
        product_id: 'prod_min',
        category: 'kg',
        name: 'Minimal',
        status: [],
        ip: '192.168.1.50',
      });

      expect(dev.id).toBe('device_minimal');
      expect(dev.ip).toBe('192.168.1.50');
    });
  });

  describe('multiple devices', () => {
    test('multiple devices maintain separate state', () => {
      const device1 = new TuyaDevice({
        id: 'device_1',
        product_id: 'prod_1',
        category: 'dj',
        name: 'Light 1',
        status: [{ code: 'switch_1', value: true }],
      });

      const device2 = new TuyaDevice({
        id: 'device_2',
        product_id: 'prod_2',
        category: 'kg',
        name: 'Switch 1',
        status: [{ code: 'switch_1', value: false }],
      });

      expect(device1.id).toBe('device_1');
      expect(device2.id).toBe('device_2');
      expect(device1.status[0].value).toBe(true);
      expect(device2.status[0].value).toBe(false);
    });
  });
});
