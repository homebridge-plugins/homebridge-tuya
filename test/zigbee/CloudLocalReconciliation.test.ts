import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  reconcileDeviceSources,
  getPreferredSource,
  filterDevicesBySource,
  markDeviceConnected,
  shouldHideFromSource,
  logReconciliationSummary,
  DeviceSourceInfo,
} from '../../src/local/CloudLocalReconciliation';
import TuyaDevice from '../../src/cloud/device/TuyaDevice';
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

function createMockDevice(id: string, uuid: string): TuyaDevice {
  return {
    id,
    uuid,
    name: `Device ${id}`,
  } as TuyaDevice;
}

describe('CloudLocalReconciliation - Phase 4', () => {
  let log: Logger;

  beforeEach(() => {
    log = makeMockLog();
  });

  describe('reconcileDeviceSources', () => {
    it('reconciles cloud-only devices', () => {
      const cloudDevices = [
        createMockDevice('cloud_001', 'uuid_001'),
        createMockDevice('cloud_002', 'uuid_002'),
      ];

      const result = reconcileDeviceSources(cloudDevices, [], log);

      expect(result.size).toBe(2);
      expect(result.get('uuid_001')).toEqual({
        cloud: true,
        local: false,
        connectedTo: 'cloud',
      });
    });

    it('reconciles local-only devices', () => {
      const localDevices = [
        createMockDevice('local_001', 'uuid_101'),
      ];

      const result = reconcileDeviceSources([], localDevices, log);

      expect(result.size).toBe(1);
      expect(result.get('uuid_101')).toEqual({
        cloud: false,
        local: true,
        localIP: undefined,
        localVersion: undefined,
        connectedTo: 'local',
      });
    });

    it('reconciles hybrid devices (same UUID, both sources)', () => {
      const cloudDevices = [createMockDevice('device_a', 'uuid_hybrid')];
      const localDevices = [createMockDevice('device_a', 'uuid_hybrid')];

      const result = reconcileDeviceSources(cloudDevices, localDevices, log);

      expect(result.size).toBe(1);
      const info = result.get('uuid_hybrid');
      expect(info?.cloud).toBe(true);
      expect(info?.local).toBe(true);
      expect(info?.connectedTo).toBe('both');

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('available via cloud AND local'));
    });

    it('handles mixed cloud-only, local-only, and hybrid devices', () => {
      const cloudDevices = [
        createMockDevice('cloud_only', 'uuid_cloud'),
        createMockDevice('hybrid', 'uuid_hybrid'),
      ];
      const localDevices = [
        createMockDevice('local_only', 'uuid_local'),
        createMockDevice('hybrid', 'uuid_hybrid'),
      ];

      const result = reconcileDeviceSources(cloudDevices, localDevices, log);

      expect(result.size).toBe(3);
      expect(result.get('uuid_cloud')?.cloud).toBe(true);
      expect(result.get('uuid_cloud')?.local).toBe(false);
      expect(result.get('uuid_local')?.cloud).toBe(false);
      expect(result.get('uuid_local')?.local).toBe(true);
      expect(result.get('uuid_hybrid')?.cloud).toBe(true);
      expect(result.get('uuid_hybrid')?.local).toBe(true);
    });

    it('logs hybrid device detection', () => {
      const cloudDevices = [createMockDevice('device', 'uuid_123')];
      const localDevices = [createMockDevice('device', 'uuid_123')];

      reconcileDeviceSources(cloudDevices, localDevices, log);

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('available via cloud AND local'));
    });
  });

  describe('getPreferredSource', () => {
    it('prefers local when available', () => {
      const sourceInfo: DeviceSourceInfo = { cloud: true, local: true };
      expect(getPreferredSource(sourceInfo)).toBe('local');
    });

    it('uses cloud when local unavailable', () => {
      const sourceInfo: DeviceSourceInfo = { cloud: true, local: false };
      expect(getPreferredSource(sourceInfo)).toBe('cloud');
    });

    it('always prefers local when both available (ignores default param)', () => {
      const sourceInfo: DeviceSourceInfo = { cloud: true, local: true };
      // The defaultSource param is only used when local is unavailable
      // When both are available, local is always preferred
      expect(getPreferredSource(sourceInfo, 'local')).toBe('local');
      expect(getPreferredSource(sourceInfo, 'cloud')).toBe('local');
    });
  });

  describe('filterDevicesBySource', () => {
    let sourceMap: Map<string, DeviceSourceInfo>;

    beforeEach(() => {
      sourceMap = new Map([
        ['uuid_cloud', { cloud: true, local: false }],
        ['uuid_local', { cloud: false, local: true }],
        ['uuid_hybrid', { cloud: true, local: true }],
      ]);
    });

    it('filters to local-only devices', () => {
      const devices = [
        createMockDevice('cloud', 'uuid_cloud'),
        createMockDevice('local', 'uuid_local'),
        createMockDevice('hybrid', 'uuid_hybrid'),
      ];

      const result = filterDevicesBySource(devices, 'local', sourceMap);

      expect(result.length).toBe(2);
      expect(result.map(d => d.uuid)).toContain('uuid_local');
      expect(result.map(d => d.uuid)).toContain('uuid_hybrid');
      expect(result.map(d => d.uuid)).not.toContain('uuid_cloud');
    });

    it('filters to cloud-only devices', () => {
      const devices = [
        createMockDevice('cloud', 'uuid_cloud'),
        createMockDevice('local', 'uuid_local'),
        createMockDevice('hybrid', 'uuid_hybrid'),
      ];

      const result = filterDevicesBySource(devices, 'cloud', sourceMap);

      expect(result.length).toBe(2);
      expect(result.map(d => d.uuid)).toContain('uuid_cloud');
      expect(result.map(d => d.uuid)).toContain('uuid_hybrid');
      expect(result.map(d => d.uuid)).not.toContain('uuid_local');
    });

    it('returns all devices for both source filter', () => {
      const devices = [
        createMockDevice('cloud', 'uuid_cloud'),
        createMockDevice('local', 'uuid_local'),
        createMockDevice('hybrid', 'uuid_hybrid'),
      ];

      const result = filterDevicesBySource(devices, 'both', sourceMap);

      expect(result.length).toBe(3);
    });

    it('excludes unknown devices from filter', () => {
      const devices = [
        createMockDevice('cloud', 'uuid_cloud'),
        createMockDevice('unknown', 'uuid_unknown'),
      ];

      const result = filterDevicesBySource(devices, 'cloud', sourceMap);

      expect(result.length).toBe(1);
      expect(result[0].uuid).toBe('uuid_cloud');
    });
  });

  describe('markDeviceConnected', () => {
    let sourceMap: Map<string, DeviceSourceInfo>;

    beforeEach(() => {
      sourceMap = new Map([
        ['uuid_001', { cloud: true, local: true, connectedTo: 'cloud' }],
      ]);
    });

    it('updates device connection state to local', () => {
      markDeviceConnected('uuid_001', 'local', sourceMap, log);

      expect(sourceMap.get('uuid_001')?.connectedTo).toBe('both');
    });

    it('warns if marking unknown device as connected', () => {
      markDeviceConnected('uuid_unknown', 'local', sourceMap, log);

      const warnSpy = log.warn as jest.MockedFunction<typeof log.warn>;
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown device'));
    });

    it('warns if marking device connected to unavailable source', () => {
      const sourceInfo: DeviceSourceInfo = {
        cloud: true,
        local: false,
      };
      sourceMap.set('uuid_002', sourceInfo);

      markDeviceConnected('uuid_002', 'local', sourceMap, log);

      const warnSpy = log.warn as jest.MockedFunction<typeof log.warn>;
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not available locally'));
    });
  });

  describe('shouldHideFromSource', () => {
    it('does not hide when source is both', () => {
      const device = createMockDevice('test', 'uuid_test');
      expect(shouldHideFromSource(device, 'cloud', 'both')).toBe(false);
      expect(shouldHideFromSource(device, 'local', 'both')).toBe(false);
    });

    it('hides cloud devices when source is local-only', () => {
      const device = createMockDevice('test', 'uuid_test');
      expect(shouldHideFromSource(device, 'cloud', 'local')).toBe(true);
    });

    it('hides local devices when source is cloud-only', () => {
      const device = createMockDevice('test', 'uuid_test');
      expect(shouldHideFromSource(device, 'local', 'cloud')).toBe(true);
    });

    it('defaults to cloud-only when source undefined', () => {
      const device = createMockDevice('test', 'uuid_test');
      expect(shouldHideFromSource(device, 'local', undefined)).toBe(true);
      expect(shouldHideFromSource(device, 'cloud', undefined)).toBe(false);
    });
  });

  describe('logReconciliationSummary', () => {
    it('logs reconciliation counts', () => {
      const sourceMap = new Map<string, DeviceSourceInfo>([
        ['uuid_1', { cloud: true, local: true }],
        ['uuid_2', { cloud: true, local: false }],
        ['uuid_3', { cloud: false, local: true }],
      ]);

      logReconciliationSummary(sourceMap, log);

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      const call = String(infoSpy.mock.calls[0][0]);
      expect(call).toContain('1 hybrid');
      expect(call).toContain('1 cloud-only');
      expect(call).toContain('1 local-only');
    });
  });
});
