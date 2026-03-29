/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import TuyaHomeDeviceManager from '../src/cloud/device/TuyaHomeDeviceManager';
import TuyaDevice from '../src/cloud/device/TuyaDevice';

// Mock Logger
jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: any, public name: string, public debug: boolean) {}
    info() {}
    warn() {}
    error() {}
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

describe('TuyaHomeDeviceManager', () => {
  let manager: TuyaHomeDeviceManager;
  let mockAPI: any;

  beforeEach(() => {
    mockAPI = {
      log: { log: console.log } as any,
      post: jest.fn(),
      get: jest.fn(),
      tokenInfo: { uid: 'test_uid' },
    };

    manager = new TuyaHomeDeviceManager(mockAPI, false);
  });

  describe('initialization', () => {
    test('creates manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager.api).toBe(mockAPI);
    });

    test('inherits from TuyaDeviceManager', () => {
      expect(manager.devices).toBeDefined();
      expect(Array.isArray(manager.devices)).toBe(true);
    });

    test('supports debug mode', () => {
      const debugManager = new TuyaHomeDeviceManager(mockAPI, true);
      expect(debugManager.debug).toBe(true);
    });

    test('initializes as EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
    });
  });

  describe('home list management', () => {
    test('fetches home list for current user', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [
          { home_id: 1, name: 'Primary Home' },
          { home_id: 2, name: 'Vacation Home' },
        ],
      });

      const res = await manager.getHomeList();

      expect(mockAPI.get).toHaveBeenCalledWith('/v1.0/users/test_uid/homes');
      expect(res.success).toBe(true);
      expect(res.result.length).toBe(2);
    });

    test('handles single home', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [{ home_id: 1, name: 'Home' }],
      });

      const res = await manager.getHomeList();

      expect(res.result.length).toBe(1);
      expect(res.result[0].home_id).toBe(1);
    });

    test('handles empty home list', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [],
      });

      const res = await manager.getHomeList();

      expect(res.success).toBe(true);
      expect(res.result.length).toBe(0);
    });

    test('handles home list API failure', async () => {
      mockAPI.get.mockResolvedValue({
        success: false,
        code: 1002,
        msg: 'User not found',
      });

      const res = await manager.getHomeList();

      expect(res.success).toBe(false);
      expect((res as any).code).toBe(1002);
    });
  });

  describe('device list by home', () => {
    test('fetches device list for specific home', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [
          {
            id: 'dev_1',
            name: 'Living Room Light',
            product_name: 'Light',
            category: 'dj',
            product_id: 'prod_1',
          },
          {
            id: 'dev_2',
            name: 'Kitchen Switch',
            product_name: 'Switch',
            category: 'kg',
            product_id: 'prod_2',
          },
        ],
      });

      const res = await manager.getHomeDeviceList(1);

      expect(mockAPI.get).toHaveBeenCalledWith('/v1.0/homes/1/devices');
      expect(res.success).toBe(true);
      expect(res.result.length).toBe(2);
    });

    test('fetches devices for different homes', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [],
      });

      await manager.getHomeDeviceList(1);
      await manager.getHomeDeviceList(2);
      await manager.getHomeDeviceList(3);

      expect(mockAPI.get).toHaveBeenCalledWith('/v1.0/homes/1/devices');
      expect(mockAPI.get).toHaveBeenCalledWith('/v1.0/homes/2/devices');
      expect(mockAPI.get).toHaveBeenCalledWith('/v1.0/homes/3/devices');
    });

    test('handles empty device list for home', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [],
      });

      const res = await manager.getHomeDeviceList(1);

      expect(res.success).toBe(true);
      expect(res.result.length).toBe(0);
    });

    test('handles API error for device list', async () => {
      mockAPI.get.mockResolvedValue({
        success: false,
        code: 1001,
        msg: 'Home not found',
      });

      const res = await manager.getHomeDeviceList(999);

      expect(res.success).toBe(false);
      expect((res as any).code).toBe(1001);
    });
  });

  describe('device update management', () => {
    test('updates devices from multiple homes', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        if (url.includes('devices') && !url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: [
              {
                id: 'dev_1',
                name: 'Light',
                product_id: 'prod_1',
                category: 'dj',
                product_name: 'Light',
                status: [],
              },
            ],
          });
        }
        if (url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: { status: [], functions: [] },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      const devices = await manager.updateDevices([1, 2, 3]);

      expect(Array.isArray(devices)).toBe(true);
      expect(mockAPI.get.mock.calls.length).toBeGreaterThan(0);
    });

    test('handles failed home device fetch', async () => {
      mockAPI.get.mockResolvedValue({
        success: false,
        code: 1001,
        result: [],
      });

      const devices = await manager.updateDevices([1]);

      expect(Array.isArray(devices)).toBe(true);
    });

    test('combines devices from multiple homes', async () => {
      let callCount = 0;

      mockAPI.get.mockImplementation((url: string) => {
        if (url.includes('devices') && !url.includes('specification')) {
          callCount++;
          return Promise.resolve({
            success: true,
            result: [
              {
                id: `dev_home${callCount}`,
                name: `Device Home ${callCount}`,
                product_id: `prod_${callCount}`,
                category: 'dj',
                product_name: 'Light',
                status: [],
              },
            ],
          });
        }
        if (url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: { status: [], functions: [] },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      const devices = await manager.updateDevices([1, 2, 3]);

      expect(Array.isArray(devices)).toBe(true);
    });

    test('retrieves device schema for each device', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        if (url.includes('devices') && !url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: [
              {
                id: 'dev_1',
                name: 'Light',
                product_id: 'prod_1',
                category: 'dj',
              },
            ],
          });
        }
        if (url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: { status: [], functions: [] },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      await manager.updateDevices([1]);

      expect(mockAPI.get).toHaveBeenCalled();
    });
  });

  describe('scene management', () => {
    test('fetches scene list for home', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [
          { scene_id: 'scene_1', name: 'Good Morning', enabled: true, status: '1' },
          { scene_id: 'scene_2', name: 'Movie Time', enabled: true, status: '1' },
          { scene_id: 'scene_3', name: 'Leaving Home', enabled: true, status: '1' },
        ],
      });

      const res = await manager.getSceneList(1);

      expect(mockAPI.get).toHaveBeenCalledWith('/v1.1/homes/1/scenes');
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(3);
    });

    test('handles empty scene list', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [],
      });

      const res = await manager.getSceneList(1);

      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(0);
    });

    test('handles scene list API error', async () => {
      mockAPI.get.mockResolvedValue({
        success: false,
        code: 1001,
        msg: 'Home not found',
      });

      const res = await manager.getSceneList(999);

      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBe(0);
    });

    test('fetches scenes from multiple homes', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [
          { scene_id: 'scene_1', name: 'Scene 1', enabled: true, status: '1' },
        ],
      });

      const res1 = await manager.getSceneList(1);
      const res2 = await manager.getSceneList(2);
      const res3 = await manager.getSceneList(3);

      expect(mockAPI.get).toHaveBeenCalledWith('/v1.1/homes/1/scenes');
      expect(mockAPI.get).toHaveBeenCalledWith('/v1.1/homes/2/scenes');
      expect(mockAPI.get).toHaveBeenCalledWith('/v1.1/homes/3/scenes');
    });
  });

  describe('scene execution', () => {
    test('executes scene in home', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: { code: '0' },
      });

      const res = await manager.executeScene(1, 'scene_123');

      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/1/scenes/scene_123/trigger');
      expect(res.success).toBe(true);
    });

    test('handles scene execution with numeric home ID', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      await manager.executeScene(42, 'scene_456');

      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/42/scenes/scene_456/trigger');
    });

    test('handles scene execution with string home ID', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      await manager.executeScene('home_123', 'scene_456');

      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/home_123/scenes/scene_456/trigger');
    });

    test('handles scene execution failure', async () => {
      mockAPI.post.mockResolvedValue({
        success: false,
        code: 1002,
        msg: 'Scene not found',
      });

      const res = await manager.executeScene(1, 'non_existent_scene');

      expect((res as any).success).toBe(false);
      expect((res as any).code).toBe(1002);
    });

    test('executes multiple scenes sequentially', async () => {
      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const sceneIds = ['scene_1', 'scene_2', 'scene_3'];

      for (const sceneId of sceneIds) {
        await manager.executeScene(1, sceneId);
      }

      expect(mockAPI.post).toHaveBeenCalledTimes(3);
      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/1/scenes/scene_1/trigger');
      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/1/scenes/scene_2/trigger');
      expect(mockAPI.post).toHaveBeenCalledWith('/v1.0/homes/1/scenes/scene_3/trigger');
    });
  });

  describe('error handling', () => {
    test('handles API timeout', async () => {
      mockAPI.get.mockRejectedValue(new Error('Request timeout'));

      try {
        await manager.getHomeList();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    test('handles invalid response format', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: null,
      });

      const res = await manager.getHomeList();

      expect(res.result).toBeNull();
    });

    test('recovers from failed request', async () => {
      mockAPI.get
        .mockResolvedValueOnce({
          success: false,
          code: 5000,
        })
        .mockResolvedValueOnce({
          success: true,
          result: [],
        });

      const res1 = await manager.getHomeList();
      const res2 = await manager.getHomeList();

      expect((res1 as any).success).toBe(false);
      expect((res2 as any).success).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    test('complete workflow: get homes -> get devices -> get scenes', async () => {
      mockAPI.get.mockImplementation((url: string) => {
        if (url.includes('/homes') && !url.includes('scenes')) {
          return Promise.resolve({
            success: true,
            result: [{ home_id: 1, name: 'Home' }],
          });
        }
        if (url.includes('devices')) {
          return Promise.resolve({
            success: true,
            result: [
              {
                id: 'dev_1',
                name: 'Device',
                product_id: 'prod_1',
                category: 'dj',
              },
            ],
          });
        }
        if (url.includes('scenes')) {
          return Promise.resolve({
            success: true,
            result: [{ scene_id: 'scene_1', name: 'Scene', enabled: true, status: '1' }],
          });
        }
        if (url.includes('specification')) {
          return Promise.resolve({
            success: true,
            result: { status: [], functions: [] },
          });
        }
        return Promise.resolve({ success: true, result: {} });
      });

      const homesRes = await manager.getHomeList();
      const devicesRes = await manager.getHomeDeviceList(1);
      const scenesRes = await manager.getSceneList(1);

      expect((homesRes as any).success).toBe(true);
      expect((devicesRes as any).success).toBe(true);
      expect(Array.isArray(scenesRes)).toBe(true);
    });

    test('execute scene after fetching homes', async () => {
      mockAPI.get.mockResolvedValue({
        success: true,
        result: [{ home_id: 1, name: 'Home' }],
      });

      mockAPI.post.mockResolvedValue({
        success: true,
        result: {},
      });

      const homes = await manager.getHomeList();
      expect((homes as any).success).toBe(true);

      if ((homes as any).result && (homes as any).result.length > 0) {
        const result = await manager.executeScene((homes as any).result[0].home_id, 'scene_1');
        expect(result.success).toBe(true);
      }
    });
  });
});
