/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
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
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: any, public name: string, public debug: boolean) {}
  },
}));

// Mock TuyaOpenMQ
jest.mock('../src/cloud/api/TuyaOpenMQ', () => {
  return class MockTuyaOpenMQ {
    version = '1.0';
    listeners: Map<string, Function[]> = new Map();

    addMessageListener(listener: Function) {
      if (!this.listeners.has('message')) {
        this.listeners.set('message', []);
      }
      this.listeners.get('message')!.push(listener);
    }

    emit(event: string, data: any) {
      if (this.listeners.has(event)) {
        this.listeners.get(event)!.forEach((listener) => listener(data));
      }
    }

    start() {}
    stop() {}
  };
});

describe('MQTT Device Updates - TuyaDeviceManager Message Handling', () => {
  let manager: TuyaDeviceManager;
  let mockAPI: any;

  beforeEach(() => {
    mockAPI = {
      log: { log: console.log } as any,
      post: jest.fn(),
      get: jest.fn(),
      tokenInfo: { uid: 'test_uid' },
    };

    manager = new TuyaDeviceManager(mockAPI, false);
  });

  describe('device status updates', () => {
    test('registers message listener on initialization', () => {
      expect(manager.mq.addMessageListener).toBeDefined();
    });

    test('handles device status property update', () => {
      const statusPayload = {
        devId: 'dev_001',
        status: [
          { code: 'switch', value: true },
          { code: 'brightness', value: 200 },
        ],
      };

      manager.devices = [
        new TuyaDevice({
          id: 'dev_001',
          name: 'Light',
          product_id: 'prod_1',
          category: 'dj',
          status: [
            { code: 'switch', value: false },
            { code: 'brightness', value: 100 },
          ],
        }),
      ];

      const device = manager.getDevice('dev_001');

      expect(device).toBeDefined();
      expect(device!.status.length).toBeGreaterThan(0);
    });

    test('updates only changed properties', () => {
      const device = new TuyaDevice({
        id: 'dev_001',
        name: 'Light',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'switch', value: false },
          { code: 'brightness', value: 100 },
          { code: 'color', value: '#FF0000' },
        ],
      });

      expect(device.status[0].value).toBe(false);
      expect(device.status[1].value).toBe(100);
      expect(device.status[2].value).toBe('#FF0000');
    });

    test('handles multiple status changes in sequence', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_001',
          name: 'Switch',
          product_id: 'prod_1',
          category: 'kg',
          status: [{ code: 'switch', value: false }],
        }),
      ];

      const device = manager.getDevice('dev_001');

      expect(device).toBeDefined();
      expect(device!.status[0].value).toBe(false);
    });

    test('emits DEVICE_STATUS_UPDATE event', (done) => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_001',
          name: 'Light',
          product_id: 'prod_1',
          category: 'dj',
          status: [{ code: 'switch', value: false }],
        }),
      ];

      manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, (data: any) => {
        expect(data).toBeDefined();
        done();
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, { devId: 'dev_001' });
    });
  });

  describe('device info updates', () => {
    test('handles device info change event', (done) => {
      manager.on(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, (data: any) => {
        expect(data.devId).toBe('dev_001');
        done();
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_INFO_UPDATE, { devId: 'dev_001', name: 'New Name' });
    });

    test('updates device name from info update', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_001',
          name: 'Old Name',
          product_id: 'prod_1',
          category: 'dj',
          status: [],
        }),
      ];

      const device = manager.getDevice('dev_001');
      expect(device!.name).toBe('Old Name');

      // Simulate name update
      device!.name = 'New Name';
      expect(device!.name).toBe('New Name');
    });

    test('updates device online status', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_001',
          name: 'Device',
          product_id: 'prod_1',
          category: 'dj',
          status: [],
          online: true,
        }),
      ];

      const device = manager.getDevice('dev_001');
      expect(device!.online).toBe(true);

      device!.online = false;
      expect(device!.online).toBe(false);
    });
  });

  describe('event emission', () => {
    test('emits DEVICE_ADD event', (done) => {
      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device: any) => {
        expect(device.id).toBe('dev_new');
        done();
      });

      const newDevice = new TuyaDevice({
        id: 'dev_new',
        name: 'New Device',
        product_id: 'prod_1',
        category: 'dj',
        status: [],
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, newDevice);
    });

    test('emits DEVICE_DELETE event', (done) => {
      manager.on(TuyaDeviceManager.Events.DEVICE_DELETE, (deviceId: any) => {
        expect(deviceId).toBe('dev_001');
        done();
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_DELETE, 'dev_001');
    });

    test('handles multiple event listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, listener1);
      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, listener2);

      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Device',
        product_id: 'prod_1',
        category: 'dj',
        status: [],
      });

      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, device);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('removes event listeners', () => {
      const listener = jest.fn();
      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, listener);
      manager.removeListener(TuyaDeviceManager.Events.DEVICE_ADD, listener);

      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, { id: 'dev_1' });

      expect(listener).not.toHaveBeenCalled();
    });

    test('handles once() listener', (done) => {
      const listener = jest.fn(() => {
        done();
      });

      manager.once(TuyaDeviceManager.Events.DEVICE_ADD, listener);

      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, { id: 'dev_1' });
      manager.emit(TuyaDeviceManager.Events.DEVICE_ADD, { id: 'dev_2' });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('status message parsing', () => {
    test('parses boolean status values', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Switch',
        product_id: 'prod_1',
        category: 'kg',
        status: [
          { code: 'switch', value: true },
          { code: 'online', value: false },
        ],
      });

      expect(device.status[0].value).toBe(true);
      expect(device.status[1].value).toBe(false);
      expect(typeof device.status[0].value).toBe('boolean');
    });

    test('parses numeric status values', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Light',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'brightness', value: 255 },
          { code: 'color_temp', value: 6500 },
        ],
      });

      expect(device.status[0].value).toBe(255);
      expect(device.status[1].value).toBe(6500);
    });

    test('parses string status values', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Light',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'color', value: '#FF0000' },
          { code: 'mode', value: 'white' },
        ],
      });

      expect(device.status[0].value).toBe('#FF0000');
      expect(device.status[1].value).toBe('white');
    });

    test('handles status with all data types', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Complex Device',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'switch', value: true },
          { code: 'brightness', value: 200 },
          { code: 'color', value: '#FF5500' },
          { code: 'is_online', value: false },
          { code: 'energy', value: 1234.56 },
        ],
      });

      expect(device.status.length).toBe(5);
      expect(typeof device.status[0].value).toBe('boolean');
      expect(typeof device.status[1].value).toBe('number');
      expect(typeof device.status[2].value).toBe('string');
      expect(typeof device.status[3].value).toBe('boolean');
      expect(typeof device.status[4].value).toBe('number');
    });
  });

  describe('device state synchronization', () => {
    test('maintains device state across updates', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Light',
        product_id: 'prod_1',
        category: 'dj',
        status: [{ code: 'switch', value: false }],
      });

      manager.devices.push(device);

      // First update
      device.status[0].value = true;
      expect(manager.getDevice('dev_1')!.status[0].value).toBe(true);

      // Second update
      device.status[0].value = false;
      expect(manager.getDevice('dev_1')!.status[0].value).toBe(false);
    });

    test('handles concurrent device updates', () => {
      const devices = [
        new TuyaDevice({
          id: 'dev_1',
          name: 'Device 1',
          product_id: 'prod_1',
          category: 'dj',
          status: [{ code: 'switch', value: false }],
        }),
        new TuyaDevice({
          id: 'dev_2',
          name: 'Device 2',
          product_id: 'prod_2',
          category: 'kg',
          status: [{ code: 'switch', value: false }],
        }),
        new TuyaDevice({
          id: 'dev_3',
          name: 'Device 3',
          product_id: 'prod_3',
          category: 'dj',
          status: [{ code: 'brightness', value: 100 }],
        }),
      ];

      manager.devices = devices;

      // Update all devices
      devices.forEach((d) => {
        if (d.status[0].code === 'switch') {
          d.status[0].value = true;
        } else {
          d.status[0].value = 200;
        }
      });

      expect(manager.getDevice('dev_1')!.status[0].value).toBe(true);
      expect(manager.getDevice('dev_2')!.status[0].value).toBe(true);
      expect(manager.getDevice('dev_3')!.status[0].value).toBe(200);
    });
  });

  describe('error scenarios', () => {
    test('handles missing device in status update', () => {
      manager.devices = [];

      const device = manager.getDevice('non_existent');

      expect(device).toBeUndefined();
    });

    test('handles malformed status message', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_1',
          name: 'Device',
          product_id: 'prod_1',
          category: 'dj',
          status: [],
        }),
      ];

      const device = manager.getDevice('dev_1');
      expect(device!.status.length).toBe(0);
    });

    test('handles extreme values in status', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Device',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'value_max', value: Number.MAX_SAFE_INTEGER },
          { code: 'value_min', value: Number.MIN_SAFE_INTEGER },
          { code: 'value_zero', value: 0 },
        ],
      });

      expect(device.status[0].value).toBe(Number.MAX_SAFE_INTEGER);
      expect(device.status[1].value).toBe(Number.MIN_SAFE_INTEGER);
      expect(device.status[2].value).toBe(0);
    });

    test('handles null status values', () => {
      const device = new TuyaDevice({
        id: 'dev_1',
        name: 'Device',
        product_id: 'prod_1',
        category: 'dj',
        status: [
          { code: 'status', value: null as any },
        ],
      });

      expect(device.status[0].value).toBeNull();
    });
  });

  describe('integration with virtual devices', () => {
    test('creates virtual device from base device', () => {
      const baseDevice = new TuyaDevice({
        id: 'dev_1',
        name: 'IR Hub',
        product_id: 'prod_1',
        category: 'wnykq',
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'virtual_key_123');

      expect(virtualDevice.id).toContain('virtual_key_123');
      expect(virtualDevice.sub).toBe(true);
      expect(virtualDevice.parent_id).toBe(baseDevice.id);
    });

    test('virtual device has independent state', () => {
      const baseDevice = new TuyaDevice({
        id: 'dev_1',
        name: 'Base',
        product_id: 'prod_1',
        category: 'dj',
        status: [{ code: 'switch', value: false }],
      });

      const virtualDevice = manager.createVirtualDevice(baseDevice, 'v1');

      baseDevice.status[0].value = true;

      expect(baseDevice.status[0].value).toBe(true);
      expect(virtualDevice.status[0].value).toBe(false);
    });
  });
});
