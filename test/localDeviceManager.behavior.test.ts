import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import LocalDeviceManager from '../src/local/LocalDeviceManager';
import type { LocalConfig } from '../src/local/config';
import { TuyaPluginMode } from '../src/config';
import { TuyaDeviceSchemaType } from '../src/cloud/device/TuyaDevice';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

const createdConnections: any[] = [];

jest.mock('../src/local/LocalDevice', () => ({
  __esModule: true,
  default: class MockLocalDevice extends (require('events').EventEmitter) {
    public update = jest.fn();
    public connect = jest.fn();
    public disconnect = jest.fn();
    public context: any;

    constructor(context: any) {
      super();
      this.context = context;
      createdConnections.push(this);
    }
  },
}));

jest.mock('../src/local/TuyaDiscovery', () => ({
  __esModule: true,
  default: class MockTuyaDiscovery {
    public on = jest.fn();
    public start = jest.fn();
    public stop = jest.fn();
  },
}));

// Mock Logger
const mockLog: ExLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as ExLogger;

describe('LocalDeviceManager command and local mapping behavior', () => {
  let log: any;

  beforeEach(() => {
    initLogger(mockLog);
    createdConnections.length = 0;
    jest.clearAllMocks();
  });

  test('warns when auto-discovery is disabled and a device has no local key', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: 'dev-1',
          ip: '192.168.1.10',
        },
      ],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    expect(manager.getDevice('dev-1')).toBeDefined();
    expect(createdConnections).toHaveLength(0);
  });

  test('translates command codes to DPs using merged mapping and sends update', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: 'dev-1',
          ip: '192.168.1.10',
          tuyaKey: 'abcdef1234567890',
          protocolVersion: '3.5',
          dpMapping: {
            switch_1: 7,
            bright_value: 8,
          },
        },
      ],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    const result = await manager.sendCommands('dev-1', [
      { code: 'switch_1', value: true },
      { code: 'bright_value', value: 42 },
      { code: 'unknown_code', value: false },
    ]);

    expect(result).toBe(true);
    expect(createdConnections).toHaveLength(1);
    expect(createdConnections[0].update).toHaveBeenCalledWith({
      '7': true,
      '8': 42,
    });
  });

  test('returns undefined and warns for unknown local device id', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    const result = await manager.sendCommands('missing-device', [{ code: 'switch_1', value: true }]);

    expect(result).toBeUndefined();
  });

  test('updates existing configured device IP on discovery and disconnects stale connection', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: 'dev-1',
          ip: '192.168.1.10',
          tuyaKey: 'abcdef1234567890',
          protocolVersion: '3.5',
        },
      ],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();
    manager.connectAllDevices();

    expect(createdConnections).toHaveLength(1);

    (manager as any)._onDiscovered({
      id: 'dev-1',
      ip: '192.168.1.22',
      version: '3.5',
    });

    const device = manager.getDevice('dev-1');

    expect(device?.ip).toBe('192.168.1.22');
    expect(createdConnections[0].disconnect).toHaveBeenCalled();
  });

  test('creates placeholder device for discovered unknown IDs', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    (manager as any)._onDiscovered({
      id: 'new-dev',
      ip: '192.168.1.30',
      version: '3.5',
      productKey: 'prod1',
    });

    const discovered = manager.getDevice('new-dev');

    expect(discovered).toBeDefined();
    expect(discovered?.ip).toBe('192.168.1.30');
    expect(discovered?.product_id).toBe('prod1');
  });

  test('keeps DP mapping when a local override uses the same code as a no-op rename', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      deviceOverrides: [{
        id: 'dev-1',
        configFor: TuyaPluginMode.local,
        schema: [{
          code: 'humidity_indoor',
          newCode: 'humidity_indoor',
          type: TuyaDeviceSchemaType.Integer,
          property: { min: 0, max: 100, scale: 0, step: 1 },
        }],
      }],
      devices: [{
        tuyaDeviceId: 'dev-1',
        ip: '192.168.1.10',
        tuyaKey: 'abcdef1234567890',
        protocolVersion: '3.5',
        dpMapping: {
          humidity_indoor: 6,
        },
      }],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    const device = manager.getDevice('dev-1');
    const dpMap = (manager as any).dpMaps.get('dev-1');
    const reverseMap = (manager as any).reverseDpMaps.get('dev-1');

    expect(dpMap?.humidity_indoor).toBe(6);
    expect(reverseMap?.[6]).toBe('humidity_indoor');
    expect(device?.schema.some(schema => schema.code === 'humidity_indoor' && schema.type === TuyaDeviceSchemaType.Integer)).toBe(true);
  });

  test('applies local overrides without a rename using the original code', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      deviceOverrides: [{
        id: 'dev-1',
        configFor: TuyaPluginMode.local,
        schema: [{
          code: 'humidity_indoor',
          type: TuyaDeviceSchemaType.Integer,
          property: { min: 0, max: 100, scale: 0, step: 1 },
        }],
      }],
      devices: [{
        tuyaDeviceId: 'dev-1',
        ip: '192.168.1.10',
        tuyaKey: 'abcdef1234567890',
        protocolVersion: '3.5',
        dpMapping: {
          humidity_indoor: 6,
        },
      }],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    const device = manager.getDevice('dev-1');
    const schema = device?.schema.find(item => item.code === 'humidity_indoor');

    expect(schema).toBeDefined();
    expect(schema?.type).toBe(TuyaDeviceSchemaType.Integer);
    expect(device?.schema.every(item => !!item.code)).toBe(true);
  });

  test('applies local overrides', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
      deviceOverrides: [{
        id: 'dev-1',
        category: 'jsq',
        configFor: TuyaPluginMode.local,
        schema: [{
          code: 'humidity_indoor',
          type: TuyaDeviceSchemaType.Integer,
          property: { min: 0, max: 100, scale: 0, step: 1 },
        }],
      }],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    (manager as any)._onDiscovered({
      id: 'dev-1',
      ip: '192.168.0.1',
      version: '3.3',
      productKey: 'prod1',
    });

    const device = manager.getDevice('dev-1');

    expect(device).toBeDefined();
    expect(device?.ip).toBe('192.168.0.1');
    expect(device?.product_id).toBe('prod1');
    expect(device?.category).toBe('jsq');
    expect(device?.schema?.length).toBe(1);
    expect(device?.schema?.[0].code).toBe('humidity_indoor');
  });

  test('do not apply cloud overrides to local devices', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
      deviceOverrides: [{
        id: 'dev-1',
        category: 'jsq',
        configFor: TuyaPluginMode.cloud,
        schema: [{
          code: 'humidity_indoor',
          type: TuyaDeviceSchemaType.Integer,
          property: { min: 0, max: 100, scale: 0, step: 1 },
        }],
      }],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    (manager as any)._onDiscovered({
      id: 'dev-1',
      ip: '192.168.0.1',
      version: '3.3',
      productKey: 'prod1',
    });

    const device = manager.getDevice('dev-1');

    expect(device).toBeDefined();
    expect(device?.ip).toBe('192.168.0.1');
    expect(device?.product_id).toBe('prod1');
    expect(device?.category).toBe('unknown');
    expect(device?.schema?.length).toBe(0);
  });

  test('applies overrides local device (configFor:both)', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
      deviceOverrides: [{
        id: 'dev-1',
        category: 'jsq',
        configFor: TuyaPluginMode.both,
        schema: [{
          code: 'humidity_indoor',
          type: TuyaDeviceSchemaType.Integer,
          property: { min: 0, max: 100, scale: 0, step: 1 },
        }],
      }],
    };

    const manager = new LocalDeviceManager(config);
    await manager.initLocalDevices();

    (manager as any)._onDiscovered({
      id: 'dev-1',
      ip: '192.168.0.1',
      version: '3.3',
      productKey: 'prod1',
    });

    const device = manager.getDevice('dev-1');

    expect(device).toBeDefined();
    expect(device?.ip).toBe('192.168.0.1');
    expect(device?.product_id).toBe('prod1');
    expect(device?.category).toBe('jsq');
    expect(device?.schema?.length).toBe(1);
    expect(device?.schema?.[0].code).toBe('humidity_indoor');
  });
});
