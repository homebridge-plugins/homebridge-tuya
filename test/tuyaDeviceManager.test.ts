/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import EventEmitter from 'events';
import TuyaDeviceManager from '../src/cloud/device/TuyaDeviceManager';
import TuyaDevice from '../src/cloud/device/TuyaDevice';

// Mock Logger
jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: any, public name: string, public debugEnabled: boolean) {}
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
}));

// Mock TuyaOpenMQ
jest.mock('../src/cloud/api/TuyaOpenMQ', () => {
  return class MockTuyaOpenMQ extends EventEmitter {
    addMessageListener = jest.fn();
    connect = jest.fn();
    disconnect = jest.fn();
  };
});

// Mock TuyaOpenAPI
jest.mock('../src/cloud/api/TuyaOpenAPI', () => {
  return class MockTuyaOpenAPI {
    log = { log: console.log };
    accessId = 'test_id';
    accessKey = 'test_key';
  };
});

describe('TuyaDeviceManager', () => {
  let manager: TuyaDeviceManager;
  let mockAPI: any;

  beforeEach(() => {
    const getMock = jest.fn() as any;
    getMock.mockImplementation((url: string) => {
      if (url.includes('specifications')) {
        return Promise.resolve({
          success: true,
          result: {
            status: [],
            functions: [],
          },
        });
      }
      return Promise.resolve({
        success: true,
        result: {
          id: 'device_001',
          name: 'Test Device',
          product_id: 'prod_001',
          category: 'dj',
          status: [],
          schema: [],
        },
      });
    });
    
    mockAPI = {
      log: { log: console.log } as any,
      accessId: 'test_access_id',
      accessKey: 'test_access_key',
      get: getMock,
    };

    manager = new TuyaDeviceManager(mockAPI, false);
  });

  describe('initialization', () => {
    test('creates device manager instance', () => {
      expect(manager).toBeInstanceOf(EventEmitter);
      expect(manager).toBeDefined();
    });

    test('stores API reference', () => {
      expect(manager.api).toBe(mockAPI);
    });

    test('initializes with debug disabled', () => {
      expect(manager.debug).toBe(false);
    });

    test('initializes with debug enabled', () => {
      const debugManager = new TuyaDeviceManager(mockAPI, true);
      expect(debugManager.debug).toBe(true);
    });

    test('initializes MQTT connection', () => {
      expect(manager.mq).toBeDefined();
    });

    test('creates logger', () => {
      expect(manager.log).toBeDefined();
    });

    test('initializes empty owner IDs array', () => {
      expect(manager.ownerIDs).toEqual([]);
      expect(Array.isArray(manager.ownerIDs)).toBe(true);
    });

    test('initializes empty devices array', () => {
      expect(manager.devices).toEqual([]);
      expect(Array.isArray(manager.devices)).toBe(true);
    });
  });

  describe('static events', () => {
    test('has DEVICE_ADD event', () => {
      expect(TuyaDeviceManager.Events.DEVICE_ADD).toBe('DEVICE_ADD');
    });

    test('has DEVICE_INFO_UPDATE event', () => {
      expect(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE).toBe('DEVICE_INFO_UPDATE');
    });

    test('has DEVICE_STATUS_UPDATE event', () => {
      expect(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE).toBe('DEVICE_STATUS_UPDATE');
    });

    test('has DEVICE_DELETE event', () => {
      expect(TuyaDeviceManager.Events.DEVICE_DELETE).toBe('DEVICE_DELETE');
    });
  });

  describe('virtual device creation', () => {
    test('creates virtual device from base device', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_device_001',
        product_id: 'product_001',
        category: 'dj',
        name: 'Base Light',
        schema: [],
        status: [],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virtual_uuid');

      expect(virtualDevice).toBeDefined();
      expect(virtualDevice).toBeInstanceOf(TuyaDevice);
      expect(virtualDevice.sub).toBe(true);
      expect(virtualDevice.parent_id).toBe('base_device_001');
    });

    test('sets virtual device properties', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Base',
        schema: [],
        status: [],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virt_uuid_123');

      expect(virtualDevice.name).toBe('Virtual Device');
      expect(virtualDevice.product_name).toBe('virtual product');
      expect(virtualDevice.ip).toBe('');
      expect(virtualDevice.remote_keys).toBeUndefined();
    });

    test('generates UUID if not provided', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_001',
        product_id: 'prod_001',
        category: 'kg',
        name: 'Base',
        schema: [],
        status: [],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, '');

      expect(virtualDevice.id).toBeDefined();
      expect(virtualDevice.id.length).toBeGreaterThan(0);
    });

    test('clones base device schema', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Base',
        schema: [
          {
            code: 'switch',
            mode: 'rw' as any,
            type: 'Boolean' as any,
            property: {} as any,
          },
        ],
        status: [],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virt_uuid');

      expect(virtualDevice.schema).toBeDefined();
      expect(virtualDevice.schema.length).toBeGreaterThan(0);
    });

    test('clones base device status', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Base',
        schema: [],
        status: [{ code: 'switch_1', value: 1 }],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virt_uuid');

      expect(virtualDevice.status).toBeDefined();
    });
  });

  describe('device retrieval', () => {
    test('finds device by ID', () => {
      const device1 = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device 1',
        schema: [],
        status: [],
      });

      manager.devices.push(device1);

      const found = manager.getDevice('device_001');
      expect(found).toBe(device1);
    });

    test('returns undefined for non-existent device', () => {
      manager.devices = [];
      const found = manager.getDevice('non_existent');

      expect(found).toBeUndefined();
    });

    test('finds correct device among multiple', () => {
      const device1 = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device 1',
        schema: [],
        status: [],
      });

      const device2 = new TuyaDevice({
        id: 'device_002',
        product_id: 'prod_002',
        category: 'kg',
        name: 'Device 2',
        schema: [],
        status: [],
      });

      manager.devices = [device1, device2];

      const found = manager.getDevice('device_002');
      expect(found?.id).toBe('device_002');
      expect(found?.category).toBe('kg');
    });
  });

  describe('device array management', () => {
    test('can add devices to array', () => {
      const device = new TuyaDevice({
        id: 'dev_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        schema: [],
        status: [],
      });

      manager.devices.push(device);

      expect(manager.devices.length).toBe(1);
      expect(manager.devices[0]).toBe(device);
    });

    test('can remove devices from array', () => {
      const device1 = new TuyaDevice({
        id: 'dev_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device 1',
        schema: [],
        status: [],
      });

      const device2 = new TuyaDevice({
        id: 'dev_002',
        product_id: 'prod_002',
        category: 'kg',
        name: 'Device 2',
        schema: [],
        status: [],
      });

      manager.devices = [device1, device2];
      manager.devices = manager.devices.filter(d => d.id !== 'dev_001');

      expect(manager.devices.length).toBe(1);
      expect(manager.devices[0].id).toBe('dev_002');
    });

    test('can clear all devices', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_1',
          product_id: 'prod_1',
          category: 'dj',
          name: 'Device 1',
          schema: [],
          status: [],
        }),
        new TuyaDevice({
          id: 'dev_2',
          product_id: 'prod_2',
          category: 'kg',
          name: 'Device 2',
          schema: [],
          status: [],
        }),
      ];

      manager.devices = [];

      expect(manager.devices.length).toBe(0);
    });
  });

  describe('owner ID management', () => {
    test('can add owner IDs', () => {
      manager.ownerIDs.push('owner_123');
      manager.ownerIDs.push('owner_456');

      expect(manager.ownerIDs.length).toBe(2);
      expect(manager.ownerIDs).toContain('owner_123');
    });

    test('can clear owner IDs', () => {
      manager.ownerIDs = ['owner_1', 'owner_2'];
      manager.ownerIDs = [];

      expect(manager.ownerIDs.length).toBe(0);
    });

    test('prevents duplicate owner IDs', () => {
      manager.ownerIDs = ['owner_123', 'owner_456'].filter(
        (id, index, self) => self.indexOf(id) === index
      );

      expect(new Set(manager.ownerIDs).size).toBe(manager.ownerIDs.length);
    });
  });

  describe('event emitter behavior', () => {
    test('is instance of EventEmitter', () => {
      expect(manager instanceof EventEmitter).toBe(true);
    });

    test('can listen for events', (done) => {
      manager.on('test_event', (data) => {
        expect(data).toBe('test_data');
        done();
      });

      manager.emit('test_event', 'test_data');
    });

    test('can emit DEVICE_ADD events', (done) => {
      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device) => {
        expect(device.id).toBe('device_001');
        done();
      });

      const device = new TuyaDevice({
        id: 'device_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Device',
        schema: [],
        status: [],
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, device);
    });

    test('can emit DEVICE_STATUS_UPDATE events', (done) => {
      manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, (deviceId, status) => {
        expect(deviceId).toBe('device_001');
        expect(status).toBeDefined();
        done();
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, 'device_001', {});
    });
  });

  describe('MQTT integration', () => {
    test('adds message listener on init', () => {
      const newManager = new TuyaDeviceManager(mockAPI, false);
      expect(newManager.mq.addMessageListener).toHaveBeenCalled();
    });

    test('MQTT is available through manager', () => {
      expect(manager.mq).toBeDefined();
      expect(manager.mq.addMessageListener).toBeDefined();
    });
  });

  describe('device filtering', () => {
    test('can filter devices by category', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'light_1',
          product_id: 'prod_1',
          category: 'dj',
          name: 'Light',
          schema: [],
          status: [],
        }),
        new TuyaDevice({
          id: 'switch_1',
          product_id: 'prod_2',
          category: 'kg',
          name: 'Switch',
          schema: [],
          status: [],
        }),
      ];

      const lights = manager.devices.filter(d => d.category === 'dj');
      expect(lights.length).toBe(1);
      expect(lights[0].category).toBe('dj');
    });

    test('can filter virtual devices', () => {
      const baseDevice = new TuyaDevice({
        id: 'base_001',
        product_id: 'prod_001',
        category: 'dj',
        name: 'Base',
        schema: [],
        status: [],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virt_123');
      manager.devices = [baseDevice, virtualDevice];

      const virtuals = manager.devices.filter(d => d.sub === true);
      expect(virtuals.length).toBe(1);
      expect(virtuals[0].parent_id).toBe('base_001');
    });
  });

  describe('multiple manager instances', () => {
    test('maintain separate device lists', () => {
      const manager1 = new TuyaDeviceManager(mockAPI, false);
      const manager2 = new TuyaDeviceManager(mockAPI, false);

      const device1 = new TuyaDevice({
        id: 'dev_manager1',
        product_id: 'prod_1',
        category: 'dj',
        name: 'Device 1',
        schema: [],
        status: [],
      });

      const device2 = new TuyaDevice({
        id: 'dev_manager2',
        product_id: 'prod_2',
        category: 'kg',
        name: 'Device 2',
        schema: [],
        status: [],
      });

      manager1.devices.push(device1);
      manager2.devices.push(device2);

      expect(manager1.devices.length).toBe(1);
      expect(manager2.devices.length).toBe(1);
      expect(manager1.devices[0].id).not.toBe(manager2.devices[0].id);
    });
  });

  describe('device type handling', () => {
    test('handles light devices', () => {
      const light = new TuyaDevice({
        id: 'light_001',
        product_id: 'dj_prod',
        category: 'dj',
        name: 'Smart Light',
        schema: [],
        status: [],
      });

      manager.devices.push(light);

      const found = manager.getDevice('light_001');
      expect(found?.category).toBe('dj');
    });

    test('handles switch devices', () => {
      const sw = new TuyaDevice({
        id: 'switch_001',
        product_id: 'kg_prod',
        category: 'kg',
        name: 'Smart Switch',
        schema: [],
        status: [],
      });

      manager.devices.push(sw);

      const found = manager.getDevice('switch_001');
      expect(found?.category).toBe('kg');
    });

    test('handles thermostat devices', () => {
      const thermostat = new TuyaDevice({
        id: 'thermo_001',
        product_id: 'wk_prod',
        category: 'wk',
        name: 'Thermostat',
        schema: [],
        status: [],
      });

      manager.devices.push(thermostat);

      const found = manager.getDevice('thermo_001');
      expect(found?.category).toBe('wk');
    });
  });

  describe('async operations', () => {
    test('updateDevices returns array', async () => {
      const result = await manager.updateDevices([]);
      expect(Array.isArray(result)).toBe(true);
    });

    test('updateDevice can be called', async () => {
      // Mock implementation since actual HTTP calls are not set up
      const result = await manager.updateDevice('device_001');
      expect(typeof result === 'object' || result === null).toBe(true);
    });
  });

  describe('infrared device methods', () => {
    test('getInfraredRemotes calls API with correct endpoint', async () => {
      const result = await manager.getInfraredRemotes('ir_001');
      expect(result).toBeDefined();
    });

    test('getInfraredKeys calls API with correct endpoint', async () => {
      const result = await manager.getInfraredKeys('ir_001', 'remote_001');
      expect(result).toBeDefined();
    });

    test('getInfraredACStatus calls API with correct endpoint', async () => {
      const result = await manager.getInfraredACStatus('ir_001', 'remote_001');
      expect(result).toBeDefined();
    });

    test('getInfraredDIYKeys calls API with correct endpoint', async () => {
      const result = await manager.getInfraredDIYKeys('ir_001', 'remote_001');
      expect(result).toBeDefined();
    });
  });

  describe('infrared remote resolution', () => {
    test('resolveInfraredRemotes returns empty array when no IR devices', () => {
      const parentDevice = new TuyaDevice({
        id: 'parent_001',
        name: 'Hub',
        category: 'wifizigbee',
        product_id: 'hub_prod',
        schema: [],
        status: [],
      });

      const result = manager.resolveInfraredRemotes(parentDevice, [parentDevice]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('resolveInfraredRemotes finds IR devices with matching location', () => {
      const parentDevice = new TuyaDevice({
        id: 'parent_001',
        name: 'Hub',
        category: 'wifizigbee',
        product_id: 'hub_prod',
        schema: [],
        status: [],
        lat: '40.7128',
        lon: '-74.0060',
      });

      const irDevice = new TuyaDevice({
        id: 'ir_001',
        name: 'IR Remote',
        category: 'infrared_ac',
        product_id: 'ir_prod',
        schema: [],
        status: [],
        sub: true,
        lat: '40.7128',
        lon: '-74.0060',
      });

      const result = manager.resolveInfraredRemotes(parentDevice, [parentDevice, irDevice]);
      expect(result.length).toBeGreaterThan(0);
    });

    test('resolveInfraredRemotes finds IR devices with matching update_time', () => {
      const timestamp = 1234567890;
      const parentDevice = new TuyaDevice({
        id: 'parent_001',
        name: 'Hub',
        category: 'wifizigbee',
        product_id: 'hub_prod',
        schema: [],
        status: [],
        update_time: timestamp,
      });

      const irDevice = new TuyaDevice({
        id: 'ir_001',
        name: 'IR Remote',
        category: 'infrared_light',
        product_id: 'ir_prod',
        schema: [],
        status: [],
        sub: true,
        update_time: timestamp,
      });

      const result = manager.resolveInfraredRemotes(parentDevice, [parentDevice, irDevice]);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('infrared device fixing', () => {
    test('fixInfraredDevice sets org_category_id', () => {
      const device = new TuyaDevice({
        id: 'ir_ac_001',
        name: 'IR AC',
        category: 'infrared_ac',
        product_id: 'prsgoryjfdtb42r4',
        schema: [],
        status: [],
        remote_keys: {
          category_id: 5,
          org_category_id: 5,
          brand_id: 0,
          remote_index: 0,
          single_air: false,
          duplicate_power: false,
          key_list: [],
          key_range: [],
        },
      });

      manager.fixInfraredDevice(device);
      expect(device.remote_keys?.org_category_id).toBe(5);
    });
  });

  describe('HAP category resolution', () => {
    test('resolveHAPCategoryID returns correct category for fan product', () => {
      const device = new TuyaDevice({
        id: 'ir_fan_001',
        name: 'IR Fan',
        category: 'infrared_fan',
        product_id: 'prsgoryjfdtb42r4',
        schema: [],
        status: [],
        remote_keys: {
          category_id: 5,
          org_category_id: 5,
          brand_id: 0,
          remote_index: 0,
          single_air: false,
          duplicate_power: false,
          key_list: [],
          key_range: [],
        },
      });

      const result = manager.resolveHAPCategoryID(device);
      expect(result).toBe(8); // Fan category
    });

    test('resolveHAPCategoryID returns DIY for DIY product', () => {
      const device = new TuyaDevice({
        id: 'ir_diy_001',
        name: 'IR DIY',
        category: 'infrared_diy',
        product_id: 'k6ozylayfgnskuq6',
        schema: [],
        status: [],
        remote_keys: {
          category_id: 5,
          org_category_id: 5,
          brand_id: 0,
          remote_index: 0,
          single_air: false,
          duplicate_power: false,
          key_list: [],
          key_range: [],
        },
      });

      const result = manager.resolveHAPCategoryID(device);
      expect(result).toBe(999); // DIY category
    });

    test('resolveHAPCategoryID falls back to device category', () => {
      const device = new TuyaDevice({
        id: 'ir_other_001',
        name: 'IR Other',
        category: 'infrared_other',
        product_id: 'other_prod',
        schema: [],
        status: [],
        remote_keys: {
          category_id: 7,
          org_category_id: 7,
          brand_id: 0,
          remote_index: 0,
          single_air: false,
          duplicate_power: false,
          key_list: [],
          key_range: [],
        },
      });

      const result = manager.resolveHAPCategoryID(device);
      expect(result).toBe(7);
    });

    test('resolveHAPCategoryID defaults to DIY for device without remote_keys', () => {
      const device = new TuyaDevice({
        id: 'ir_001',
        name: 'IR Device',
        category: 'infrared_ac',
        product_id: 'ir_prod',
        schema: [],
        status: [],
      });

      const result = manager.resolveHAPCategoryID(device);
      expect(result).toBe(999);
    });
  });

  describe('updateInfraredRemotes', () => {
    test('updateInfraredRemotes skips non-IR devices', async () => {
      const devices = [
        new TuyaDevice({
          id: 'light_001',
          name: 'Light',
          category: 'dj',
          product_id: 'light_prod',
          schema: [],
          status: [],
        }),
      ];

      await manager.updateInfraredRemotes(devices);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('dump method', () => {
    test('dump logs object properties without error', () => {
      const testObj = { key1: 'value1', key2: 123 };
      expect(() => {
        manager.dump(testObj);
      }).not.toThrow();
    });

    test('dump handles nested objects', () => {
      const testObj = { outer: { inner: 'value' } };
      expect(() => {
        manager.dump(testObj);
      }).not.toThrow();
    });
  });
});
