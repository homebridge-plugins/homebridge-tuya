import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TuyaPlatform } from '../src/platform';

jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}
    info() {}
    warn() {}
    error() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: unknown, public name: string, public debug: boolean) {}
  },
}));

jest.mock('../src/cloud/api/TuyaOpenAPI', () => {
  return class MockTuyaOpenAPI {
    log = console;
  };
});

jest.mock('../src/cloud/device/TuyaDeviceManager', () => {
  class MockTuyaDeviceManager {
    static readonly Events = {
      DEVICE_ADD: 'DEVICE_ADD',
      DEVICE_INFO_UPDATE: 'DEVICE_INFO_UPDATE',
      DEVICE_STATUS_UPDATE: 'DEVICE_STATUS_UPDATE',
      DEVICE_DELETE: 'DEVICE_DELETE',
    };
  }
  return MockTuyaDeviceManager;
});

jest.mock('../src/cloud/device/TuyaCustomDeviceManager', () => {
  return class MockTuyaCustomDeviceManager {};
});

jest.mock('../src/cloud/device/TuyaHomeDeviceManager', () => {
  return class MockTuyaHomeDeviceManager {};
});

jest.mock('../src/local/LocalDeviceManager', () => {
  return class MockLocalDeviceManager {};
});

jest.mock('../src/shared/accessories/AccessoryFactory', () => ({
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
} as any;

describe('TuyaPlatform validation around cloud/local modes', () => {
  let log: any;

  beforeEach(() => {
    log = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    jest.clearAllMocks();
  });

  test('rejects mode both when local block is missing', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'both',
      options: {
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

    const platform = new TuyaPlatform(log, config, mockAPI);
    expect(platform.validate()).toBe(false);
    expect(log.error).toHaveBeenCalledWith('mode is "both" but no "local" config block found.');
  });

  test('rejects mode both when cloud options are missing', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'both',
      local: { devices: [] },
    };

    const platform = new TuyaPlatform(log, config, mockAPI);
    expect(platform.validate()).toBe(false);
    expect(log.error).toHaveBeenCalledWith('Not configured — "options" block is required for cloud mode, exit.');
  });

  test('detects duplicate device override ids', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      options: {
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

    const platform = new TuyaPlatform(log, config, mockAPI);
    expect(platform.validateDeviceOverrides()).toBe(false);
  });

  test('detects duplicate schema codes inside one device override', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      options: {
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

    const platform = new TuyaPlatform(log, config, mockAPI);
    expect(platform.validateSchema()).toBe(false);
  });

  test('resolves device config precedence: device, then product, then global', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      options: {
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
          { id: 'global', category: 'global-cat' },
          { id: 'prod-1', category: 'product-cat' },
          { id: 'device-1', category: 'device-cat' },
        ],
      },
    };

    const platform = new TuyaPlatform(log, config, mockAPI);

    const exact = platform.getDeviceConfig({ id: 'device-1', uuid: 'uuid-1', product_id: 'prod-1' } as any);
    const byProduct = platform.getDeviceConfig({ id: 'device-2', uuid: 'uuid-2', product_id: 'prod-1' } as any);
    const fallback = platform.getDeviceConfig({ id: 'device-3', uuid: 'uuid-3', product_id: 'prod-3' } as any);

    expect(exact?.category).toBe('device-cat');
    expect(byProduct?.category).toBe('product-cat');
    expect(fallback?.category).toBe('global-cat');
  });

  test('finds schema config case-insensitively and migrates oldCode', () => {
    const config = {
      platform: 'TuyaPlatform',
      name: 'Tuya',
      mode: 'cloud',
      options: {
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
              { oldCode: 'switch_1', code: 'new_switch_1', hidden: true },
            ],
          },
        ],
      },
    };

    const platform = new TuyaPlatform(log, config, mockAPI);
    const device = { id: 'device-1', uuid: 'device-1', product_id: 'prod-1' } as any;

    const result = platform.getDeviceSchemaConfig(device, 'SWITCH_1');

    expect(result).toBeDefined();
    expect(result?.code).toBe('switch_1');
    expect((result as any).newCode).toBe('new_switch_1');
    expect(result?.hidden).toBe(true);
  });
});
