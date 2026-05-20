import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TuyaPlatform } from '../src/platform';
import { initLogger } from '../src/shared/util/Logger';
import { Logger } from 'homebridge';

// Mock Logger
const mockLog: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as Logger;

jest.mock('../src/cloud/api/TuyaOpenAPI', () => {
  return class MockTuyaOpenAPI {
    log = console;
    static getDefaultEndpoint = jest.fn().mockReturnValue([1]);
  };
});

jest.mock('../src/cloud/device/TuyaCustomDeviceManager', () => {
  return class MockTuyaCustomDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    getDeviceSchemaConfig = jest.fn();
    devices = [];
    api = mockAPI;
    on = jest.fn();
  };
});

jest.mock('../src/cloud/device/TuyaHomeDeviceManager', () => {
  return class MockTuyaHomeDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    getDeviceSchemaConfig = jest.fn();
    devices = [];
    api = mockAPI;
    on = jest.fn();
  };
});

jest.mock('../src/local/LocalDeviceManager', () => {
  return class MockLocalDeviceManager {
    pullDevices = jest.fn().mockReturnValue([]);
    updateInfraredRemotes = jest.fn();
    getDeviceSchemaConfig = jest.fn();
    devices = [];
    api = mockAPI;
    on = jest.fn();
  };
});

jest.mock('../src/shared/accessory/AccessoryFactory', () => ({
  __esModule: true,
  default: {
    configAccessory: jest.fn(),
    createAccessoryHandler: jest.fn(),
  },
}));

jest.mock('../src/shared/util/util', () => ({
  sanitizeName: (name: string) => name,
  retry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../src/shared/util/ConfigMigrator', () => ({
  __esModule: true,
  default: class ConfigMigrator {
    migrate(arg:any) { return arg; }
  }
}));

const mockAPI = {
  hap: {
    Service: {},
    Characteristic: {},
    uuid: { generate: jest.fn() },
  },
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
  unregisterPlatformAccessories: jest.fn(),
  user: {
    persistPath: () => '/tmp',
  },
  tokenInfo: {}
} as any;

describe('TuyaPlatform validation around cloud/local modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initLogger(mockLog);
  });

  test('rejects mode both when local block is missing', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'both',
      cloud: {
        projectType: '2',
        accessId: 'id',
        accessKey: 'key',
        countryCode: 1,
        username: 'user@example.com',
        password: 'secret',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: '',
      },
    };

    const platform = new TuyaPlatform(mockLog, config, mockAPI);
    expect(platform.validate()).toBe(false);
    expect(mockLog.error).toHaveBeenCalledWith('mode is "both" but no "local" config block found.');
  });

  test('rejects mode both when cloud options are missing', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'both',
      local: { devices: [] },
    };

    const platform = new TuyaPlatform(mockLog, config, mockAPI);
    expect(platform.validate()).toBe(false);
    expect(mockLog.error).toHaveBeenCalledWith('Not configured — "cloud" block is required for cloud mode, exit.');
  });

  test('detects duplicate device override ids', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      cloud: {
        projectType: '2',
        accessId: 'id',
        accessKey: 'key',
        countryCode: 1,
        username: 'user@example.com',
        password: 'secret',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: '',
        deviceOverrides: [
          { id: 'same-id' },
          { id: 'same-id' },
        ],
      },
    };

    const platform = new TuyaPlatform(mockLog, config, mockAPI);
    expect(platform.validateDeviceOverrides(config.cloud.deviceOverrides)).toBe(false);
  });

  test('detects duplicate schema codes inside one device override', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      cloud: {
        projectType: '2',
        accessId: 'id',
        accessKey: 'key',
        countryCode: 1,
        username: 'user@example.com',
        password: 'secret',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: '',
        deviceOverrides: [
          {
            id: 'device-1',
            schema: [
              { code: 'switch_1' },
              { code: 'switch_1' },
            ],
          },
        ],
      },
    };

    const platform = new TuyaPlatform(mockLog, config, mockAPI);
    expect(platform.validateSchema(config.cloud.deviceOverrides)).toBe(false);
  });
});
