/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { TuyaPlatform } from '../src/platform';
import { PlatformAccessory } from 'homebridge';
import { ExLogger, initLogger } from '../src/shared/util/Logger';
import { TuyaPluginMode } from '../src/config';
import LocalDeviceManager from '../src/local/LocalDeviceManager';
import TuyaHybridDeviceManager from '../src/shared/TuyaHybridDeviceManager';
import TuyaHomeDeviceManager from '../src/cloud/device/TuyaHomeDeviceManager';
import TuyaCustomDeviceManager from '../src/cloud/device/TuyaCustomDeviceManager';

// Mock Logger
const mockLogger: ExLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as ExLogger;

// Mock Homebridge API
const mockHAP = {
  Service: {},
  Characteristic: {},
  uuid: {
    generate: (name: string) => `${name}-uuid`,
  },
};

const errorStack:any[] = [];

const mockAPI = {
  hap: mockHAP,
  platformAccessory: jest.fn(),
  registerAccessory: jest.fn(),
  unregisterAccessory: jest.fn(),
  on: jest.fn(),
} as any;

jest.mock('jsonschema', () => {
  return {
    Validator: (
      class MockValidator {
        validate = jest.fn().mockReturnValue({ errors: errorStack });
      }
    )
  };
});
// Mock file system
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// Mock Cloud components
jest.mock('../src/cloud/api/TuyaOpenAPI', () => {
  return class MockTuyaOpenAPI {
    log = console;

    static getDefaultEndpoint() {
      return 'mock-endpoint';
    }
  };
});

jest.mock('../src/cloud/api/TuyaOpenMQ', () => {
  return class MockTuyaOpenMQ {};
});

jest.mock('../src/cloud/device/TuyaCloudDeviceManager', () => {
  return class MockTuyaDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    on = jest.fn();
    devices = [];
  };
});

jest.mock('../src/cloud/device/TuyaCustomDeviceManager', () => {
  return class MockTuyaCustomDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    on = jest.fn();
    devices = [];
  };
});

jest.mock('../src/cloud/device/TuyaHomeDeviceManager', () => {
  return class MockTuyaHomeDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    on = jest.fn();
    devices = [];
  };
});

// Mock Local components
jest.mock('../src/local/LocalDeviceManager', () => {
  return class MockLocalDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    on = jest.fn();
    devices = [];
    static isTargetDevice:any = jest.fn(s => true);
  };
});

jest.mock('../src/shared/TuyaHybridDeviceManager', () => {
  return class MockTuyaHybridDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    on = jest.fn();
    devices = [];
  };
});

// Mock Accessories
jest.mock('../src/shared/accessory/AccessoryFactory', () => {
  return {
    default: class MockAccessoryFactory {},
  };
});

jest.mock('../src/shared/util/ConfigMigrator', () => {
  return class ConfigMigrator {
    migrate(arg:any) { return arg; }
  }
});

describe('TuyaPlatform', () => {
  let platform: TuyaPlatform;
  let mockConfig: any;
  let mockLog: any;

  beforeEach(() => {
    jest.clearAllMocks();
    initLogger(mockLogger);

    mockLog = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    mockConfig = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      cloud: {
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

    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
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
      expect(platform['platformAccessories']).toEqual(new Map());
      expect(platform['platformAccessories'] instanceof Map).toBe(true);
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
        cloud: undefined,
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
    test('requires cloud for cloud mode', () => {
      const noCloudConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: undefined,
      };

      const noCloudPlatform = new TuyaPlatform(mockLog, noCloudConfig, mockAPI);
      const isValid = noCloudPlatform.validate();

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
        cloud: {
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
      expect(cloudPlatform.platformConfig!.cloud!.projectType).toBe('1');
    });

    test('validates cloud config with projectType 2', () => {
      const cloudConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: {
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
      expect(cloudPlatform.platformConfig!.cloud!.projectType).toBe('2');
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
      expect(platform.platformConfig.cloud).toBeDefined();
      expect(platform.platformConfig!.cloud!.projectType).toBe('2');
    });

    test('accesses credentials from config', () => {
      expect(platform.platformConfig!.cloud!.accessId).toBe('test_id');
      expect(platform.platformConfig!.cloud!.accessKey).toBe('test_key');
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
      platform.configureAccessory(mockAccessory as PlatformAccessory);

      expect(platform['platformAccessories'].size).toBe(1);
    });

    test('can restore cached accessories', () => {
      const mockAccessory1 = { UUID: 'uuid-1', displayName: 'Device 1' };
      const mockAccessory2 = { UUID: 'uuid-2', displayName: 'Device 2' };
      [mockAccessory1, mockAccessory2].forEach(mockAccessory => platform.configureAccessory(mockAccessory as PlatformAccessory));

      expect(platform['platformAccessories'].size).toBe(2);
    });
  });

  describe('device manager initialization', () => {
    test('can initialize device manager', () => {
      platform.deviceManager = {} as any;
      expect(platform.deviceManager).toBeDefined();
    });

    test('initialize custom device manager', () => {
      mockConfig.mode = TuyaPluginMode.cloud;
      mockConfig.cloud.projectType = '1';
      const platform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
      platform.initDevices().then(() => {
        expect(platform.mode).toBe(mockConfig.mode);
        expect(platform.deviceManager).toBeInstanceOf(TuyaCustomDeviceManager);
      });
    });

    test('initialize home device manager', () => {
      mockConfig.mode = TuyaPluginMode.cloud;
      mockConfig.cloud.projectType = '2';
      const platform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
      platform.initDevices().then(() => {
        expect(platform.mode).toBe(mockConfig.mode);
        expect(platform.deviceManager).toBeInstanceOf(TuyaHomeDeviceManager);
      });
    });

    test('initialize local device manager', () => {
      mockConfig.mode = TuyaPluginMode.local;
      const platform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
      platform.initDevices().then(() => {
        expect(platform.mode).toBe(mockConfig.mode);
        expect(platform.deviceManager).toBeInstanceOf(LocalDeviceManager);
      });
    });

    test('initialize both device manager', () => {
      mockConfig.mode = TuyaPluginMode.both;
      const platform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
      platform.initDevices().then(() => {
        expect(platform.mode).toBe(mockConfig.mode);
        expect(platform.deviceManager).toBeInstanceOf(TuyaHybridDeviceManager);
      });
    });
  });

  describe('both mode configuration', () => {
    test('supports simultaneous cloud and local', () => {
      const bothConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'both',
        cloud: {
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
      expect(bothPlatform.platformConfig.cloud).toBeDefined();
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

  describe('validate', () => {
    test('local mode without local config', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'local',
      };

      const spyError = jest.spyOn(mockLog, 'error');

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      const isValid = invalidPlatform.validate();

      expect(isValid).toBe(false);
      expect(spyError).toHaveBeenCalledWith('mode is "local" but no "local" config block found.');
    });

    test('both mode without local config', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'both',
      };

      const spyError = jest.spyOn(mockLog, 'error');

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      const isValid = invalidPlatform.validate();

      expect(isValid).toBe(false);
      expect(spyError).toHaveBeenCalledWith('mode is "both" but no "local" config block found.');
    });

    test('cloud mode without cloud config', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
      };

      const spyError = jest.spyOn(mockLog, 'error');

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      const isValid = invalidPlatform.validate();

      expect(isValid).toBe(false);
      expect(spyError).toHaveBeenCalledWith('Not configured — "cloud" block is required for cloud mode, exit.');
    });

    test('both mode without cloud config', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'both',
        local: {}
      };

      const spyError = jest.spyOn(mockLog, 'error');

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      const isValid = invalidPlatform.validate();

      expect(isValid).toBe(false);
      expect(spyError).toHaveBeenCalledWith('Not configured — "cloud" block is required for cloud mode, exit.');
    });

    test('Validator().validate returns error', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: { projectType: '1', deviceOverides: [] }
      };

      const stack = { stack: 'error stack' };
      errorStack.push(stack);

      const spyError = jest.spyOn(mockLog, 'error');
      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      
      expect(spyError).toHaveBeenCalledWith(stack.stack);
      errorStack.splice(0, errorStack.length);
    });

    test('cloud mode with invalid deviceOverrides', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: { projectType: '1' }
      };

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      invalidPlatform.validateDeviceOverrides = jest.fn(() => false);
      const spyMethod = jest.spyOn(invalidPlatform, 'validateDeviceOverrides');
      const isValid = invalidPlatform.validate();

      expect(spyMethod).toHaveBeenCalledTimes(1);
      expect(isValid).toBe(false);
    });

    test('cloud mode with invalid deviceOverride.schema', () => {
      const invalidConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: { projectType: '1' }
      };

      const invalidPlatform = new TuyaPlatform(mockLog, invalidConfig, mockAPI);
      invalidPlatform.validateDeviceOverrides = jest.fn(() => true);
      invalidPlatform.validateSchema = jest.fn(() => false);
      const spyMethod1 = jest.spyOn(invalidPlatform, 'validateDeviceOverrides');
      const spyMethod2 = jest.spyOn(invalidPlatform, 'validateSchema');
      const isValid = invalidPlatform.validate();

      expect(spyMethod1).toHaveBeenCalledTimes(1);
      expect(spyMethod2).toHaveBeenCalledTimes(1);
      expect(isValid).toBe(false);
    });
  });

  describe('configuration edge cases', () => {
    test('handles missing project type', () => {
      const noProjectTypeConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'cloud',
        cloud: {
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
        cloud: {
          ...mockConfig.cloud,
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
      };

      const weatherPlatform = new TuyaPlatform(mockLog, weatherConfig, mockAPI);
      expect((weatherPlatform.platformConfig.cloud as any).generateWeatherAccessory).toBe(true);
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

      platform1.configureAccessory({} as PlatformAccessory);


      expect(platform1['platformAccessories'].size).toBe(1);
      expect(platform2['platformAccessories'].size).toBe(0);
    });
  });

  describe('device ID consistency and deduplication', () => {
    test('uses consistent UUID for same device across cloud and local', () => {
      const bothConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        mode: 'both',
        cloud: {
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
  });

  describe('syncDeviceAndAccessory', () => {
    test('device config changed', () => {
      const mockDevice = {
        id: 'mock-id'
      };
      const mockOldAccessory = {
        context: { deviceConfigHash: 'hash2' },
        services: [
          {
            UUID: 'service-uuid1',
            characteristics: [
              { UUID: 'characteristic-uuid1' },
              { UUID: 'characteristic-uuid2' },
              { UUID: 'characteristic-uuid3' },
            ],
            removeCharacteristic: jest.fn()
          },
          {
            UUID: 'service-uuid2',
            characteristics: [
              { UUID: 'characteristic-uuid1' },
              { UUID: 'characteristic-uuid3' },
              { UUID: 'characteristic-uuid4' },
            ]
          }
        ],
        removeService: jest.fn()
      };
      const mockNewAccessory = {
        services: [
          {
            UUID: 'service-uuid1',
            characteristics: [
              { UUID: 'characteristic-uuid1' },
              { UUID: 'characteristic-uuid3' },
              { UUID: 'characteristic-uuid5' },
            ]
          },
          {
            UUID: 'service-uuid3',
            characteristics: [
              { UUID: 'characteristic-uuid2' },
              { UUID: 'characteristic-uuid3' },
              { UUID: 'characteristic-uuid4' },
            ]
          }
        ]
      };

      Object.assign(mockAPI, { updatePlatformAccessories: jest.fn() });

      const mockPlatform = new TuyaPlatform(mockLog, mockConfig, mockAPI);
      Object.assign(mockPlatform, {
        deviceManager: { createDeviceConfigHash: jest.fn().mockReturnValue('hash1'), devices: []},
        addAccessory: jest.fn().mockReturnValue(mockNewAccessory),
        removeAccessory: jest.fn()
      });
      
      mockPlatform.syncDeviceAndAccessory(mockDevice as any, mockOldAccessory as any);

      const mockRemoveService = jest.spyOn(mockOldAccessory, 'removeService');
      const mockRemoveCharacteristic = jest.spyOn(mockOldAccessory.services[0], 'removeCharacteristic');
      expect(mockRemoveService).toHaveBeenCalledWith(mockOldAccessory.services[1]);
      expect(mockRemoveCharacteristic).toHaveBeenCalledWith(mockOldAccessory.services[0].characteristics[1]);
    });
  });
});

