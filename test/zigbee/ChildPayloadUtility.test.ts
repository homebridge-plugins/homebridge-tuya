import { describe, expect, it } from '@jest/globals';
import { ChildPayloadUtility } from '../../src/local/protocol/ChildPayloadUtility';

describe('ChildPayloadUtility', () => {

  // ── isValidCid ─────────────────────────────────────────────────────────────

  describe('isValidCid', () => {
    it('accepts a valid lowercase 16-hex-char CID', () => {
      expect(ChildPayloadUtility.isValidCid('0011223344556601')).toBe(true);
    });

    it('accepts a valid uppercase 16-hex-char CID', () => {
      expect(ChildPayloadUtility.isValidCid('AABBCCDDEEFF0011')).toBe(true);
    });

    it('accepts a mixed-case 16-hex-char CID', () => {
      expect(ChildPayloadUtility.isValidCid('0011aAbBcCdDeEfF')).toBe(true);
    });

    it('rejects a CID that is too short', () => {
      expect(ChildPayloadUtility.isValidCid('001122334455660')).toBe(false);
    });

    it('rejects a CID that is too long', () => {
      expect(ChildPayloadUtility.isValidCid('00112233445566011')).toBe(false);
    });

    it('rejects a CID containing non-hex characters', () => {
      expect(ChildPayloadUtility.isValidCid('0011223344556GHI')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(ChildPayloadUtility.isValidCid('')).toBe(false);
    });
  });

  // ── prepareChildPayload ────────────────────────────────────────────────────

  describe('prepareChildPayload', () => {
    const cid = '0011223344556601';
    const dps = { '1': true, '2': 100 };

    it('v3.3: returns { cid, dps } envelope', () => {
      const result = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.3');
      expect(result).toEqual({ cid, dps });
    });

    it('v3.4: returns { protocol:5, data:{ cid, dps } } envelope', () => {
      const result = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.4');
      expect(result).toEqual({ protocol: 5, data: { cid, dps } });
    });

    it('v3.5: returns { protocol:5, data:{ cid, dps } } envelope', () => {
      const result = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.5');
      expect(result).toEqual({ protocol: 5, data: { cid, dps } });
    });

    it('v3.3: preserves empty dps object', () => {
      const result = ChildPayloadUtility.prepareChildPayload(cid, {}, '3.3');
      expect(result).toEqual({ cid, dps: {} });
    });

    it('v3.4: preserves complex dps values', () => {
      const complexDps = { '1': true, '24': 'colour', '25': '0064010200006464000000' };
      const result = ChildPayloadUtility.prepareChildPayload(cid, complexDps, '3.4');
      expect((result as any).data.dps).toEqual(complexDps);
    });

    it('throws on an invalid CID', () => {
      expect(() => ChildPayloadUtility.prepareChildPayload('invalid', dps, '3.3'))
        .toThrow('Invalid Zigbee CID');
    });

    it('throws on a CID that is too short', () => {
      expect(() => ChildPayloadUtility.prepareChildPayload('0011223344', dps, '3.3'))
        .toThrow('Invalid Zigbee CID');
    });
  });

  // ── prepareChildQueryPayload ───────────────────────────────────────────────

  describe('prepareChildQueryPayload', () => {
    const cid = '0011223344556601';

    it('v3.3: returns { cid, dps:{} }', () => {
      const result = ChildPayloadUtility.prepareChildQueryPayload(cid, '3.3');
      expect(result).toEqual({ cid, dps: {} });
    });

    it('v3.4: returns { protocol:5, data:{ cid, dps:{} } }', () => {
      const result = ChildPayloadUtility.prepareChildQueryPayload(cid, '3.4');
      expect(result).toEqual({ protocol: 5, data: { cid, dps: {} } });
    });

    it('v3.5: returns { protocol:5, data:{ cid, dps:{} } }', () => {
      const result = ChildPayloadUtility.prepareChildQueryPayload(cid, '3.5');
      expect(result).toEqual({ protocol: 5, data: { cid, dps: {} } });
    });

    it('throws on an invalid CID', () => {
      expect(() => ChildPayloadUtility.prepareChildQueryPayload('bad!', '3.3'))
        .toThrow('Invalid Zigbee CID');
    });
  });

  // ── extractChildData ────────────────────────────────────────────────────────

  describe('extractChildData', () => {
    it('v3.3: extracts cid + dps from { gwId, cid, dps }', () => {
      const payload = {
        gwId: 'parent_gw',
        cid: '0011223344556601',
        dps: { '1': true },
      };
      const result = ChildPayloadUtility.extractChildData(payload);
      expect(result).toEqual({
        childId: '0011223344556601',
        dps: { '1': true },
      });
    });

    it('v3.3: extracts when gwId is absent (minimal format)', () => {
      const payload = { cid: '0011223344556601', dps: { '2': 50 } };
      const result = ChildPayloadUtility.extractChildData(payload);
      expect(result).toEqual({ childId: '0011223344556601', dps: { '2': 50 } });
    });

    it('v3.4: extracts from { protocol:5, data:{ cid, dps } }', () => {
      const payload = {
        protocol: 5,
        data: { cid: '0011223344556601', dps: { '1': false } },
      };
      expect(ChildPayloadUtility.extractChildData(payload)).toEqual({
        childId: '0011223344556601',
        dps: { '1': false },
      });
    });

    it('v3.5: extracts from { protocol:5, data:{ cid, dps } }', () => {
      const payload = {
        protocol: 5,
        data: { cid: 'aabbccddeeff0011', dps: { '24': 'colour' } },
      };
      expect(ChildPayloadUtility.extractChildData(payload)).toEqual({
        childId: 'aabbccddeeff0011',
        dps: { '24': 'colour' },
      });
    });

    it('returns null for a bare { dps } payload (regular device update)', () => {
      const payload = { devId: 'parent_id', dps: { '1': true } };
      expect(ChildPayloadUtility.extractChildData(payload)).toBeNull();
    });

    it('returns null for a non-child v3.4+ update { protocol:5, data:{ devId, dps } }', () => {
      // No cid field in data
      const payload = {
        protocol: 5,
        data: { devId: 'some_device', dps: { '1': true } },
      };
      expect(ChildPayloadUtility.extractChildData(payload)).toBeNull();
    });

    it('returns null for an empty payload', () => {
      expect(ChildPayloadUtility.extractChildData({})).toBeNull();
    });

    it('ignores protocol:4 envelope (not child routing)', () => {
      const payload = { protocol: 4, data: { cid: '0011223344556601', dps: {} } };
      expect(ChildPayloadUtility.extractChildData(payload)).toBeNull();
    });
  });

  // ── round-trip: prepare then extract ──────────────────────────────────────

  describe('round-trip consistency', () => {
    const cid = 'aabbccddeeff0011';
    const dps = { '1': true, '2': 255 };

    it('v3.3 prepare → extract yields same cid and dps', () => {
      const prepared = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.3');
      const extracted = ChildPayloadUtility.extractChildData(prepared);
      expect(extracted).toEqual({ childId: cid, dps });
    });

    it('v3.4 prepare → extract yields same cid and dps', () => {
      const prepared = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.4');
      const extracted = ChildPayloadUtility.extractChildData(prepared);
      expect(extracted).toEqual({ childId: cid, dps });
    });

    it('v3.5 prepare → extract yields same cid and dps', () => {
      const prepared = ChildPayloadUtility.prepareChildPayload(cid, dps, '3.5');
      const extracted = ChildPayloadUtility.extractChildData(prepared);
      expect(extracted).toEqual({ childId: cid, dps });
    });
  });
});
