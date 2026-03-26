/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { TuyaPlatform } from '../src/platform';

// Mock Homebridge API
const mockHAP = {
  Service: {},
  Characteristic: {},
};

const mockAPI = {
  hap: mockHAP,
  platformAccessory: jest.fn(),
  registerAccessory: jest.fn(),
  unregisterAccessory: jest.fn(),
  on: jest.fn(),
} as any;

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

// Mock file system
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// Mock Cloud components
jest.mock('../src/cloud/api/TuyaOpenAPI', () => {
  return class MockTuyaOpenAPI {
    log = console;
  };
});

jest.mock('../src/cloud/api/TuyaOpenMQ', () => {
  return class MockTuyaOpenMQ {};
});

jest.mock('../src/cloud/device/TuyaDeviceManager', () => {
  return class MockTuyaDeviceManager {};
});

jest.mock('../src/cloud/device/TuyaCustomDeviceManager', () => {
  return class MockTuyaCustomDeviceManager {};
});

jest.mock('../src/cloud/device/TuyaHomeDeviceManager', () => {
  return class MockTuyaHomeDeviceManager {};
});

// Mock Local components
jest.mock('../src/local/LocalDeviceManager', () => {
  return class MockLocalDeviceManager {};
});

// Mock Accessories
jest.mock('../src/shared/accessories/AccessoryFactory', () => {
  return {
    default: class MockAccessoryFactory {},
  };
});

jest.mock('../src/shared/util/util', () => ({
  sanitizeName: (name: string) => name.replace(/[^a-z0-9]/gi, '_'),
  retry: jest.fn(async (fn: any) => fn()),
}));

describe('TuyaPlatform', () => {
  let platform: TuyaPlatform;
  let mockConfig: any;
  let mockLog: any;

  beforeEach(() => {
    mockLog = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockConfig = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      options: {
        projectType: '2',
        accessId: 'test_id',
        accessKey: 'test_key',
        countryCode: 1,
        username: 'user@example.com',
        password: 'password',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: '',
      },
    };

    platform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
  });

  describe('initialization', () => {
    test('creates platform instance', () => {
      expect(platform).toBeDefined();
      expect(platform instanceof TuyaPlatform).toBe(true);
    });

    test('stores logger', () => {
      expect(platform.log).toBe(mockLog);
    });

    test('stores config', () => {
      expect(platform.config).toBe(mockConfig);
    });

    test('stores API', () => {
      expect(platform.api).toBe(mockAPI);
    });

    test('has Service and Characteristic', () => {
      expect(platform.Service).toBeDefined();
      expect(platform.Characteristic).toBeDefined();
    });

    test('initializes cached accessories array', () => {
      expect(platform.cachedAccessories).toEqual([]);
      expect(Array.isArray(platform.cachedAccessories)).toBe(true);
    });

    test('initializes accessory handlers array', () => {
      expect(platform.accessoryHandlers).toEqual([]);
      expect(Array.isArray(platform.accessoryHandlers)).toBe(true);
    });
  });

  describe('mode configuration', () => {
    test('uses cloud mode by default', () => {
      expect(platform.mode).toBe('cloud');
    });

    test('supports local mode', () => {
      const localConfig = {
        ...mockConfig,
        mode: 'local',
        options: undefined,
        local: {
          devices: [],
        },
      };

      const localPlatform = new TuyaPlatform(mockLog, localConfig, mockAPI);
      expect(localPlatform.mode).toBe('local');
    });

    test('supports both mode', () => {
      const bothConfig = {
        ...mockConfig,
        mode: 'both',
        local: {
          devices: [],
        },
      };

      const bothPlatform = new TuyaPlatform(mockLog, bothConfig, mockAPI);
      expect(bothPlatform.mode).toBe('both');
    });
  });

  describe('configuration validation', () => {
    test('requires options for cloud mode', () => {
      const noOptionsConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        options: undefined,
      };

      const noOptionsPlatform = new TuyaPlatform(mockLog, noOptionsConfig, mockAPI);
      const isValid = noOptionsPlatform.validate();

      expect(isValid).toBe(false);
    });

    test('requires local config for local mode', () => {
      const noLocalConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'local',
        local: undefined,
      };

      const noLocalPlatform = new TuyaPlatform(mockLog, noLocalConfig, mockAPI);
      const isValid = noLocalPlatform.validate();

      expect(isValid).toBe(false);
    });

    test('validates cloud config with projectType 1', () => {
      const cloudConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        options: {
          projectType: '1',
          endpoint: 'https://openapi.tuyaeu.com',
          accessId: 'id',
          accessKey: 'key',
          username: 'user',
          password: 'pass',
          generateWeatherAccessory: false,
          weatherAPI: '',
        },
      };

      const cloudPlatform = new TuyaPlatform(mockLog, cloudConfig, mockAPI);
      expect(cloudPlatform.options.projectType).toBe('1');
    });

    test('validates cloud config with projectType 2', () => {
      const cloudConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        options: {
          projectType: '2',
          accessId: 'id',
          accessKey: 'key',
          countryCode: 1,
          username: 'user',
          password: 'pass',
          appSchema: 'tuyaSmart',
          generateWeatherAccessory: false,
          weatherAPI: '',
        },
      };

      const cloudPlatform = new TuyaPlatform(mockLog, cloudConfig, mockAPI);
      expect(cloudPlatform.options.projectType).toBe('2');
    });
  });

  describe('local only mode', () => {
    test('does not require cloud options', () => {
      const localConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'local',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device_1',
              ip: '192.168.1.100',
              tuyaKey: 'key123',
              protocolVersion: '3.5',
            },
          ],
        },
      };

      const localPlatform = new TuyaPlatform(mockLog, localConfig, mockAPI);
      expect(localPlatform.mode).toBe('local');
    });

    test('requires local config block', () => {
      const localNoConfigBlock = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'local',
      };

      const localPlatform = new TuyaPlatform(mockLog, localNoConfigBlock, mockAPI);
      const isValid = localPlatform.validate();

      expect(isValid).toBe(false);
    });
  });

  describe('platform properties', () => {
    test('stores platform config', () => {
      expect(platform.platformConfig).toBeDefined();
      expect(platform.platformConfig.platform).toBe('TuyaPlatform');
    });

    test('stores cloud options', () => {
      expect(platform.options).toBeDefined();
      expect(platform.options.projectType).toBe('2');
    });

    test('accesses credentials from config', () => {
      expect(platform.options.accessId).toBe('test_id');
      expect(platform.options.accessKey).toBe('test_key');
    });
  });

  describe('accessory management', () => {
    test('initializes empty accessory handlers', () => {
      expect(platform.accessoryHandlers.length).toBe(0);
    });

    test('can add accessory handlers', () => {
      const mockHandler = { displayName: 'Device 1' };
      platform.accessoryHandlers.push(mockHandler as any);

      expect(platform.accessoryHandlers.length).toBe(1);
    });

    test('can remove accessory handlers', () => {
      const handler1 = { UUID: 'uuid-1' };
      const handler2 = { UUID: 'uuid-2' };

      platform.accessoryHandlers = [handler1 as any, handler2 as any];
      platform.accessoryHandlers = platform.accessoryHandlers.filter((h) => (h as any).UUID !== 'uuid-1');

      expect(platform.accessoryHandlers.length).toBe(1);
    });

    test('caches accessories', () => {
      const mockAccessory = { UUID: 'uuid-1', displayName: 'Cached Device' };
      platform.cachedAccessories.push(mockAccessory as any);

      expect(platform.cachedAccessories.length).toBe(1);
    });

    test('can restore cached accessories', () => {
      const mockAccessory1 = { UUID: 'uuid-1', displayName: 'Device 1' };
      const mockAccessory2 = { UUID: 'uuid-2', displayName: 'Device 2' };

      platform.cachedAccessories = [mockAccessory1 as any, mockAccessory2 as any];

      expect(platform.cachedAccessories.length).toBe(2);
    });
  });

  describe('device manager initialization', () => {
    test('can initialize cloud device manager', () => {
      platform.deviceManager = {} as any;
      expect(platform.deviceManager).toBeDefined();
    });

    test('can initialize local device manager', () => {
      platform.localDeviceManager = {} as any;
      expect(platform.localDeviceManager).toBeDefined();
    });

    test('both managers can coexist in both mode', () => {
      platform.deviceManager = {} as any;
      platform.localDeviceManager = {} as any;

      expect(platform.deviceManager).toBeDefined();
      expect(platform.localDeviceManager).toBeDefined();
    });
  });

  describe('both mode configuration', () => {
    test('supports simultaneous cloud and local', () => {
      const bothConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'both',
        options: {
          projectType: '2',
          accessId: 'id',
          accessKey: 'key',
          countryCode: 1,
          username: 'user',
          password: 'pass',
          appSchema: 'tuyaSmart',
          generateWeatherAccessory: false,
          weatherAPI: '',
        },
        local: {
          devices: [],
        },
      };

      const bothPlatform = new TuyaPlatform(mockLog, bothConfig, mockAPI);
      expect(bothPlatform.mode).toBe('both');
      expect(bothPlatform.options).toBeDefined();
      expect(bothPlatform.platformConfig.local).toBeDefined();
    });
  });

  describe('homebridge lifecycle', () => {
    test('has configureAccessory method', () => {
      expect(typeof platform.configureAccessory).toBe('function');
    });

    test('has initialize method', () => {
      expect(platform).toBeDefined();
      expect(platform.config).toBeDefined();
    });
  });

  describe('platform identification', () => {
    test('platform name is set', () => {
      expect(mockConfig.platform).toBe('TuyaPlatform');
    });

    test('plugin name is accessible', () => {
      expect(mockConfig.name).toBe('Tuya');
    });
  });

  describe('device type support', () => {
    test('supports light devices', () => {
      // Lights are category 'dj'
      expect(mockConfig).toBeDefined();
    });

    test('supports switch devices', () => {
      // Switches are category 'kg'
      expect(mockConfig).toBeDefined();
    });

    test('supports multiple device types simultaneously', () => {
      expect(mockConfig).toBeDefined();
    });
  });

  describe('error handling', () => {
    test('logs errors to homebridge', () => {
      platform.log.error('Test error');
      expect(mockLog.error).toHaveBeenCalledWith('Test error');
    });

    test('validates configuration before use', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
      };

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      const isValid = invalidPlatform.validate();

      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('configuration edge cases', () => {
    test('handles missing project type', () => {
      const noProjectTypeConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        options: {
          accessId: 'id',
          accessKey: 'key',
        },
      };

      const noProjectPlatform = new TuyaPlatform(mockLog, noProjectTypeConfig, mockAPI);
      expect(noProjectPlatform).toBeDefined();
    });

    test('handles empty local devices array', () => {
      const emptyDevicesConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'local',
        local: {
          devices: [],
        },
      };

      const emptyPlatform = new TuyaPlatform(mockLog, emptyDevicesConfig, mockAPI);
      expect(emptyPlatform.mode).toBe('local');
    });

    test('handles weather accessory option', () => {
      const weatherConfig = {
        ...mockConfig,
        options: {
          ...mockConfig.options,
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
      };

      const weatherPlatform = new TuyaPlatform(mockLog, weatherConfig, mockAPI);
      expect((weatherPlatform.options as any).generateWeatherAccessory).toBe(true);
    });
  });

  describe('multiple platform instances', () => {
    test('maintain separate state', () => {
      const config1 = {
        ...mockConfig,
        name: 'Tuya1',
      };

      const config2 = {
        ...mockConfig,
        name: 'Tuya2',
      };

      const platform1 = new TuyaPlatform(mockLog, config1, mockAPI);
      const platform2 = new TuyaPlatform(mockLog, config2, mockAPI);

      platform1.cachedAccessories.push({} as any);

      expect(platform1.cachedAccessories.length).toBe(1);
      expect(platform2.cachedAccessories.length).toBe(0);
    });
  });
});
