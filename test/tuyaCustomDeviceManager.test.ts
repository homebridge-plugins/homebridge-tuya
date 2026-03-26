/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import TuyaCustomDeviceManager from '../src/cloud/device/TuyaCustomDeviceManager';
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
    addMessageListener() {}
    start() {}
    stop() {}
  };
});

describe('TuyaCustomDeviceManager', () => {
  let manager: TuyaCustomDeviceManager;
  let mockAPI: any;

  beforeEach(() => {
    mockAPI = {
      log: { log: console.log } as any,
      post: jest.fn(),
      get: jest.fn(),
      tokenInfo: { uid: 'test_uid' },
    };

    manager = new TuyaCustomDeviceManager(mockAPI, false);
  });

  describe('initialization', () => {
    test('creates manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager.api).toBe(mockAPI);
    });

    test('sets MQTT version to 2.0', () => {
      const customManager = new TuyaCustomDeviceManager(mockAPI, false);
      expect(customManager.mq.version).toBe('2.0');
    });

    test('inherits from TuyaDeviceManager', () => {
      expect(manager.devices).toBeDefined();
      expect(Array.isArray(manager.devices)).toBe(true);
    });

    test('supports debug mode', () => {
      const debugManager = new TuyaCustomDeviceManager(mockAPI, true);
      expect(debugManager.debug).toBe(true);
    });
  });

  describe('asset list management', () => {
    test('fetches asset list with root parent', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: {
          list: [
            { asset_id: 'asset_1', asset_name: 'Asset 1' },
            { asset_id: 'asset_2', asset_name: 'Asset 2' },
          ],
        },
      });

      const res = await manager.getAssetList();

      expect(mockAPI.get).toHaveBeenCalledWith(
        '/v1.0/iot-02/assets/-1/sub-assets',
        expect.objectContaining({
          page_no: 0,
          page_size: 100,
        })
      );
      expect(res.success).toBe(true);
      expect(res.result.list.length).toBe(2);
    });

    test('fetches asset list with specific parent', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: { list: [] },
      });

      await manager.getAssetList(123);

      expect(mockAPI.get).toHaveBeenCalledWith(
        '/v1.0/iot-02/assets/123/sub-assets',
        expect.any(Object)
      );
    });

    test('handles empty asset list', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: { list: [] },
      });

      const res = await manager.getAssetList();

      expect(res.success).toBe(true);
      expect(res.result.list.length).toBe(0);
    });

    test('handles API errors', async () => {
      mockAPI.get.mockResolvedValue({
        success: false,
        code: 1001,
        msg: 'Invalid asset ID',
      });

      const res = await manager.getAssetList();

      expect(res.success).toBe(false);
      expect((res as any).code).toBe(1001);
    });
  });

  describe('asset authorization', () => {
    test('authorizes single asset', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const res = await manager.authorizeAssetList('user_123', ['asset_1']);

      expect(mockAPI.post).toHaveBeenCalledWith(
        '/v1.0/iot-03/users/user_123/actions/batch-assets-authorized',
        expect.objectContaining({
          asset_ids: 'asset_1',
          authorized_children: false,
        })
      );
      expect(res.success).toBe(true);
    });

    test('authorizes multiple assets', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const assetIds = ['asset_1', 'asset_2', 'asset_3'];
      await manager.authorizeAssetList('user_123', assetIds);

      expect(mockAPI.post).toHaveBeenCalledWith(
        '/v1.0/iot-03/users/user_123/actions/batch-assets-authorized',
        expect.objectContaining({
          asset_ids: 'asset_1,asset_2,asset_3',
          authorized_children: false,
        })
      );
    });

    test('authorizes with children flag', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      await manager.authorizeAssetList('user_123', ['asset_1'], true);

      expect(mockAPI.post).toHaveBeenCalledWith(
        '/v1.0/iot-03/users/user_123/actions/batch-assets-authorized',
        expect.objectContaining({
          authorized_children: true,
        })
      );
    });

    test('handles authorization failure', async () => {
      mockAPI.post.mockResolvedValue({
        success: false,
        code: 4001,
        msg: 'User not found',
      });

      const res = await manager.authorizeAssetList('invalid_user', ['asset_1']);

      expect(res.success).toBe(false);
      expect((res as any).code).toBe(4001);
    });

    test('handles empty asset list authorization', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      await manager.authorizeAssetList('user_123', []);

      expect(mockAPI.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          asset_ids: '',
        })
      );
    });
  });

  describe('device list management', () => {
    test('fetches device IDs for asset', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        return Promise.resolve({
        success: true,
        result: {
          list: [
            { device_id: 'dev_1', product_name: 'Light' },
            { device_id: 'dev_2', product_name: 'Switch' },
          ],
          has_next: false,
          last_row_key: '',
        },
      });

      });

      const res = await manager.getAssetDeviceIDList('asset_123');

      expect(mockAPI.get).toHaveBeenCalledWith(
        '/v1.0/iot-02/assets/asset_123/devices',
        expect.any(Object)
      );
      expect(res).toBeDefined();
    });

    test('updates devices from asset list', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        if (url === '/v1.0/devices') {
          return Promise.resolve({
            success: true,
            result: {
              devices: [
                {
                  id: 'dev_1',
                  name: 'Device 1',
                  product_id: 'prod_1',
                  category: 'dj',
                  status: [],
                },
              ],
            },
          });
        }
        if (url.includes('/iot-02/assets/') && url.includes('/devices')) {
          return Promise.resolve({
            success: true,
            result: {
              list: [
                {
                  device_id: 'dev_1',
                },
              ],
              has_next: false,
              last_row_key: '',
            },
          });
        }
        if (url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: {
              status: [],
              functions: [],
            },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      const devices = await manager.updateDevices(['asset_1']);

      expect(devices).toBeDefined();
      expect(Array.isArray(devices)).toBe(true);
    });

    test('handles empty device list', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        if (url === '/v1.0/devices') {
          return Promise.resolve({
            success: true,
            result: {
              devices: [],
            },
          });
        }
        if (url.includes('/iot-02/assets/') && url.includes('/devices')) {
          return Promise.resolve({
            success: true,
            result: { list: [], has_next: false, last_row_key: '' },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      const devices = await manager.updateDevices(['asset_1']);

      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBe(0);
    });
  });

  describe('device operations', () => {
    test('creates TuyaDevice from raw data', () => {
      const deviceData = {
        id: 'dev_001',
        name: 'Smart Light',
        product_id: 'prod_001',
        category: 'dj',
        status: [],
      };

      const device = new TuyaDevice(deviceData);

      expect(device.id).toBe('dev_001');
      expect(device.name).toBe('Smart Light');
    });

    test('retrieves device by ID', () => {
      manager.devices = [
        new TuyaDevice({
          id: 'dev_1',
          product_id: 'prod_1',
          category: 'dj',
          name: 'Device 1',
          status: [],
        }),
        new TuyaDevice({
          id: 'dev_2',
          product_id: 'prod_2',
          category: 'kg',
          name: 'Device 2',
          status: [],
        }),
      ];

      const device = manager.getDevice('dev_1');

      expect(device).toBeDefined();
      expect(device?.id).toBe('dev_1');
    });

    test('returns undefined for non-existent device', () => {
      manager.devices = [];

      const device = manager.getDevice('non_existent');

      expect(device).toBeUndefined();
    });
  });

  describe('error scenarios', () => {

    test('handles API timeout', async () => {
      mockAPI.get.mockRejectedValue(new Error('Request timeout'));

      try {
        await manager.getAssetList();
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    test('handles invalid response format', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: null,
      });

      const res = await manager.getAssetList();

      expect(res.result).toBeNull();
    });

    test('handles authorization with no assets', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const res = await manager.authorizeAssetList('user_123');

      expect(res.success).toBe(true);
    });

    test('recovers from failed asset list fetch', async () => {
      mockAPI.get.mockResolvedValueOnce({
        success: false,
        code: 5000,
        msg: 'Server error',
      });

      mockAPI.get.mockResolvedValueOnce({
        success: true,
        result: { list: ['asset_1'] },
      });

      const res1 = await manager.getAssetList();
      const res2 = await manager.getAssetList();

      expect(res1.success).toBe(false);
      expect(res2.success).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    test('complete workflow: fetch assets -> authorize -> get devices', async () => {
      mockAPI.get.mockImplementation((url: string, params: any) => {
        if (url.includes('sub-assets')) {
          return Promise.resolve({
            success: true,
            result: {
              list: [
                { asset_id: 'asset_1', asset_name: 'Home' },
              ],
            },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      // Fetch assets
      const assetRes = await manager.getAssetList();
      expect(assetRes.success).toBe(true);

      // Authorize
      const authRes = await manager.authorizeAssetList('user_1', ['asset_1']);
      expect(authRes.success).toBe(true);

      // Both calls completed successfully
      expect(mockAPI.get).toHaveBeenCalled();
      expect(mockAPI.post).toHaveBeenCalled();
    });

    test('handles multiple asset authorization', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const assetIds = Array.from({ length: 5 }, (_, i) => `asset_${i}`);

      await manager.authorizeAssetList('user_1', assetIds);

      expect(mockAPI.post).toHaveBeenCalledTimes(1);
      expect(mockAPI.post.mock.calls[0][1].asset_ids).toBe(assetIds.join(','));
    });
  });
});
