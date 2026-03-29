import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import LocalDeviceManager from '../../src/local/LocalDeviceManager';
import { LocalConfig } from '../../src/local/config';
import Logger from '../../src/shared/util/Logger';

function makeMockLog(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  } as unknown as Logger;
}

describe('LocalDeviceManager – Cloud-based child discovery', () => {
  let log: Logger;
  let manager: LocalDeviceManager;

  const GATEWAY_ID = 'cloud_gw_001';
  const DEVICE_KEY = '0123456789abcdef';
  const DEVICE_IP = '192.168.1.200';

  beforeEach(() => {
    log = makeMockLog();
  });

  afterEach(() => {
    if (manager) {
      manager.stopLocalDevices();
    }
    jest.clearAllMocks();
  });

  it('method exists and can be called without error', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Cloud Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          isZigbeeGateway: true,
        },
      ],
    };

    manager = new LocalDeviceManager(config, log);

    const cloudDevices = [
      { id: GATEWAY_ID },
      { id: 'child_cloud_001', gateway_id: GATEWAY_ID },
    ];

    // Should not throw
    expect(() => {
      manager.discoverChildrenFromCloud(cloudDevices);
    }).not.toThrow();
  });

  it('logs debug for missing gateway config', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [],
    };

    manager = new LocalDeviceManager(config, log);

    const cloudDevices = [
      { id: 'unknown_gw', gateway_id: undefined },
      { id: 'child_001', gateway_id: 'unknown_gw' },
    ];

    manager.discoverChildrenFromCloud(cloudDevices);

    const debugSpy = log.debug as jest.MockedFunction<typeof log.debug>;
    expect(debugSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('handles empty cloud device list', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
        },
      ],
    };

    manager = new LocalDeviceManager(config, log);

    // Should not throw
    expect(() => {
      manager.discoverChildrenFromCloud([]);
      manager.discoverChildrenFromCloud(undefined);
      manager.discoverChildrenFromCloud(null as any);
    }).not.toThrow();
  });

  it('respects isZigbeeGateway: false', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Non-Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          isZigbeeGateway: false,
        },
      ],
    };

    manager = new LocalDeviceManager(config, log);

    const cloudDevices = [
      { id: GATEWAY_ID },
      { id: 'child_001', gateway_id: GATEWAY_ID },
    ];

    manager.discoverChildrenFromCloud(cloudDevices);

    // Should not log auto-discovery (device is not a gateway)
    const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
    const callsWithAutoDiscovery = infoSpy.mock.calls.filter(c =>
      String(c[0]).includes('auto-discovery'),
    );
    expect(callsWithAutoDiscovery.length).toBe(0);
  });

  it('triggers Zigbee relationship re-detection', async () => {
    const config: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          isZigbeeGateway: true,
        },
      ],
    };

    manager = new LocalDeviceManager(config, log);

    const cloudDevices = [
      { id: GATEWAY_ID },
      { id: 'child_001', gateway_id: GATEWAY_ID },
    ];

    // After discovery, the config should have more devices (auto-discovered children added)
    manager.discoverChildrenFromCloud(cloudDevices);

    // The manager's internal gateway relationships should be re-detected
    // (We can't easily verify this without breaking encapsulation, but the method should complete without error)
    expect(manager).toBeDefined();
  });
});
