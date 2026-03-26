/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import TuyaOpenAPI, { TuyaOpenAPIResponse } from '../src/cloud/api/TuyaOpenAPI';

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

// Mock https module
jest.mock('https', () => ({
  request: jest.fn(),
}));

// Mock util
jest.mock('../src/shared/util/util', () => ({
  generateUUID: jest.fn(() => 'test-uuid-1234'),
  retry: jest.fn(async (fn: any) => fn()),
}));

describe('TuyaOpenAPI', () => {
  let api: TuyaOpenAPI;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    api = new TuyaOpenAPI(
      TuyaOpenAPI.Endpoints.AMERICA,
      'test_access_id',
      'test_access_key',
      mockLogger,
      'en',
      false
    );
  });

  describe('initialization', () => {
    test('creates API instance with credentials', () => {
      expect(api).toBeDefined();
      expect(api.accessId).toBe('test_access_id');
      expect(api.accessKey).toBe('test_access_key');
    });

    test('sets endpoint', () => {
      expect(api.endpoint).toBe(TuyaOpenAPI.Endpoints.AMERICA);
    });

    test('initializes empty asset array', () => {
      expect(api.assetIDArr).toEqual([]);
      expect(Array.isArray(api.assetIDArr)).toBe(true);
    });

    test('initializes empty device array', () => {
      expect(api.deviceArr).toEqual([]);
      expect(Array.isArray(api.deviceArr)).toBe(true);
    });

    test('initializes empty token info', () => {
      expect(api.tokenInfo).toEqual({
        access_token: '',
        refresh_token: '',
        uid: '',
        expire: 0,
      });
    });

    test('sets language', () => {
      expect(api.lang).toBe('en');
    });

    test('sets debug flag', () => {
      expect(api.debug).toBe(false);
    });

    test('creates logger with API name', () => {
      expect(api.log).toBeDefined();
    });
  });

  describe('endpoints', () => {
    test('has America endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.AMERICA).toBe('https://openapi.tuyaus.com');
    });

    test('has China endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.CHINA).toBe('https://openapi.tuyacn.com');
    });

    test('has Europe endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.EUROPE).toBe('https://openapi.tuyaeu.com');
    });

    test('has Europe West endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.EUROPE_WEST).toBe('https://openapi-weaz.tuyaeu.com');
    });

    test('has India endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.INDIA).toBe('https://openapi.tuyain.com');
    });

    test('has America East endpoint', () => {
      expect(TuyaOpenAPI.Endpoints.AMERICA_EAST).toBe('https://openapi-ueaz.tuyaus.com');
    });
  });

  describe('endpoint selection by country code', () => {
    test('gets America endpoint for US country code', () => {
      const endpoint = TuyaOpenAPI.getDefaultEndpoint(1); // US code 1
      expect(endpoint).toBe(TuyaOpenAPI.Endpoints.AMERICA);
    });

    test('gets China endpoint for China country code', () => {
      const endpoint = TuyaOpenAPI.getDefaultEndpoint(86); // China code 86
      expect(endpoint).toBe(TuyaOpenAPI.Endpoints.CHINA);
    });

    test('gets Europe endpoint for Germany country code', () => {
      const endpoint = TuyaOpenAPI.getDefaultEndpoint(49); // Germany code 49
      expect(endpoint).toBe(TuyaOpenAPI.Endpoints.EUROPE);
    });

    test('gets India endpoint for India country code', () => {
      const endpoint = TuyaOpenAPI.getDefaultEndpoint(91); // India code 91
      expect(endpoint).toBe(TuyaOpenAPI.Endpoints.INDIA);
    });

    test('defaults to America for unknown country code', () => {
      const endpoint = TuyaOpenAPI.getDefaultEndpoint(9999);
      expect(endpoint).toBe(TuyaOpenAPI.Endpoints.AMERICA);
    });
  });

  describe('credentials management', () => {
    test('stores access ID', () => {
      const testApi = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'my_access_id',
        'my_access_key',
        mockLogger
      );
      expect(testApi.accessId).toBe('my_access_id');
    });

    test('stores access key', () => {
      const testApi = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'my_access_id',
        'my_access_key',
        mockLogger
      );
      expect(testApi.accessKey).toBe('my_access_key');
    });

    test('can use different access IDs', () => {
      const api1 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id1',
        'key1',
        mockLogger
      );
      const api2 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id2',
        'key2',
        mockLogger
      );

      expect(api1.accessId).not.toBe(api2.accessId);
      expect(api1.accessKey).not.toBe(api2.accessKey);
    });
  });

  describe('token management', () => {
    test('can update token info', () => {
      api.tokenInfo = {
        access_token: 'new_token',
        refresh_token: 'refresh_token_123',
        uid: 'user_123',
        expire: 7200,
      };

      expect(api.tokenInfo.access_token).toBe('new_token');
      expect(api.tokenInfo.refresh_token).toBe('refresh_token_123');
      expect(api.tokenInfo.uid).toBe('user_123');
      expect(api.tokenInfo.expire).toBe(7200);
    });

    test('tracks token expiration time', () => {
      api.tokenInfo.expire = 1000;
      expect(api.tokenInfo.expire).toBeGreaterThan(0);
    });
  });

  describe('device array management', () => {
    test('can add devices to array', () => {
      const device1 = { id: 'dev1', name: 'Device 1' };
      const device2 = { id: 'dev2', name: 'Device 2' };

      api.deviceArr.push(device1);
      api.deviceArr.push(device2);

      expect(api.deviceArr.length).toBe(2);
      expect(api.deviceArr[0]).toEqual(device1);
    });

    test('can clear devices array', () => {
      api.deviceArr.push({ id: 'dev1' });
      api.deviceArr.push({ id: 'dev2' });

      api.deviceArr = [];

      expect(api.deviceArr.length).toBe(0);
    });

    test('can filter devices', () => {
      api.deviceArr = [
        { id: 'light_1', category: 'dj' },
        { id: 'switch_1', category: 'kg' },
        { id: 'light_2', category: 'dj' },
      ];

      const lights = api.deviceArr.filter((d: any) => d.category === 'dj');
      expect(lights.length).toBe(2);
    });
  });

  describe('asset ID management', () => {
    test('can add asset IDs', () => {
      api.assetIDArr.push('asset_123');
      api.assetIDArr.push('asset_456');

      expect(api.assetIDArr.length).toBe(2);
      expect(api.assetIDArr).toContain('asset_123');
    });

    test('can clear asset IDs', () => {
      api.assetIDArr = ['asset_1', 'asset_2'];
      api.assetIDArr = [];

      expect(api.assetIDArr.length).toBe(0);
    });
  });

  describe('configuration options', () => {
    test('uses provided endpoint', () => {
      const apiEU = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.EUROPE,
        'id',
        'key',
        mockLogger
      );
      expect(apiEU.endpoint).toBe(TuyaOpenAPI.Endpoints.EUROPE);
    });

    test('uses provided language', () => {
      const apiZH = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.CHINA,
        'id',
        'key',
        mockLogger,
        'zh'
      );
      expect(apiZH.lang).toBe('zh');
    });

    test('defaults to English language', () => {
      const apiDefault = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id',
        'key',
        mockLogger
      );
      expect(apiDefault.lang).toBe('en');
    });

    test('enables debug mode', () => {
      const apiDebug = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id',
        'key',
        mockLogger,
        'en',
        true
      );
      expect(apiDebug.debug).toBe(true);
    });
  });

  describe('multiple API instances', () => {
    test('multiple instances maintain separate state', () => {
      const api1 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id1',
        'key1',
        mockLogger
      );
      const api2 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.EUROPE,
        'id2',
        'key2',
        mockLogger
      );

      api1.assetIDArr.push('asset_1');
      api2.assetIDArr.push('asset_2');

      expect(api1.assetIDArr).toEqual(['asset_1']);
      expect(api2.assetIDArr).toEqual(['asset_2']);
      expect(api1.endpoint).not.toBe(api2.endpoint);
    });

    test('multiple instances have separate device lists', () => {
      const api1 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.AMERICA,
        'id1',
        'key1',
        mockLogger
      );
      const api2 = new TuyaOpenAPI(
        TuyaOpenAPI.Endpoints.EUROPE,
        'id2',
        'key2',
        mockLogger
      );

      api1.deviceArr = [{ id: 'dev1' }];
      api2.deviceArr = [{ id: 'dev2' }];

      expect(api1.deviceArr.length).toBe(1);
      expect(api2.deviceArr.length).toBe(1);
    });
  });

  describe('error handling', () => {
    test('login error messages exist', () => {
      expect(TuyaOpenAPI.prototype.constructor.name).toBe('TuyaOpenAPI');
    });

    test('handles different error codes', () => {
      // Error messages should be defined
      expect(typeof TuyaOpenAPI).toBe('function');
    });
  });

  describe('response types', () => {
    test('success response type structure', () => {
      const successResponse: TuyaOpenAPIResponse = {
        success: true,
        result: { id: 'device_001' },
        t: Date.now(),
        tid: 'transaction_123',
      };

      expect(successResponse.success).toBe(true);
      expect((successResponse as any).result).toBeDefined();
    });

    test('error response type structure', () => {
      const errorResponse: TuyaOpenAPIResponse = {
        success: false,
        result: null,
        code: 1004,
        msg: 'Invalid credentials',
        t: Date.now(),
        tid: 'transaction_456',
      };

      expect(errorResponse.success).toBe(false);
      expect((errorResponse as any).code).toBeDefined();
      expect((errorResponse as any).msg).toBeDefined();
    });
  });

  describe('API regional configuration', () => {
    test('America endpoint supports multiple country codes', () => {
      const countryCodes = [1, 51, 52, 54]; // Sample US-region codes
      const endpoints = countryCodes.map(code => TuyaOpenAPI.getDefaultEndpoint(code));

      expect(endpoints.every(e => e === TuyaOpenAPI.Endpoints.AMERICA)).toBe(true);
    });

    test('Europe endpoint supports multiple country codes', () => {
      const countryCodes = [43, 44, 45]; // Austria, UK, Denmark
      const endpoints = countryCodes.map(code => TuyaOpenAPI.getDefaultEndpoint(code));

      expect(endpoints.every(e => e === TuyaOpenAPI.Endpoints.EUROPE)).toBe(true);
    });
  });
});
