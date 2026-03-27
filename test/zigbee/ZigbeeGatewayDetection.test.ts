import { describe, expect, it } from '@jest/globals';
import { ZigbeeGatewayDetection } from '../../src/local/ZigbeeGatewayDetection';
import { LocalDeviceConfig } from '../../src/local/config';

// Minimal helper to build a LocalDeviceConfig for testing
function device(
  tuyaDeviceId: string,
  overrides: Partial<LocalDeviceConfig> = {},
): LocalDeviceConfig {
  return {
    tuyaDeviceId,
    tuyaKey: 'localkey12345678',
    ...overrides,
  };
}

describe('ZigbeeGatewayDetection', () => {

  // ── detectFromDevices ─────────────────────────────────────────────────────

  describe('detectFromDevices', () => {

    it('returns an empty map when there are no devices', () => {
      expect(ZigbeeGatewayDetection.detectFromDevices([])).toEqual(new Map());
    });

    it('returns an empty map when no device has a parentDeviceId', () => {
      const devices = [device('gw_1'), device('gw_2')];
      expect(ZigbeeGatewayDetection.detectFromDevices(devices).size).toBe(0);
    });

    it('detects a single parent with one child', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' }),
      ];
      const result = ZigbeeGatewayDetection.detectFromDevices(devices);
      expect(result.size).toBe(1);
      const rel = result.get('gw_1');
      expect(rel).toBeDefined();
      expect(rel!.parentId).toBe('gw_1');
      expect(rel!.children).toHaveLength(1);
      expect(rel!.children[0]).toMatchObject({
        deviceId: 'child_1',
        cid: '0011223344556601',
      });
    });

    it('stores CID in lowercase', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: 'AABBCCDDEEFF0011' }),
      ];
      const rel = ZigbeeGatewayDetection.detectFromDevices(devices).get('gw_1');
      expect(rel!.children[0].cid).toBe('aabbccddeeff0011');
    });

    it('detects multiple children under the same gateway', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601', name: 'Light A' }),
        device('child_2', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556602', name: 'Light B' }),
      ];
      const rel = ZigbeeGatewayDetection.detectFromDevices(devices).get('gw_1');
      expect(rel!.children).toHaveLength(2);
    });

    it('detects two separate gateways each with their own children', () => {
      const devices = [
        device('gw_A'),
        device('gw_B'),
        device('c_A1', { parentDeviceId: 'gw_A', zigbeeChildId: '0011223344556601' }),
        device('c_B1', { parentDeviceId: 'gw_B', zigbeeChildId: '0011223344556602' }),
      ];
      const result = ZigbeeGatewayDetection.detectFromDevices(devices);
      expect(result.size).toBe(2);
      expect(result.get('gw_A')!.children[0].deviceId).toBe('c_A1');
      expect(result.get('gw_B')!.children[0].deviceId).toBe('c_B1');
    });

    it('uses the device name field for the child entry name', () => {
      const devices = [
        device('gw_1'),
        device('child_1', {
          parentDeviceId: 'gw_1',
          zigbeeChildId: '0011223344556601',
          name: 'Kitchen Light',
        }),
      ];
      const rel = ZigbeeGatewayDetection.detectFromDevices(devices).get('gw_1');
      expect(rel!.children[0].name).toBe('Kitchen Light');
    });

    it('falls back to tuyaDeviceId as name when name is absent', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' }),
      ];
      const rel = ZigbeeGatewayDetection.detectFromDevices(devices).get('gw_1');
      expect(rel!.children[0].name).toBe('child_1');
    });

  });

  // ── validation errors ─────────────────────────────────────────────────────

  describe('detectFromDevices – validation errors', () => {

    it('throws when parentDeviceId is set without zigbeeChildId', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1' }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('parentDeviceId but is missing zigbeeChildId');
    });

    it('throws when zigbeeChildId is set without parentDeviceId', () => {
      const devices = [device('child_1', { zigbeeChildId: '0011223344556601' })];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('zigbeeChildId but is missing parentDeviceId');
    });

    it('throws for an invalid CID (too short)', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '001122' }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('invalid zigbeeChildId');
    });

    it('throws for an invalid CID (non-hex characters)', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: 'ZZZZZZZZZZZZZZZZ' }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('invalid zigbeeChildId');
    });

    it('throws when the referenced parent device is not in the list', () => {
      const devices = [
        device('child_1', { parentDeviceId: 'missing_gw', zigbeeChildId: '0011223344556601' }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('was not found in the local devices list');
    });

    it('throws when two children under the same gateway share a CID', () => {
      const sharedCid = '0011223344556601';
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: sharedCid }),
        device('child_2', { parentDeviceId: 'gw_1', zigbeeChildId: sharedCid }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('Duplicate Zigbee CID');
    });

    it('throws when a child is itself used as a parent (chaining)', () => {
      const devices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' }),
        device('grand_child', { parentDeviceId: 'child_1', zigbeeChildId: '0011223344556602' }),
      ];
      expect(() => ZigbeeGatewayDetection.detectFromDevices(devices))
        .toThrow('Chained gateways are not supported');
    });

  });

  // ── isChild ───────────────────────────────────────────────────────────────

  describe('isChild', () => {
    it('returns true when parentDeviceId is set', () => {
      const cfg = device('d1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' });
      expect(ZigbeeGatewayDetection.isChild(cfg)).toBe(true);
    });

    it('returns false when parentDeviceId is absent', () => {
      const cfg = device('d1');
      expect(ZigbeeGatewayDetection.isChild(cfg)).toBe(false);
    });

    it('returns false for a standalone device with only tuyaKey', () => {
      const cfg = device('d1', { tuyaKey: 'somekey123456789' });
      expect(ZigbeeGatewayDetection.isChild(cfg)).toBe(false);
    });
  });

  // ── isGateway ─────────────────────────────────────────────────────────────

  describe('isGateway', () => {
    it('returns true when isZigbeeGateway is explicitly set', () => {
      const allDevices = [device('gw_1', { isZigbeeGateway: true })];
      expect(ZigbeeGatewayDetection.isGateway(allDevices[0], allDevices)).toBe(true);
    });

    it('returns true when another device references this one as parent', () => {
      const allDevices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' }),
      ];
      expect(ZigbeeGatewayDetection.isGateway(allDevices[0], allDevices)).toBe(true);
    });

    it('returns false for a standalone device with no children', () => {
      const allDevices = [device('standalone_1'), device('standalone_2')];
      expect(ZigbeeGatewayDetection.isGateway(allDevices[0], allDevices)).toBe(false);
    });

    it('returns false for a child device that has no children of its own', () => {
      const allDevices = [
        device('gw_1'),
        device('child_1', { parentDeviceId: 'gw_1', zigbeeChildId: '0011223344556601' }),
      ];
      expect(ZigbeeGatewayDetection.isGateway(allDevices[1], allDevices)).toBe(false);
    });
  });

});
