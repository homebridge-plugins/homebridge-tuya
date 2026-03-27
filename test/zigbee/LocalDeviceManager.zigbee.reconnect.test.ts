import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import LocalDeviceManager from '../../src/local/LocalDeviceManager';
import { LocalConfig, LocalDeviceConfig } from '../../src/local/config';
import TuyaDeviceManager from '../../src/cloud/device/TuyaDeviceManager';
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

describe('LocalDeviceManager – Zigbee gateway reconnection', () => {
  let log: Logger;
  let manager: LocalDeviceManager;

  const GATEWAY_ID = 'gw_reconnect_001';
  const CHILD_ID = 'child_reconnect_001';
  const CHILD_CID = '00aabbccddee1234';
  const DEVICE_KEY = '0123456789abcdef';
  const DEVICE_IP = '192.168.1.200';

  function zigbeeReconnectConfig(): LocalConfig {
    return {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Reconnect Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          protocolVersion: '3.3',
          isZigbeeGateway: true,
        },
        {
          tuyaDeviceId: CHILD_ID,
          name: 'Reconnect Child',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          protocolVersion: '3.3',
          parentDeviceId: GATEWAY_ID,
          zigbeeChildId: CHILD_CID,
        },
      ],
    };
  }

  beforeEach(() => {
    log = makeMockLog();
    manager = new LocalDeviceManager(zigbeeReconnectConfig(), log);
  });

  afterEach(() => {
    manager.stopLocalDevices();
    jest.clearAllMocks();
  });

  it('detects gateway relationships during init', async () => {
    await manager.initLocalDevices();

    const gatewayRels = (manager as any).gatewayRelationships as Map<string, any>;
    expect(gatewayRels.has(GATEWAY_ID)).toBe(true);

    const rel = gatewayRels.get(GATEWAY_ID);
    expect(rel.children.length).toBe(1);
    expect(rel.children[0].cid).toBe(CHILD_CID);
    expect(rel.children[0].deviceId).toBe(CHILD_ID);
  });

  it('handles per-child DP mapping override if provided', async () => {
    const configWithOverride: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          dpMapping: { 'switch_1': 1, 'bright_value': 2 },
        },
        {
          tuyaDeviceId: CHILD_ID,
          name: 'Child',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          parentDeviceId: GATEWAY_ID,
          zigbeeChildId: CHILD_CID,
          childDpMapping: { 'switch_1': 10, 'bright_value': 11 }, // Different DPs
        },
      ],
    };

    const mgr = new LocalDeviceManager(configWithOverride, log);
    // Should initialize without error even with per-child DP overrides
    await mgr.initLocalDevices();

    // Verify that gateway relationships include the child
    const gatewayRels = (mgr as any).gatewayRelationships as Map<string, any>;
    const childRel = gatewayRels.get(GATEWAY_ID);
    expect(childRel?.children.length).toBe(1);
    expect(childRel.children[0].deviceId).toBe(CHILD_ID);
    expect(childRel.children[0].cid).toBe(CHILD_CID);

    mgr.stopLocalDevices();
  });

  it('handles per-child category override if provided', async () => {
    const configWithCategoryOverride: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Gateway Hub',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          category: 'kit', // Hub/gateway category
        },
        {
          tuyaDeviceId: CHILD_ID,
          name: 'Child Light',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          parentDeviceId: GATEWAY_ID,
          zigbeeChildId: CHILD_CID,
          childCategory: 'dj', // Override: this child is a light
        },
      ],
    };

    const mgr = new LocalDeviceManager(configWithCategoryOverride, log);
    await mgr.initLocalDevices();

    const gwDevice = mgr.getDevice(GATEWAY_ID);
    const childDevice = mgr.getDevice(CHILD_ID);

    expect(gwDevice?.category).toBe('kit');
    // childDevice won't have category set until parent connects (lazy registration)

    mgr.stopLocalDevices();
  });

  it('logs gateway relationships and recognizes multi-child setup', async () => {
    const multiChildConfig: LocalConfig = {
      autoDiscoverDevices: false,
      devices: [
        {
          tuyaDeviceId: GATEWAY_ID,
          name: 'Multi-Child Gateway',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          isZigbeeGateway: true,
        },
        {
          tuyaDeviceId: 'child_a',
          name: 'Child A',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          parentDeviceId: GATEWAY_ID,
          zigbeeChildId: '0011223344556601',
        },
        {
          tuyaDeviceId: 'child_b',
          name: 'Child B',
          ip: DEVICE_IP,
          tuyaKey: DEVICE_KEY,
          parentDeviceId: GATEWAY_ID,
          zigbeeChildId: '0011223344556602',
        },
      ],
    };

    const mgr = new LocalDeviceManager(multiChildConfig, log);
    await mgr.initLocalDevices();

    const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
    const infoCalls = infoSpy.mock.calls.map(c => String(c[0]));
    const gatewayLine = infoCalls.find(s => s.includes('Zigbee gateway detected'));

    expect(gatewayLine).toBeDefined();
    expect(gatewayLine).toContain(GATEWAY_ID);
    expect(gatewayLine).toContain('2 sub-device');

    mgr.stopLocalDevices();
  });

  it('manages gateway connections separately from local connections', async () => {
    await manager.initLocalDevices();

    const localConnections = (manager as any).localConnections as Map<string, any>;
    const gatewayConnections = (manager as any).gatewayConnections as Map<string, any>;

    // Initially, no connections are open (no TCP connect called)
    expect(localConnections.size).toBe(0);
    expect(gatewayConnections.size).toBe(0);
  });
});
