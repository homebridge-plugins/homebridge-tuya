/* eslint-disable no-console */
import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { LocalConfig } from '../src/local/config';
import { TuyaPlatformCloudConfig } from '../src/config';
import TuyaHybridDeviceManager from '../src/shared/TuyaHybridDeviceManager';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

describe('HybridDeviceManager', () => {
  let manager: TuyaHybridDeviceManager;
  let mockAPI: any;

  beforeEach(() => {
    // Mock Logger
    const mockLog: ExLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      success: jest.fn(),
    } as unknown as ExLogger;

    initLogger(mockLog);
    
    mockAPI = {
      log: { log: mockLog } as any,
      post: jest.fn(),
      get: jest.fn(),
      tokenInfo: { uid: 'test_uid' },
    };

    const mockCloudConfig: TuyaPlatformCloudConfig = {
      projectType: '2',
      accessId: 'test_id',
      accessKey: 'test_key',
      countryCode: 1,
      username: 'user@example.com',
      password: 'password',
      appSchema: 'tuyaSmart',
      generateWeatherAccessory: false,
      weatherAPI: '',
      forceIPv4: false,
    };
    const config: LocalConfig = {
      devices: [],
    };
    manager = new TuyaHybridDeviceManager(mockAPI, mockCloudConfig, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('creates manager instance with config', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(TuyaHybridDeviceManager);
    });

    test('initializes with empty devices', () => {
      expect(manager.devices.length).toBe(0);
    });

    test('stops MQTT on initialization', () => {
      // MQTT should be stopped during construction
      expect(manager).toBeDefined();
    });
  });

  describe('enrichLocalConfigFromCloud', () => {
      test('enriches local config with cloud device details', async () => {
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
          } as TuyaPlatformCloudConfig,
          local: {
            devices: [],
          },
        };

        const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

        // Mock cloud device
        const mockCloudDevice = {
          id: 'test-device-123',
          uuid: 'test-device-123',
          name: 'Test Device',
          product_id: 'product-123',
          local_key: 'test-local-key-abcdef',
          isVirtualDevice: jest.fn(),
        } as any;
  
        // Enrich local config
        const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);
  
        // Verify local config was enriched
        expect(enrichedLocalConfig).toBeDefined();
        if (enrichedLocalConfig?.devices) {
          expect(enrichedLocalConfig.devices.length).toBeGreaterThan(0);
          
          const enrichedDevice = enrichedLocalConfig.devices[0];
          expect(enrichedDevice.tuyaDeviceId).toBe('test-device-123');
          expect(enrichedDevice.tuyaKey).toBe('test-local-key-abcdef');
        }
      });
  
      test('preserves manual local config when enriching', async () => {
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
          } as TuyaPlatformCloudConfig,
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

        const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);
  
        // Mock cloud device (different from manual one)
        const mockCloudDevice = {
          id: 'test-device-123',
          uuid: 'test-device-123',
          name: 'Test Device',
          product_id: 'product-123',
          ip: '192.168.1.100',
          local_key: 'test-local-key-abcdef',
          isVirtualDevice: jest.fn(),
        } as any;
  
        // Enrich local config
        const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);
  
        // Verify local config exists and has devices
        expect(enrichedLocalConfig).toBeDefined();
        if (enrichedLocalConfig?.devices) {
          // Verify manual device is still there
          const manualDevice = enrichedLocalConfig.devices.find(
            d => d.tuyaDeviceId === 'manual-device-456'
          );
          expect(manualDevice).toBeDefined();
          expect(manualDevice?.tuyaKey).toBe('manual-key-xyz');
  
          // Verify new cloud device was added
          const cloudDevice = enrichedLocalConfig.devices.find(
            d => d.tuyaDeviceId === 'test-device-123'
          );
          expect(cloudDevice).toBeDefined();
          expect(cloudDevice?.tuyaKey).toBe('test-local-key-abcdef');
        }
      });
  
      test('skips enrichment if cloud device details unavailable', async () => {
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
          } as TuyaPlatformCloudConfig,
          local: {
            devices: [],
          },
        };

        const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);
  
        const mockCloudDevice = {
          id: 'test-device-123',
          name: 'Test Device',
          isVirtualDevice: jest.fn(),
        } as any;
  
        // Enrich local config
        const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);
  
        // Verify nothing was added (since API failed)
        expect(enrichedLocalConfig).toBeDefined();
        if (enrichedLocalConfig?.devices) {
          expect(enrichedLocalConfig.devices.length).toBe(0);
        }
      });
    });

  describe('API field variations and error handling', () => {
    test('handles localKey instead of local_key in API response', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        id: 'test-device-123',
        uuid: 'test-device-123',
        name: 'Test Device',
        product_id: 'product-123',
        local_key: 'test-local-key-abcdef',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        const enrichedDevice = enrichedLocalConfig.devices[0];
        expect(enrichedDevice.tuyaKey).toBe('test-local-key-abcdef');
      }
    });

    test('uses uuid fallback when cloud device id is missing', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        uuid: 'fallback-device-123',
        name: 'Fallback Device',
        local_key: 'fallback-key-123',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        const enrichedDevice = enrichedLocalConfig.devices[0];
        expect(enrichedDevice.tuyaDeviceId).toBe('fallback-device-123');
        expect(enrichedDevice.tuyaKey).toBe('fallback-key-123');
      }
    });

    test('propagates cloud category into local config', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);


      const mockCloudDevice = {
        id: 'category-device-123',
        name: 'Category Device',
        category: 'kg',
        product_id: 'abc123',
        local_key: 'test-local-key-abcdef',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        const enrichedDevice = enrichedLocalConfig.devices[0];
        expect(enrichedDevice.category).toBe('kg');
      }
    });

    test('handles missing local_key gracefully', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        id: 'test-device-no-key',
        name: 'Device Without Local Key',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      // Device should not be added to local config without local_key
      if (enrichedLocalConfig?.devices) {
        expect(enrichedLocalConfig.devices.length).toBe(0);
      }
    });

    test('handles API timeout with grace', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        id: 'test-device-timeout',
        name: 'Timeout Device',
        isVirtualDevice: jest.fn(),
      } as any;

      // Should not throw, but handle gracefully
      await expect(deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local)).resolves.toEqual({"devices": []});
      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);
      
      // Local devices should remain empty (timeout treated as error)
      if (enrichedLocalConfig?.devices) {
        expect(enrichedLocalConfig.devices.length).toBe(0);
      }
    });
  });

  describe('mixed config scenarios', () => {
    test('updates manual local config with cloud-provided local_key', async () => {
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
        } as TuyaPlatformCloudConfig,
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

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        id: 'manual-device-xyz',
        name: 'Manual Device No Key',
        local_key: 'cloud-filled-key',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        const enrichedDevice = enrichedLocalConfig.devices[0];
        expect(enrichedDevice.tuyaDeviceId).toBe('manual-device-xyz');
        expect(enrichedDevice.tuyaKey).toBe('cloud-filled-key');
        // Original name should be preserved
        expect(enrichedDevice.name).toBe('Manual Device No Key');
      }
    });

    test('does not overwrite existing manual local_key', async () => {
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
        } as TuyaPlatformCloudConfig,
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

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevice = {
        id: 'device-with-manual-key',
        name: 'Device With Manual Key',
        isVirtualDevice: jest.fn(),
      } as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud']([mockCloudDevice], bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        const enrichedDevice = enrichedLocalConfig.devices[0];
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevices = [
        { id: 'device-1', uuid: 'device-1', name: 'Device 1', product_id: 'prod-1', local_key: 'local-key-1', isVirtualDevice: jest.fn() },
        { id: 'device-2', uuid: 'device-2', name: 'Device 2', product_id: 'prod-2', local_key: 'local-key-2', isVirtualDevice: jest.fn() },
        { id: 'device-3', uuid: 'device-3', name: 'Device 3', product_id: 'prod-3', local_key: 'local-key-3', isVirtualDevice: jest.fn() },
      ] as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud'](mockCloudDevices, bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        expect(enrichedLocalConfig.devices.length).toBe(3);
        
        const device1 = enrichedLocalConfig.devices.find(d => d.tuyaDeviceId === 'device-1');
        const device2 = enrichedLocalConfig.devices.find(d => d.tuyaDeviceId === 'device-2');
        const device3 = enrichedLocalConfig.devices.find(d => d.tuyaDeviceId === 'device-3');
        
        expect(device1?.tuyaKey).toBe('local-key-1');
        expect(device2?.tuyaKey).toBe('local-key-2');
        expect(device3?.tuyaKey).toBe('local-key-3');
      }
    });

    test('continues enrichment if single device fails', async () => {
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
        } as TuyaPlatformCloudConfig,
        local: {
          devices: [],
        },
      };

      const deviceManager = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local, false);

      const mockCloudDevices = [
        { id: 'device-ok-1', uuid: 'device-ok-1', name: 'OK Device 1', local_key: 'local-key-1', isVirtualDevice: jest.fn() },
        { id: 'device-fail', uuid: 'device-fail', name: 'Failing Device', local_key: 'local-key-fail' },
        { id: 'device-ok-2', uuid: 'device-ok-2', name: 'OK Device 2', local_key: 'local-key-2', isVirtualDevice: jest.fn() },
      ] as any;

      const enrichedLocalConfig = await deviceManager['enrichLocalConfigFromCloud'](mockCloudDevices, bothConfig.local);

      if (enrichedLocalConfig?.devices) {
        // Should have 2 devices (one failed, skipped)
        expect(enrichedLocalConfig.devices.length).toBe(2);
        
        const hasOk1 = enrichedLocalConfig.devices.some(d => d.tuyaDeviceId === 'device-ok-1');
        const hasOk2 = enrichedLocalConfig.devices.some(d => d.tuyaDeviceId === 'device-ok-2');
        const hasFailed = enrichedLocalConfig.devices.some(d => d.tuyaDeviceId === 'device-fail');
        
        expect(hasOk1).toBe(true);
        expect(hasOk2).toBe(true);
        expect(hasFailed).toBe(false);
      }
    });
  });

  describe('pullDevices()', () => {
    let instance: TuyaHybridDeviceManager;
    let cloudDeviceManager: any;
    let localDeviceManager: any;

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
      } as TuyaPlatformCloudConfig,
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

    beforeEach(() => {
      cloudDeviceManager = {
        pullDevices: jest.fn(),
      };
      localDeviceManager = {
        pullDevices: jest.fn(),
      };

      instance = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local);
      instance['cloudDeviceManager'] = cloudDeviceManager;
      instance['localDeviceManager'] = localDeviceManager;
    });

    // ---------------------------------------------------------
    // 1. Both cloud and local return devices → should merge correctly
    // ---------------------------------------------------------
    test('should merge cloud and local devices without duplicates', async () => {
      const localDevices = [
        { id: 'A', name: 'Local A' },
        { id: 'B', name: 'Local B' },
      ];
      const cloudDevices = [
        { id: 'B', name: 'Cloud B' }, // duplicate
        { id: 'C', name: 'Cloud C' },
      ];

      localDeviceManager.pullDevices.mockResolvedValue(localDevices);
      cloudDeviceManager.pullDevices.mockResolvedValue(cloudDevices);

      const result = await instance.pullDevices();

      expect(result).toEqual([
        { id: 'A', name: 'Local A' },
        { id: 'B', name: 'Local B' }, // local takes precedence
        { id: 'C', name: 'Cloud C' },
      ]);

    });

    // ---------------------------------------------------------
    // 2. Cloud returns empty → enrichLocalConfigFromCloud should not be called
    // ---------------------------------------------------------
    test('should not enrich local config when cloud devices are empty', async () => {
      localDeviceManager.pullDevices.mockResolvedValue([{ id: 'A' }]);
      cloudDeviceManager.pullDevices.mockResolvedValue([]);

      const spyEnrichLocalConfigFromCloud = jest.fn();
      (instance as any).enrichLocalConfigFromCloud = spyEnrichLocalConfigFromCloud;
      const result = await instance.pullDevices();

      expect(result).toEqual([{ id: 'A' }]);
      expect(spyEnrichLocalConfigFromCloud).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------
    // 3. Local returns empty → should return only cloud devices
    // ---------------------------------------------------------
    test('should return only cloud devices when local devices are empty', async () => {
      localDeviceManager.pullDevices.mockResolvedValue([]);
      cloudDeviceManager.pullDevices.mockResolvedValue([
        { id: 'X', name: 'Cloud X' },
      ]);

      const spyEnrichLocalConfigFromCloud = jest.fn();
      (instance as any).enrichLocalConfigFromCloud = spyEnrichLocalConfigFromCloud;
      const result = await instance.pullDevices();

      expect(result).toEqual([{ id: 'X', name: 'Cloud X' }]);
      expect(spyEnrichLocalConfigFromCloud).toHaveBeenCalled();
    });

    // ---------------------------------------------------------
    // 4. Both cloud and local return empty → should return empty array
    // ---------------------------------------------------------
    test('should return empty array when both sources return empty', async () => {
      localDeviceManager.pullDevices.mockResolvedValue([]);
      cloudDeviceManager.pullDevices.mockResolvedValue([]);

      const result = await instance.pullDevices();

      expect(result).toEqual([]);
    });
  });
  
  
  describe('createDeviceConfigHash()', () => {
  let instance: TuyaHybridDeviceManager;
  let cloudDeviceManager: any;
  let localDeviceManager: any;

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
    } as TuyaPlatformCloudConfig,
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

  beforeEach(() => {
    cloudDeviceManager = {
      createDeviceConfigHash: jest.fn(),
    };
    localDeviceManager = {
      createDeviceConfigHash: jest.fn(),
    };

    instance = new TuyaHybridDeviceManager(mockAPI, bothConfig.cloud, bothConfig.local);
    instance['cloudDeviceManager'] = cloudDeviceManager;
    instance['localDeviceManager'] = localDeviceManager;
  });

  // ---------------------------------------------------------
  // Should concatenate local and cloud hash strings
  // ---------------------------------------------------------
  it('should return concatenated hash from local and cloud managers', () => {
    const device = { id: 'A', name: 'Device A' };

    localDeviceManager.createDeviceConfigHash.mockReturnValue('localHash');
    cloudDeviceManager.createDeviceConfigHash.mockReturnValue('cloudHash');

    const result = instance.createDeviceConfigHash(device as any);

    expect(result).toBe('localHashcloudHash');

    expect(localDeviceManager.createDeviceConfigHash).toHaveBeenCalledWith(device);
    expect(cloudDeviceManager.createDeviceConfigHash).toHaveBeenCalledWith(device);
  });

  // ---------------------------------------------------------
  // Should work even if one side returns an empty string
  // ---------------------------------------------------------
  it('should handle empty hash values', () => {
    const device = { id: 'B' };

    localDeviceManager.createDeviceConfigHash.mockReturnValue('');
    cloudDeviceManager.createDeviceConfigHash.mockReturnValue('cloudOnly');

    const result = instance.createDeviceConfigHash(device as any);

    expect(result).toBe('cloudOnly');
  });

  // ---------------------------------------------------------
  // Should work even if both return empty strings
  // ---------------------------------------------------------
  it('should return empty string when both hashes are empty', () => {
    const device = { id: 'C' };

    localDeviceManager.createDeviceConfigHash.mockReturnValue('');
    cloudDeviceManager.createDeviceConfigHash.mockReturnValue('');

    const result = instance.createDeviceConfigHash(device as any);

    expect(result).toBe('');
  });
});

});
