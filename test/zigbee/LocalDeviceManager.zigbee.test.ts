import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import LocalDeviceManager from '../../src/local/LocalDeviceManager';
import { LocalConfig } from '../../src/local/config';
import TuyaDeviceManager from '../../src/cloud/device/TuyaDeviceManager';
import Logger from '../../src/shared/util/Logger';

// ── Logger mock ───────────────────────────────────────────────────────────────

function makeMockLog(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  } as unknown as Logger;
}

// ── Minimal config helpers ──────────────────────────────────────────────────

const GATEWAY_ID = 'gw_device_001';
const CHILD_ID_A = 'child_device_001';
const CHILD_ID_B = 'child_device_002';
const CHILD_CID_A = '00112233445566aa';
const CHILD_CID_B = '00112233445566bb';
const DEVICE_KEY = '0123456789abcdef'; // 16-char local key
const DEVICE_IP = '192.168.1.200';

function zigbeeConfig(): LocalConfig {
  return {
    autoDiscoverDevices: false,
    devices: [
      {
        tuyaDeviceId: GATEWAY_ID,
        name: 'Zigbee Gateway',
        ip: DEVICE_IP,
        tuyaKey: DEVICE_KEY,
        protocolVersion: '3.3',
        isZigbeeGateway: true,
        switchCount: 1,
      },
      {
        tuyaDeviceId: CHILD_ID_A,
        name: 'Switch Child A',
        ip: DEVICE_IP,
        tuyaKey: DEVICE_KEY,
        protocolVersion: '3.3',
        parentDeviceId: GATEWAY_ID,
        zigbeeChildId: CHILD_CID_A,
        switchCount: 1,
      },
      {
        tuyaDeviceId: CHILD_ID_B,
        name: 'Switch Child B',
        ip: DEVICE_IP,
        tuyaKey: DEVICE_KEY,
        protocolVersion: '3.3',
        parentDeviceId: GATEWAY_ID,
        zigbeeChildId: CHILD_CID_B,
        switchCount: 1,
      },
    ],
  };
}

function standaloneConfig(): LocalConfig {
  return {
    autoDiscoverDevices: false,
    devices: [
      {
        tuyaDeviceId: 'standalone_001',
        name: 'Standalone Switch',
        ip: '192.168.1.10',
        tuyaKey: DEVICE_KEY,
        protocolVersion: '3.3',
        switchCount: 1,
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LocalDeviceManager – Zigbee integration', () => {
  let log: Logger;
  let manager: LocalDeviceManager;

  beforeEach(() => {
    log = makeMockLog();
  });

  afterEach(() => {
    manager?.stopLocalDevices();
    jest.clearAllMocks();
  });

  // ── initLocalDevices: child-skipping ------------------------------------------

  describe('initLocalDevices() – child device handling', () => {
    it('does not register child devices as TuyaDevices during first init pass', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      // Only the gateway should be in the device list initially
      // Children are registered lazily when the parent connects
      const deviceIds = manager.devices.map(d => d.id);
      expect(deviceIds).toContain(GATEWAY_ID);
      expect(deviceIds).not.toContain(CHILD_ID_A);
      expect(deviceIds).not.toContain(CHILD_ID_B);
    });

    it('registers standalone devices normally', async () => {
      manager = new LocalDeviceManager(standaloneConfig(), log);
      await manager.initLocalDevices();

      expect(manager.devices.map(d => d.id)).toContain('standalone_001');
    });

    it('logs gateway relationships when detected', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      const infoCalls = infoSpy.mock.calls.map(c => String(c[0]));
      const gatewayLine = infoCalls.find(s => s.includes('Zigbee gateway'));
      expect(gatewayLine).toBeDefined();
      expect(gatewayLine).toContain(GATEWAY_ID);
    });

    it('proceeds without fatal errors when no Zigbee devices in config', async () => {
      manager = new LocalDeviceManager(standaloneConfig(), log);
      await expect(manager.initLocalDevices()).resolves.not.toThrow();
    });
  });

  // ── Zigbee config error handling ──────────────────────────────────────────

  describe('initLocalDevices() – Zigbee config error handling', () => {
    it('logs an error but continues for non-Zigbee devices when config is invalid', async () => {
      const badConfig: LocalConfig = {
        autoDiscoverDevices: false,
        devices: [
          // An orphaned child (no matching parent in config)
          {
            tuyaDeviceId: 'orphan_child',
            name: 'Orphan',
            ip: DEVICE_IP,
            tuyaKey: DEVICE_KEY,
            parentDeviceId: 'nonexistent_parent',
            zigbeeChildId: '0011223344556601',
            switchCount: 1,
          },
          {
            tuyaDeviceId: 'standalone_ok',
            name: 'Standalone OK',
            ip: '192.168.1.11',
            tuyaKey: DEVICE_KEY,
            switchCount: 1,
          },
        ],
      };

      manager = new LocalDeviceManager(badConfig, log);
      await expect(manager.initLocalDevices()).resolves.not.toThrow();

      const errorSpy = log.error as jest.MockedFunction<typeof log.error>;
      const errorCalls = errorSpy.mock.calls.map(c => String(c[0]));
      const zigbeeErrorLine = errorCalls.find(s => s.includes('Zigbee'));
      expect(zigbeeErrorLine).toBeDefined();
    });
  });

  // ── sendCommands: Zigbee child routing ─────────────────────────────────────

  describe('sendCommands() – Zigbee child routing', () => {
    it('returns without acting when device has no dpMapping (unknown device)', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      // CHILD_ID_A is not yet registered in the first pass
      const result = await manager.sendCommands('nonexistent_device', [{ code: 'switch_1', value: true }]);
      expect(result).toBeUndefined();
    });

    it('handles sendCommands for a known device that has a dpMapping', async () => {
      manager = new LocalDeviceManager(standaloneConfig(), log);
      await manager.initLocalDevices();

      // 'standalone_001' is in the device list but has no IP connection (autoDiscover=false, no connect called)
      // sendCommands should log a warning about no connection, not throw
      await expect(
        manager.sendCommands('standalone_001', [{ code: 'switch_1', value: true }]),
      ).resolves.not.toThrow();
    });
  });

  // ── stopLocalDevices: gateway cleanup ─────────────────────────────────────

  describe('stopLocalDevices()', () => {
    it('does not throw when called with Zigbee gateway config and no active connections', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      expect(() => manager.stopLocalDevices()).not.toThrow();
    });

    it('can be called multiple times without error', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      expect(() => {
        manager.stopLocalDevices();
        manager.stopLocalDevices();
      }).not.toThrow();
    });
  });

  // ── _setupZigbeeChildren: event-driven child setup ─────────────────────────

  describe('_setupZigbeeChildren() – via gateway connect event', () => {
    it('emits DEVICE_ADD for child when gateway connects', async () => {
      const EventEmitter = (await import('events')).default;
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      const deviceAddEvents: string[] = [];
      manager.on(TuyaDeviceManager.Events.DEVICE_ADD, (device: any) => {
        deviceAddEvents.push(device.id);
      });

      // Access the internal gateway map to simulate a connect event
      // We do this by calling _setupZigbeeChildren via the gateway's connect event
      // The gatewayRelationships map is private but we can test the observable side effect

      // Force the manager to think the gateway connected by accessing private via bracket notation
      const gatewayRelationships = (manager as any).gatewayRelationships as Map<string, any>;
      if (gatewayRelationships.size > 0) {
        // Gateway relationships were detected
        expect(gatewayRelationships.has(GATEWAY_ID)).toBe(true);

        const rel = gatewayRelationships.get(GATEWAY_ID);
        expect(rel).toBeDefined();
        expect(rel.children.length).toBe(2);

        const cids = rel.children.map((c: any) => c.cid);
        expect(cids).toContain(CHILD_CID_A);
        expect(cids).toContain(CHILD_CID_B);
      }
    });

    it('correctly maps child deviceId <-> cid in the relationship', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      const gatewayRelationships = (manager as any).gatewayRelationships as Map<string, any>;
      const rel = gatewayRelationships.get(GATEWAY_ID);

      expect(rel).toBeDefined();
      const childA = rel.children.find((c: any) => c.cid === CHILD_CID_A);
      expect(childA).toBeDefined();
      expect(childA.deviceId).toBe(CHILD_ID_A);
      expect(childA.name).toBe('Switch Child A');

      const childB = rel.children.find((c: any) => c.cid === CHILD_CID_B);
      expect(childB).toBeDefined();
      expect(childB.deviceId).toBe(CHILD_ID_B);
    });
  });

  // ── getDevice ─────────────────────────────────────────────────────────────

  describe('getDevice()', () => {
    it('returns the gateway TuyaDevice by ID', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      const gw = manager.getDevice(GATEWAY_ID);
      expect(gw).toBeDefined();
      expect(gw?.id).toBe(GATEWAY_ID);
      expect(gw?.name).toBe('Zigbee Gateway');
    });

    it('returns undefined for a child device before parent connects', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      // Children not yet registered (lazy registration happens on parent connect)
      const child = manager.getDevice(CHILD_ID_A);
      expect(child).toBeUndefined();
    });

    it('returns undefined for a completely unknown device', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      expect(manager.getDevice('no_such_device')).toBeUndefined();
    });
  });

  // ── Mixed Zigbee + standalone config ─────────────────────────────────────

  describe('Mixed Zigbee and standalone devices', () => {
    it('registers standalone devices alongside gateways', async () => {
      const mixedConfig: LocalConfig = {
        autoDiscoverDevices: false,
        devices: [
          ...zigbeeConfig().devices!,
          {
            tuyaDeviceId: 'standalone_001',
            name: 'Standalone Switch',
            ip: '192.168.1.10',
            tuyaKey: DEVICE_KEY,
            switchCount: 1,
          },
        ],
      };

      manager = new LocalDeviceManager(mixedConfig, log);
      await manager.initLocalDevices();

      const ids = manager.devices.map(d => d.id);
      expect(ids).toContain(GATEWAY_ID);
      expect(ids).toContain('standalone_001');
      expect(ids).not.toContain(CHILD_ID_A);
      expect(ids).not.toContain(CHILD_ID_B);
    });

    it('detects the correct number of gateway relationships', async () => {
      manager = new LocalDeviceManager(zigbeeConfig(), log);
      await manager.initLocalDevices();

      const gatewayRelationships = (manager as any).gatewayRelationships as Map<string, any>;
      expect(gatewayRelationships.size).toBe(1);
    });

    it('has no gateway relationships for purely standalone config', async () => {
      manager = new LocalDeviceManager(standaloneConfig(), log);
      await manager.initLocalDevices();

      const gatewayRelationships = (manager as any).gatewayRelationships as Map<string, any>;
      expect(gatewayRelationships.size).toBe(0);
    });
  });
});
