/* eslint-disable no-console */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { TuyaPlatformConfig } from '../src/config';

describe('TuyaPlatformConfig', () => {
  describe('valid configuration', () => {
    test('accepts minimal valid config', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
      };

      expect(config).toBeDefined();
      expect(config.platform).toBe('TuyaPlatform');
      expect(config.name).toBe('Tuya');
    });

    test('accepts config with cloud options', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        options: {
          projectType: '2',
          accessId: 'test_access_id',
          accessKey: 'test_access_key',
          countryCode: 1,
          username: 'user@example.com',
          password: 'password',
          appSchema: 'tuyaSmart',
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
      };

      expect(config.options).toBeDefined();
      expect(config.options?.projectType).toBe('2');
      expect((config.options as any)?.countryCode).toBe(1);
    });

    test('accepts config with custom options', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        options: {
          projectType: '1',
          endpoint: 'https://openapi.tuyaeu.com',
          accessId: 'test_access_id',
          accessKey: 'test_access_key',
          username: 'user@example.com',
          password: 'password',
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
      };

      expect(config.options?.projectType).toBe('1');
      expect((config.options as any)?.endpoint).toBe('https://openapi.tuyaeu.com');
    });
  });

  describe('local configuration', () => {
    test('accepts local config with empty devices', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [],
        },
      };

      expect(config.local).toBeDefined();
      expect(config.local?.devices).toEqual([]);
    });

    test('accepts local config with device list', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device1',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.5',
            },
            {
              tuyaDeviceId: 'device2',
              ip: '192.168.1.2',
              tuyaKey: 'key987654321fedcba',
              protocolVersion: '3.4',
            },
          ],
        },
      };

      expect(config.local?.devices).toHaveLength(2);
      expect(config.local?.devices![0].tuyaDeviceId).toBe('device1');
      expect(config.local?.devices![1].tuyaDeviceId).toBe('device2');
    });

    test('accepts local config with per-device DP mappings', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device1',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.5',
              dpMapping: {
                switch_1: 1,
                bright_value: 2,
                color_data: 3,
                temp_value: 4,
              },
            },
          ],
        },
      };

      expect(config.local?.devices![0].dpMapping).toBeDefined();
      expect((config.local?.devices![0].dpMapping as any)?.switch_1).toBe(1);
      expect((config.local?.devices![0].dpMapping as any)?.bright_value).toBe(2);
    });

    test('accepts local config with per-device mappings', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device1',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.5',
              dpMapping: {
                switch_1: 10,
                switch_2: 11,
              },
            },
          ],
        },
      };

      expect(config.local?.devices![0].dpMapping).toBeDefined();
      expect((config.local?.devices![0].dpMapping as any)?.switch_1).toBe(10);
    });
  });

  describe('protocol versions', () => {
    test('accepts protocol version 3.1', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.1',
            },
          ],
        },
      };

      expect(config.local?.devices![0].protocolVersion).toBe('3.1');
    });

    test('accepts protocol version 3.2', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.2',
            },
          ],
        },
      };

      expect(config.local?.devices![0].protocolVersion).toBe('3.2');
    });

    test('accepts protocol version 3.3', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.3',
            },
          ],
        },
      };

      expect(config.local?.devices![0].protocolVersion).toBe('3.3');
    });

    test('accepts protocol version 3.4', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.4',
            },
          ],
        },
      };

      expect(config.local?.devices![0].protocolVersion).toBe('3.4');
    });

    test('accepts protocol version 3.5', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.5',
            },
          ],
        },
      };

      expect(config.local?.devices![0].protocolVersion).toBe('3.5');
    });
  });

  describe('device configuration fields', () => {
    test('accepts all device config fields', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'full_device',
              ip: '192.168.1.100',
              tuyaKey: 'key_123456789abcdef_full',
              protocolVersion: '3.5',
              dpMapping: {
                switch_1: 1,
              },
            },
          ],
        },
      };

      const device = config.local?.devices![0];
      expect(device?.tuyaDeviceId).toBe('full_device');
      expect(device?.ip).toBe('192.168.1.100');
      expect(device?.tuyaKey).toBe('key_123456789abcdef_full');
      expect(device?.protocolVersion).toBe('3.5');
      expect((device?.dpMapping as any)?.switch_1).toBe(1);
    });

    test('handles IPv4 addresses', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key',
              protocolVersion: '3.5',
            },
            {
              tuyaDeviceId: 'device2',
              ip: '10.0.0.1',
              tuyaKey: 'key',
              protocolVersion: '3.5',
            },
          ],
        },
      };

      expect(config.local?.devices).toHaveLength(2);
      expect(config.local?.devices![0].ip).toBe('192.168.1.1');
      expect(config.local?.devices![1].ip).toBe('10.0.0.1');
    });
  });

  describe('mixed cloud and local configuration', () => {
    test('supports both cloud and local options', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        options: {
          projectType: '2',
          accessId: 'test_access_id',
          accessKey: 'test_access_key',
          countryCode: 1,
          username: 'user@example.com',
          password: 'password',
          appSchema: 'tuyaSmart',
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
        local: {
          devices: [
            {
              tuyaDeviceId: 'local_device',
              ip: '192.168.1.1',
              tuyaKey: 'key123456789abcdef',
              protocolVersion: '3.5',
            },
          ],
        },
      };

      expect(config.options).toBeDefined();
      expect(config.local).toBeDefined();
      expect(config.options?.projectType).toBe('2');
      expect(config.local?.devices).toHaveLength(1);
    });
  });

  describe('configuration validation', () => {
    test('preserves all provided properties', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'My Tuya Devices',
        options: {
          projectType: '2',
          accessId: 'test_access_id',
          accessKey: 'test_access_key',
          countryCode: 1,
          username: 'test@example.com',
          password: 'testpass',
          appSchema: 'tuyaSmart',
          generateWeatherAccessory: true,
          weatherAPI: 'openweathermap',
        },
      };

      expect(config.platform).toBe('TuyaPlatform');
      expect(config.name).toBe('My Tuya Devices');
      expect((config.options as any)?.username).toBe('test@example.com');
    });

    test('allows custom properties through interface', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        options: {} as any,
      };

      expect(config).toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('handles empty local devices array', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [],
        },
      };

      expect(config.local?.devices).toEqual([]);
      expect(config.local?.devices!.length).toBe(0);
    });

    test('handles many devices', () => {
      const devices = Array.from({ length: 100 }, (_, i) => ({
        tuyaDeviceId: `device_${i}`,
        ip: `192.168.1.${i + 1}`,
        tuyaKey: `key_${i}`,
        protocolVersion: ('3.5' as const),
      }));

      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices,
        },
      };

      expect(config.local?.devices).toHaveLength(100);
      expect(config.local?.devices![0].tuyaDeviceId).toBe('device_0');
      expect(config.local?.devices![99].tuyaDeviceId).toBe('device_99');
    });

    test('handles special characters in local key', () => {
      const config: TuyaPlatformConfig = {
        platform: 'TuyaPlatform',
        name: 'Tuya',
        local: {
          devices: [
            {
              tuyaDeviceId: 'device',
              ip: '192.168.1.1',
              tuyaKey: 'key_with-special.chars@123%456',
              protocolVersion: '3.5',
            },
          ],
        },
      };

      expect(config.local?.devices![0].tuyaKey).toBe('key_with-special.chars@123%456');
    });
  });
});
