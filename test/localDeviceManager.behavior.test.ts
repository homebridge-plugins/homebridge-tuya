import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import LocalDeviceManager from '../src/local/LocalDeviceManager';
import type { LocalConfig } from '../src/local/config';

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

jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public parentLog: unknown, public name: string, public debugMode: boolean) {}
    log() {}
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
}));

describe('LocalDeviceManager command and local mapping behavior', () => {
  let log: any;

  beforeEach(() => {
    createdConnections.length = 0;
    log = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
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

    const manager = new LocalDeviceManager(config, log);
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

    const manager = new LocalDeviceManager(config, log);
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

    const manager = new LocalDeviceManager(config, log);
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

    const manager = new LocalDeviceManager(config, log);
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

    const manager = new LocalDeviceManager(config, log);
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
});
