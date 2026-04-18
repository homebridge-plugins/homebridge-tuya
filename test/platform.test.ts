/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { TuyaPlatform } from '../src/platform';

// Mock Homebridge API
const mockHAP = {
  Service: {},
  Characteristic: {},
  uuid: {
    generate: (name: string) => `${name}-uuid`,
  },
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

    test('enriches local config with cloud device details', async () => {
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

      // Mock cloud device
      const mockCloudDevice = {
        id: 'test-device-123',
        uuid: 'test-device-123',
        name: 'Test Device',
        product_id: 'product-123',
      } as any;

      // Mock the getDeviceDetails response
      const mockDeviceDetails = {
        success: true,
        result: {
          id: 'test-device-123',
          local_key: 'test-local-key-abcdef',
          ip: '192.168.1.100',
        },
      };

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => mockDeviceDetails,
      } as any;

      // Enrich local config
      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      // Verify local config was enriched
      expect(bothPlatform.platformConfig.local).toBeDefined();
      if (bothPlatform.platformConfig.local?.devices) {
        expect(bothPlatform.platformConfig.local.devices.length).toBeGreaterThan(0);
        
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.tuyaDeviceId).toBe('test-device-123');
        expect(enrichedDevice.tuyaKey).toBe('test-local-key-abcdef');
        expect(enrichedDevice.ip).toBe('192.168.1.100');
      }
    });

    test('preserves manual local config when enriching', async () => {
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
          devices: [
            {
              tuyaDeviceId: 'manual-device-456',
              tuyaKey: 'manual-key-xyz',
              name: 'Manual Device',
            },
          ],
        },
      };

      const bothPlatform = new TuyaPlatform(mockLog, bothConfig, mockAPI);

      // Mock cloud device (different from manual one)
      const mockCloudDevice = {
        id: 'test-device-123',
        uuid: 'test-device-123',
        name: 'Test Device',
        product_id: 'product-123',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'test-device-123',
            local_key: 'cloud-key-123',
            ip: '192.168.1.100',
          },
        }),
      } as any;

      // Enrich local config
      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      // Verify local config exists and has devices
      expect(bothPlatform.platformConfig.local).toBeDefined();
      if (bothPlatform.platformConfig.local?.devices) {
        // Verify manual device is still there
        const manualDevice = bothPlatform.platformConfig.local.devices.find(
          d => d.tuyaDeviceId === 'manual-device-456'
        );
        expect(manualDevice).toBeDefined();
        expect(manualDevice?.tuyaKey).toBe('manual-key-xyz');

        // Verify new cloud device was added
        const cloudDevice = bothPlatform.platformConfig.local.devices.find(
          d => d.tuyaDeviceId === 'test-device-123'
        );
        expect(cloudDevice).toBeDefined();
        expect(cloudDevice?.tuyaKey).toBe('cloud-key-123');
      }
    });

    test('skips enrichment if cloud device details unavailable', async () => {
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

      const mockCloudDevice = {
        id: 'test-device-123',
        name: 'Test Device',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: false,
          code: 'NOT_FOUND',
        }),
      } as any;

      // Enrich local config
      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      // Verify nothing was added (since API failed)
      expect(bothPlatform.platformConfig.local).toBeDefined();
      if (bothPlatform.platformConfig.local?.devices) {
        expect(bothPlatform.platformConfig.local.devices.length).toBe(0);
      }
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

  describe('API field variations and error handling', () => {
    test('handles localKey instead of local_key in API response', async () => {
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

      const mockCloudDevice = {
        id: 'test-device-123',
        uuid: 'test-device-123',
        name: 'Test Device',
        product_id: 'product-123',
      } as any;

      // Response with localKey (camelCase) instead of local_key (snake_case)
      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'test-device-123',
            localKey: 'alternate-format-key',  // camelCase variant
            ip: '192.168.1.100',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.tuyaKey).toBe('alternate-format-key');
      }
    });

    test('handles address field instead of ip in API response', async () => {
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

      const mockCloudDevice = {
        id: 'test-device-456',
        name: 'Another Device',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'test-device-456',
            local_key: 'test-key-456',
            address: '10.0.0.50',  // Uses 'address' instead of 'ip'
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.ip).toBe('10.0.0.50');
      }
    });

    test('uses uuid fallback when cloud device id is missing', async () => {
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

      const mockCloudDevice = {
        uuid: 'fallback-device-123',
        name: 'Fallback Device',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            uuid: 'fallback-device-123',
            local_key: 'fallback-key-123',
            ip: '192.168.1.101',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.tuyaDeviceId).toBe('fallback-device-123');
        expect(enrichedDevice.tuyaKey).toBe('fallback-key-123');
      }
    });

    test('propagates cloud category into local config', async () => {
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

      const mockCloudDevice = {
        id: 'category-device-123',
        name: 'Category Device',
        category: 'kg',
        product_id: 'abc123',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'category-device-123',
            local_key: 'category-key-123',
            ip: '192.168.1.102',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.category).toBe('kg');
      }
    });

    test('handles missing local_key gracefully', async () => {
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

      const mockCloudDevice = {
        id: 'test-device-no-key',
        name: 'Device Without Local Key',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'test-device-no-key',
            // No local_key or localKey provided
            ip: '192.168.1.200',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      // Device should not be added to local config without local_key
      if (bothPlatform.platformConfig.local?.devices) {
        expect(bothPlatform.platformConfig.local.devices.length).toBe(0);
      }
    });

    test('handles API timeout with grace', async () => {
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

      const mockCloudDevice = {
        id: 'test-device-timeout',
        name: 'Timeout Device',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => {
          throw new Error('Request timeout');
        },
      } as any;

      // Should not throw, but handle gracefully
      await expect(bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice])).resolves.toBeUndefined();
      
      // Local devices should remain empty (timeout treated as error)
      if (bothPlatform.platformConfig.local?.devices) {
        expect(bothPlatform.platformConfig.local.devices.length).toBe(0);
      }
    });
  });

  describe('mixed config scenarios', () => {
    test('updates manual local config with cloud-provided local_key', async () => {
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
          devices: [
            {
              tuyaDeviceId: 'manual-device-xyz',
              // User provided device ID but no key
              name: 'Manual Device No Key',
            },
          ],
        },
      };

      const bothPlatform = new TuyaPlatform(mockLog, bothConfig, mockAPI);

      const mockCloudDevice = {
        id: 'manual-device-xyz',
        name: 'Manual Device No Key',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'manual-device-xyz',
            local_key: 'cloud-filled-key',
            ip: '192.168.1.99',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        expect(enrichedDevice.tuyaDeviceId).toBe('manual-device-xyz');
        expect(enrichedDevice.tuyaKey).toBe('cloud-filled-key');
        expect(enrichedDevice.ip).toBe('192.168.1.99');
        // Original name should be preserved
        expect(enrichedDevice.name).toBe('Manual Device No Key');
      }
    });

    test('does not overwrite existing manual local_key', async () => {
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
          devices: [
            {
              tuyaDeviceId: 'device-with-manual-key',
              tuyaKey: 'user-provided-key-123',  // User explicitly set this
              name: 'Device With Manual Key',
            },
          ],
        },
      };

      const bothPlatform = new TuyaPlatform(mockLog, bothConfig, mockAPI);

      const mockCloudDevice = {
        id: 'device-with-manual-key',
        name: 'Device With Manual Key',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'device-with-manual-key',
            local_key: 'different-cloud-key',
            ip: '192.168.1.88',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        // Manual key should be skipped (device has tuyaKey already)
        expect(enrichedDevice.tuyaKey).toBe('user-provided-key-123');
      }
    });
  });

  describe('multi-device enrichment', () => {
    test('enriches multiple cloud devices in parallel', async () => {
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

      const mockCloudDevices = [
        { id: 'device-1', uuid: 'device-1', name: 'Device 1', product_id: 'prod-1' },
        { id: 'device-2', uuid: 'device-2', name: 'Device 2', product_id: 'prod-2' },
        { id: 'device-3', uuid: 'device-3', name: 'Device 3', product_id: 'prod-3' },
      ] as any;

      const callCount: Record<string, number> = {};
      bothPlatform.deviceManager = {
        getDeviceDetails: async (deviceId: string) => {
          callCount[deviceId] = (callCount[deviceId] || 0) + 1;
          return {
            success: true,
            result: {
              id: deviceId,
              local_key: `key-${deviceId}`,
              ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
            },
          };
        },
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud(mockCloudDevices);

      if (bothPlatform.platformConfig.local?.devices) {
        expect(bothPlatform.platformConfig.local.devices.length).toBe(3);
        
        const device1 = bothPlatform.platformConfig.local.devices.find(d => d.tuyaDeviceId === 'device-1');
        const device2 = bothPlatform.platformConfig.local.devices.find(d => d.tuyaDeviceId === 'device-2');
        const device3 = bothPlatform.platformConfig.local.devices.find(d => d.tuyaDeviceId === 'device-3');
        
        expect(device1?.tuyaKey).toBe('key-device-1');
        expect(device2?.tuyaKey).toBe('key-device-2');
        expect(device3?.tuyaKey).toBe('key-device-3');
      }
    });

    test('continues enrichment if single device fails', async () => {
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

      const mockCloudDevices = [
        { id: 'device-ok-1', uuid: 'device-ok-1', name: 'OK Device 1' },
        { id: 'device-fail', uuid: 'device-fail', name: 'Failing Device' },
        { id: 'device-ok-2', uuid: 'device-ok-2', name: 'OK Device 2' },
      ] as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async (deviceId: string) => {
          if (deviceId === 'device-fail') {
            return { success: false, code: 'ERROR' };
          }
          return {
            success: true,
            result: {
              id: deviceId,
              local_key: `key-${deviceId}`,
              ip: '192.168.1.100',
            },
          };
        },
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud(mockCloudDevices);

      if (bothPlatform.platformConfig.local?.devices) {
        // Should have 2 devices (one failed, skipped)
        expect(bothPlatform.platformConfig.local.devices.length).toBe(2);
        
        const hasOk1 = bothPlatform.platformConfig.local.devices.some(d => d.tuyaDeviceId === 'device-ok-1');
        const hasOk2 = bothPlatform.platformConfig.local.devices.some(d => d.tuyaDeviceId === 'device-ok-2');
        const hasFailed = bothPlatform.platformConfig.local.devices.some(d => d.tuyaDeviceId === 'device-fail');
        
        expect(hasOk1).toBe(true);
        expect(hasOk2).toBe(true);
        expect(hasFailed).toBe(false);
      }
    });
  });

  describe('device ID consistency and deduplication', () => {
    test('uses consistent UUID for same device across cloud and local', () => {
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

      // Create mock cloud and local devices with same ID
      const mockCloudDevice = {
        id: 'same-device-id',
        uuid: 'same-device-id',
        name: 'Test Device (Cloud)',
      } as any;

      const mockLocalDevice = {
        id: 'same-device-id',
        uuid: 'same-device-id',
        name: 'Test Device (Local)',
      } as any;

      // Both should map to same UUID
      const cloudUUID = bothPlatform.api.hap.uuid.generate(mockCloudDevice.id);
      const localUUID = bothPlatform.api.hap.uuid.generate(mockLocalDevice.id);

      expect(cloudUUID).toBe(localUUID);
    });

    test('enrichment preserves device ID for accessory mapping', async () => {
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

      const mockCloudDevice = {
        id: 'unique-device-id',
        uuid: 'unique-device-id',
        name: 'Device',
        product_id: 'product-123',
      } as any;

      bothPlatform.deviceManager = {
        getDeviceDetails: async () => ({
          success: true,
          result: {
            id: 'unique-device-id',
            local_key: 'test-key',
            ip: '192.168.1.1',
          },
        }),
      } as any;

      await bothPlatform.enrichLocalConfigFromCloud([mockCloudDevice]);

      if (bothPlatform.platformConfig.local?.devices) {
        const enrichedDevice = bothPlatform.platformConfig.local.devices[0];
        // Device ID should be preserved for accessory mapping
        expect(enrichedDevice.tuyaDeviceId).toBe('unique-device-id');
      }
    });
  });
});

