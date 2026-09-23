import { describe, expect, it } from '@jest/globals';
import {
  discoverFromCloudList,
  parseSubDeviceListResponse,
  getOnlineCids,
  buildDiscoveredChildConfig,
  isValidDiscoveredCid,
  supportsChildDiscovery,
  logDiscoveryResults,
} from '../../src/local/DynamicChildDiscovery';
import { LocalDeviceConfig } from '../../src/local/config';
import Logger from '../../src/shared/util/Logger';
import { jest } from '@jest/globals';

describe('DynamicChildDiscovery', () => {
  describe('discoverFromCloudList', () => {
    it('discovers parent-child relationships from cloud device list', () => {
      const cloudDevices = [
        { id: 'gateway_001', gateway_id: undefined },
        { id: 'child_001', gateway_id: 'gateway_001' },
        { id: 'child_002', gateway_id: 'gateway_001' },
        { id: 'device_standalone', gateway_id: undefined },
      ];

      const result = discoverFromCloudList(cloudDevices);

      expect(result.size).toBe(1);
      expect(result.get('gateway_001')).toEqual(['child_001', 'child_002']);
      expect(result.has('device_standalone')).toBe(false);
    });

    it('ignores devices with same gateway_id as their own id', () => {
      const cloudDevices = [{ id: 'device_001', gateway_id: 'device_001' }];

      const result = discoverFromCloudList(cloudDevices);

      expect(result.size).toBe(0);
    });

    it('handles multiple gateways', () => {
      const cloudDevices = [
        { id: 'gw_001' },
        { id: 'child_001', gateway_id: 'gw_001' },
        { id: 'gw_002' },
        { id: 'child_002', gateway_id: 'gw_002' },
      ];

      const result = discoverFromCloudList(cloudDevices);

      expect(result.size).toBe(2);
      expect(result.get('gw_001')).toEqual(['child_001']);
      expect(result.get('gw_002')).toEqual(['child_002']);
    });

    it('returns empty map for no cloud devices', () => {
      const result = discoverFromCloudList([]);
      expect(result.size).toBe(0);
    });
  });

  describe('parseSubDeviceListResponse', () => {
    it('parses nested data.subdevList format', () => {
      const response = {
        data: {
          subdevList: [
            { cid: '00112233445566aa', online: 1, productName: 'Light' },
            { cid: '00112233445566bb', online: 1, productName: 'Switch' },
          ],
        },
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].cid).toBe('00112233445566aa');
      expect(result[1].cid).toBe('00112233445566bb');
    });

    it('parses flat subdevList format', () => {
      const response = {
        subdevList: [{ cid: '00aabbccddeeff00', online: 1 }],
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].cid).toBe('00aabbccddeeff00');
    });

    it('parses flat deviceList format', () => {
      const response = {
        deviceList: [
          { cid: 'aabbccddee112233', online: 0 },
          { cid: 'aabbccddee112234', online: 1 },
        ],
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toHaveLength(2);
    });

    it('parses DPS format with CID keys', () => {
      const response = {
        dps: {
          '00112233445566aa': { online: 1, productName: 'Light' },
          '00112233445566bb': { online: 0, productName: 'Switch' },
          '1': { value: 100 }, // Non-CID DPs ignored
        },
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].cid).toBe('00112233445566aa');
      expect(result[1].cid).toBe('00112233445566bb');
    });

    it('merges multiple list formats if present', () => {
      const response = {
        subdevList: [{ cid: 'aaaa0000aaaa0001', online: 1 }],
        data: {
          subdevs: [{ cid: 'aaaa0000aaaa0002', online: 1 }],
        },
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.cid)).toContain('aaaa0000aaaa0001');
      expect(result.map(r => r.cid)).toContain('aaaa0000aaaa0002');
    });

    it('returns empty array for null/undefined response', () => {
      expect(parseSubDeviceListResponse(null)).toEqual([]);
      expect(parseSubDeviceListResponse(undefined)).toEqual([]);
      expect(parseSubDeviceListResponse({})).toEqual([]);
    });

    it('handles malformed subdevList gracefully', () => {
      const response = {
        data: {
          subdevList: 'not an array', // Invalid format
        },
      };

      const result = parseSubDeviceListResponse(response);

      expect(result).toEqual([]);
    });
  });

  describe('getOnlineCids', () => {
    it('filters online sub-devices (online === 1)', () => {
      const subdevs = [
        { cid: '00112233445566aa', online: 1 as const },
        { cid: '00112233445566bb', online: 0 as const },
        { cid: '00112233445566cc', online: 1 as const },
      ];

      const result = getOnlineCids(subdevs);

      expect(result).toEqual(['00112233445566aa', '00112233445566cc']);
    });

    it('treats missing online field as online (undefined counts as online)', () => {
      const subdevs = [
        { cid: '00112233445566aa' }, // No online field
        { cid: '00112233445566bb', online: 1 as const },
      ];

      const result = getOnlineCids(subdevs);

      expect(result).toEqual(['00112233445566aa', '00112233445566bb']);
    });

    it('ignores sub-devices without CID', () => {
      const subdevs = [
        { cid: '00112233445566aa', online: 1 as const },
        { id: 'device_002', online: 1 as const } as any, // No CID
        { cid: undefined, online: 1 as const } as any,
      ];

      const result = getOnlineCids(subdevs);

      expect(result).toEqual(['00112233445566aa']);
    });

    it('returns empty array for offline-only devices', () => {
      const subdevs = [
        { cid: '00112233445566aa', online: 0 as const },
        { cid: '00112233445566bb', online: 0 as const },
      ];

      const result = getOnlineCids(subdevs);

      expect(result).toEqual([]);
    });
  });

  describe('buildDiscoveredChildConfig', () => {
    it('builds child config from gateway and CID', () => {
      const config = buildDiscoveredChildConfig('gateway_001', '00112233445566aa', undefined, '192.168.1.100', 'key123');

      expect(config.parentDeviceId).toBe('gateway_001');
      expect(config.zigbeeChildId).toBe('00112233445566aa');
      expect(config.tuyaDeviceId).toBe('gateway_001_00112233445566aa');
      expect(config.ip).toBe('192.168.1.100');
      expect(config.tuyaKey).toBe('key123');
    });

    it('uses subdevInfo.id if provided', () => {
      const subdevInfo = { id: 'custom_child_id', cid: '00112233445566aa' };
      const config = buildDiscoveredChildConfig('gw_001', '00112233445566aa', subdevInfo, '192.168.1.1', 'key');

      expect(config.tuyaDeviceId).toBe('custom_child_id');
    });

    it('includes productName in device name if available', () => {
      const subdevInfo = { id: 'light_001', productName: 'Smart Light', cid: '00112233445566aa' };
      const config = buildDiscoveredChildConfig('gw_001', '00112233445566aa', subdevInfo);

      expect(config.name).toContain('Smart Light');
      expect(config.name).toContain('00112233445566aa');
    });

    it('includes category from subdevInfo', () => {
      const subdevInfo = { id: 'child_001', category: 'dj', cid: '00112233445566aa' };
      const config = buildDiscoveredChildConfig('gw_001', '00112233445566aa', subdevInfo);

      expect(config.category).toBe('dj');
    });

    it('generates fallback name if no productName', () => {
      const config = buildDiscoveredChildConfig('gw_001', '00112233445566aa');

      expect(config.name).toContain('Child');
      expect(config.name).toContain('00112233445566aa');
    });
  });

  describe('isValidDiscoveredCid', () => {
    it('accepts valid 16-character lowercase hex CIDs', () => {
      expect(isValidDiscoveredCid('00112233445566aa')).toBe(true);
      expect(isValidDiscoveredCid('aabbccddee112233')).toBe(true);
      expect(isValidDiscoveredCid('0000000000000000')).toBe(true);
      expect(isValidDiscoveredCid('ffffffffffffffff')).toBe(true);
    });

    it('rejects uppercase hex', () => {
      expect(isValidDiscoveredCid('00112233445566AA')).toBe(false);
      expect(isValidDiscoveredCid('AABBCCDDEE112233')).toBe(false);
    });

    it('rejects mixed case', () => {
      expect(isValidDiscoveredCid('00112233445566Aa')).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(isValidDiscoveredCid('00112233445566')).toBe(false); // Too short
      expect(isValidDiscoveredCid('00112233445566aa00')).toBe(false); // Too long
    });

    it('rejects non-hex characters', () => {
      expect(isValidDiscoveredCid('00112233445566xx')).toBe(false);
      expect(isValidDiscoveredCid('00112233445566gg')).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(isValidDiscoveredCid(1234567890123456 as any)).toBe(false);
      expect(isValidDiscoveredCid(null as any)).toBe(false);
      expect(isValidDiscoveredCid(undefined as any)).toBe(false);
    });
  });

  describe('supportsChildDiscovery', () => {
    it('returns true for explicit isZigbeeGateway: true', () => {
      const config: LocalDeviceConfig = {
        tuyaDeviceId: 'gw_001',
        isZigbeeGateway: true,
      };

      expect(supportsChildDiscovery(config)).toBe(true);
    });

    it('returns false for explicit isZigbeeGateway: false', () => {
      const config: LocalDeviceConfig = {
        tuyaDeviceId: 'device_001',
        isZigbeeGateway: false,
      };

      expect(supportsChildDiscovery(config)).toBe(false);
    });

    it('returns true when isZigbeeGateway is undefined (assumes it might be gateway)', () => {
      const config: LocalDeviceConfig = {
        tuyaDeviceId: 'device_001',
      };

      expect(supportsChildDiscovery(config)).toBe(true);
    });
  });

  describe('logDiscoveryResults', () => {
    it('logs debug message for no discoveries', () => {
      const mockLog = { debug: jest.fn() } as unknown as Logger;

      logDiscoveryResults('gw_001', [], mockLog);

      expect((mockLog.debug as jest.Mock).mock.calls[0][0]).toContain('no sub-devices discovered');
    });

    it('logs info message with discovered CID count', () => {
      const mockLog = { info: jest.fn() } as unknown as Logger;

      logDiscoveryResults('gw_001', ['00112233445566aa', '00112233445566bb'], mockLog);

      const call = (mockLog.info as jest.Mock).mock.calls[0][0];
      expect(call).toContain('gw_001');
      expect(call).toContain('2 sub-device');
    });

    it('logs CID list in discovery message', () => {
      const mockLog = { info: jest.fn() } as unknown as Logger;

      logDiscoveryResults('gw_001', ['aaaa0000aaaa0001', 'bbbb0000bbbb0001'], mockLog);

      const call = (mockLog.info as jest.Mock).mock.calls[0][0];
      expect(call).toContain('aaaa0000aaaa0001');
      expect(call).toContain('bbbb0000bbbb0001');
    });
  });
});
