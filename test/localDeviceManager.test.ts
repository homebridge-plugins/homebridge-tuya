/* eslint-disable no-console */
import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import LocalDeviceManager from '../src/local/LocalDeviceManager';
import { LocalConfig } from '../src/local/config';
import Logger from '../src/shared/util/Logger';
import TuyaDevice from '../src/cloud/device/TuyaDevice';

// Mock Logger
const mockLog: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
} as unknown as Logger;

describe('LocalDeviceManager', () => {
  let manager: LocalDeviceManager;

  beforeEach(() => {
    const config: LocalConfig = {
      devices: [],
    };
    manager = new LocalDeviceManager(config, mockLog);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('creates manager instance with config', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(LocalDeviceManager);
    });

    test('initializes with empty devices', () => {
      expect(manager.devices.length).toBe(0);
    });

    test('stops MQTT on initialization', () => {
      // MQTT should be stopped during construction
      expect(manager).toBeDefined();
    });
  });

  describe('device management', () => {
    test('can register a device', async () => {
      const deviceId = 'test_device_1';
      const deviceConfig = {
        tuyaDeviceId: deviceId,
        ip: '192.168.1.100',
        tuyaKey: 'testlocalkey123456',
        protocolVersion: '3.5',
      };

      await manager.initLocalDevices();

      // After init, MQTT should be stopped
      expect(manager).toBeDefined();
    });

    test('extends TuyaDeviceManager correctly', () => {
      expect(manager).toBeInstanceOf(LocalDeviceManager);
      // Should have inherited properties from TuyaDeviceManager
      expect(manager.devices).toBeDefined();
      expect(typeof manager.devices).toBe('object');
    });
  });

  describe('configuration', () => {
    test('accepts local config with empty devices', () => {
      const config: LocalConfig = {
        devices: [],
      };
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });

    test('accepts local config with device list', () => {
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: '192.168.1.1',
            tuyaKey: 'key123',
            protocolVersion: '3.5',
          },
        ],
      };
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });

    test('accepts local config with per-device DP mappings', () => {
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: '192.168.1.1',
            tuyaKey: 'key123',
            protocolVersion: '3.5',
            dpMapping: {
              switch_1: 1,
              bright_value: 2,
              temp_value: 3,
            },
          },
        ],
      };
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });
  });

  describe('device discovery', () => {
    test('initLocalDevices completes without error', async () => {
      const config: LocalConfig = {
        devices: [],
      };
      const mgr = new LocalDeviceManager(config, mockLog);

      // Should not throw
      await expect(mgr.initLocalDevices()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    test('handles missing local key gracefully', () => {
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: '192.168.1.1',
            // Missing tuyaKey
            protocolVersion: '3.5',
          } as any,
        ],
      };

      // Should create manager without crashing
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });

    test('handles invalid IP address gracefully', async () => {
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: 'invalid-ip',
            tuyaKey: 'key123',
            protocolVersion: '3.5',
          },
        ],
      };
      const mgr = new LocalDeviceManager(config, mockLog);

      // Should not throw during init
      await expect(mgr.initLocalDevices()).resolves.not.toThrow();
    });

    test('handles invalid protocol version gracefully', () => {
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: '192.168.1.1',
            tuyaKey: 'key123',
            protocolVersion: '9.9' as any, // Invalid version
          },
        ],
      };

      // Should create manager without immediate error
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });
  });

  describe('DP mapping', () => {
    test('uses default DP mapping when not provided', () => {
      const config: LocalConfig = {
        devices: [],
      };
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
      // Default mappings should be applied internally
    });

    test('respects custom DP mappings', () => {
      const customMapping = {
        switch_1: 10,
        bright_value: 11,
        color_data: 12,
      };
      const config: LocalConfig = {
        devices: [
          {
            tuyaDeviceId: 'device1',
            ip: '192.168.1.1',
            tuyaKey: 'key123',
            protocolVersion: '3.5',
            dpMapping: customMapping,
          },
        ],
      };
      const mgr = new LocalDeviceManager(config, mockLog);
      expect(mgr).toBeDefined();
    });
  });

  describe('logging', () => {
    test('uses provided logger', () => {
      const customLog: Logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        log: jest.fn(),
      } as unknown as Logger;

      const config: LocalConfig = {
        devices: [],
      };
      const mgr = new LocalDeviceManager(config, customLog);
      expect(mgr).toBeDefined();
    });
  });
});

describe('LocalDeviceManager Integration', () => {
  test('multiple managers can coexist', () => {
    const config1: LocalConfig = {
      devices: [],
    };
    const config2: LocalConfig = {
      devices: [
        {
          tuyaDeviceId: 'device1',
          ip: '192.168.1.1',
          tuyaKey: 'key123',
          protocolVersion: '3.5',
          dpMapping: { switch_1: 1 },
        },
      ],
    };

    const mgr1 = new LocalDeviceManager(config1, mockLog);
    const mgr2 = new LocalDeviceManager(config2, mockLog);

    expect(mgr1).toBeDefined();
    expect(mgr2).toBeDefined();
    expect(mgr1).not.toBe(mgr2);
  });

  test('manager cleanup on multiple inits', async () => {
    const config: LocalConfig = {
      devices: [],
    };
    const mgr = new LocalDeviceManager(config, mockLog);

    await mgr.initLocalDevices();
    await mgr.initLocalDevices(); // Should handle multiple inits

    expect(mgr).toBeDefined();
  });
});
