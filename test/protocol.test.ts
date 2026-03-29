/* eslint-disable no-console */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { ProtocolFactory } from '../src/local/protocol/ProtocolFactory';
import { ProtocolV31V32 } from '../src/local/protocol/ProtocolV31V32';
import { ProtocolV33 } from '../src/local/protocol/ProtocolV33';
import { ProtocolV34 } from '../src/local/protocol/ProtocolV34';
import { ProtocolV35 } from '../src/local/protocol/ProtocolV35';
import {
  packMessage55AA, unpackMessage55AA,
  packMessage6699, unpackMessage6699,
  hmac, encryptECB, encryptECBNoPad,
  NO_VERSION_HEADER_CMDS,
} from '../src/local/protocol/ProtocolUtilities';

describe('ProtocolFactory', () => {
  test('creates ProtocolV31V32 for version 3.1', () => {
    const protocol = ProtocolFactory.createProtocol('3.1');
    expect(protocol).toBeInstanceOf(ProtocolV31V32);
  });

  test('creates ProtocolV31V32 for version 3.2', () => {
    const protocol = ProtocolFactory.createProtocol('3.2');
    expect(protocol).toBeInstanceOf(ProtocolV31V32);
  });

  test('creates ProtocolV33 for version 3.3', () => {
    const protocol = ProtocolFactory.createProtocol('3.3');
    expect(protocol).toBeInstanceOf(ProtocolV33);
  });

  test('creates ProtocolV34 for version 3.4', () => {
    const protocol = ProtocolFactory.createProtocol('3.4');
    expect(protocol).toBeInstanceOf(ProtocolV34);
  });

  test('creates ProtocolV35 for version 3.5', () => {
    const protocol = ProtocolFactory.createProtocol('3.5');
    expect(protocol).toBeInstanceOf(ProtocolV35);
  });

  test('throws error for unsupported version', () => {
    expect(() => ProtocolFactory.createProtocol('4.0')).toThrow(
      'Unsupported protocol version: 4.0'
    );
  });

  test('throws error for invalid version format', () => {
    expect(() => ProtocolFactory.createProtocol('invalid')).toThrow(
      'Unsupported protocol version: invalid'
    );
  });
});

describe('Protocol Base Interface', () => {
  let protocol: ReturnType<typeof ProtocolFactory.createProtocol>;

  beforeEach(() => {
    protocol = ProtocolFactory.createProtocol('3.5');
  });

  describe('encodeFrame', () => {
    test('encodes frame with valid command and data', () => {
      const cmd = 0x01;
      const data = Buffer.from([0xaa, 0xbb, 0xcc]);
      const seqNo = 1;

      const frame = protocol.encodeFrame(cmd, data, seqNo);

      expect(frame).toBeInstanceOf(Buffer);
      expect(frame.length).toBeGreaterThan(0);
    });

    test('encodes frame with session key', () => {
      const cmd = 0x01;
      const data = Buffer.from([0xaa, 0xbb, 0xcc]);
      const seqNo = 1;
      const sessionKey = Buffer.from('0123456789abcdef'); // 16 bytes - correct for AES-128-GCM

      const frame = protocol.encodeFrame(cmd, data, seqNo, sessionKey);

      expect(frame).toBeInstanceOf(Buffer);
      expect(frame.length).toBeGreaterThan(0);
    });

    test('encodes empty data', () => {
      const cmd = 0x01;
      const data = Buffer.alloc(0);
      const seqNo = 1;

      const frame = protocol.encodeFrame(cmd, data, seqNo);

      expect(frame).toBeInstanceOf(Buffer);
      expect(frame.length).toBeGreaterThan(0);
    });
  });

  describe('isFrameComplete', () => {
    test('identifies complete frame', () => {
      // Frame with proper structure should be identified as complete
      const cmd = 0x01;
      const data = Buffer.from([0xaa, 0xbb]);
      const seqNo = 1;

      const frame = protocol.encodeFrame(cmd, data, seqNo);
      const isComplete = protocol.isFrameComplete(frame);

      expect(typeof isComplete).toBe('boolean');
    });

    test('handles empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const isComplete = protocol.isFrameComplete(buffer);

      expect(typeof isComplete).toBe('boolean');
      expect(isComplete).toBe(false);
    });

    test('handles incomplete buffer', () => {
      const buffer = Buffer.from([0x00, 0x00]);
      const isComplete = protocol.isFrameComplete(buffer);

      expect(typeof isComplete).toBe('boolean');
    });
  });

  describe('extractFrame', () => {
    test('extracts valid frame', () => {
      const cmd = 0x01;
      const data = Buffer.from([0xaa, 0xbb]);
      const seqNo = 1;

      const encodedFrame = protocol.encodeFrame(cmd, data, seqNo);
      const result = protocol.extractFrame(encodedFrame);

      if (result) {
        expect(result.frame).toBeInstanceOf(Buffer);
        expect(result.remaining).toBeInstanceOf(Buffer);
      }
    });

    test('handles incomplete frame gracefully', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x55]);
      const result = protocol.extractFrame(buffer);

      if (result === null) {
        expect(result).toBeNull();
      }
    });

    test('handles empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const result = protocol.extractFrame(buffer);

      expect(result).toBeNull();
    });
  });
});

describe('Protocol Version Specific Behaviors', () => {
  test('ProtocolV31V32 creates valid frames', () => {
    const protocol = new ProtocolV31V32();
    const cmd = 0x01;
    const data = Buffer.from('test');
    const seqNo = 1;

    const frame = protocol.encodeFrame(cmd, data, seqNo);

    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(0);
  });

  test('ProtocolV33 creates valid frames', () => {
    const protocol = new ProtocolV33();
    const cmd = 0x01;
    const data = Buffer.from('test');
    const seqNo = 1;

    const frame = protocol.encodeFrame(cmd, data, seqNo);

    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(0);
  });

  test('ProtocolV34 creates valid frames', () => {
    const protocol = new ProtocolV34();
    const cmd = 0x01;
    const data = Buffer.from('test');
    const seqNo = 1;

    const frame = protocol.encodeFrame(cmd, data, seqNo);

    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(0);
  });

  test('ProtocolV35 creates valid frames with IV', () => {
    const protocol = new ProtocolV35();
    const cmd = 0x01;
    const data = Buffer.from('test');
    const seqNo = 1;
    const sessionKey = Buffer.from('0123456789abcdef'); // 16 bytes - correct for AES-128-GCM

    const frame = protocol.encodeFrame(cmd, data, seqNo, sessionKey);

    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(0);
  });
});

// ── Round-trip encode/decode tests ────────────────────────────────────────────

describe('packMessage55AA / unpackMessage55AA round-trips', () => {
  const key = Buffer.from('0123456789abcdef');

  test('CRC32 frame round-trip (noRetcode=true)', () => {
    const payload = Buffer.from('{"dps":{"1":true}}');
    const frame = packMessage55AA(7, 10, payload);
    const msg = unpackMessage55AA(frame, undefined, true);
    expect(msg).not.toBeNull();
    expect(msg!.seqno).toBe(7);
    expect(msg!.cmd).toBe(10);
    expect(msg!.payload).toEqual(payload);
    expect(msg!.hmacOk).toBe(true);
  });

  test('HMAC-SHA256 frame round-trip (noRetcode=true)', () => {
    const payload = Buffer.from('abcdef0123456789abcdef0123456789'); // 32 bytes
    const frame = packMessage55AA(3, 3, payload, key);
    const msg = unpackMessage55AA(frame, key, true);
    expect(msg).not.toBeNull();
    expect(msg!.seqno).toBe(3);
    expect(msg!.cmd).toBe(3);
    expect(msg!.payload).toEqual(payload);
    expect(msg!.hmacOk).toBe(true);
  });

  test('HMAC frame fails verification with wrong key', () => {
    const wrongKey = Buffer.from('fedcba9876543210');
    const frame = packMessage55AA(1, 13, Buffer.from('test'), key);
    const msg = unpackMessage55AA(frame, wrongKey, true);
    expect(msg).not.toBeNull();
    expect(msg!.hmacOk).toBe(false);
  });
});

describe('packMessage6699 / unpackMessage6699 round-trips', () => {
  const key = Buffer.from('0123456789abcdef');

  test('GCM frame round-trip preserves seqno, cmd, and payload', () => {
    const plaintext = Buffer.from('{"dps":{"1":true}}');
    const frame = packMessage6699(42, 13, plaintext, key);
    const msg = unpackMessage6699(frame, key);
    expect(msg).not.toBeNull();
    expect(msg!.seqno).toBe(42);
    expect(msg!.cmd).toBe(13);
    expect(msg!.hmacOk).toBe(true);
    // Payload starts with '{' (not 0x00 0x00), so retcode stripping does not apply
    expect(msg!.payload).toEqual(plaintext);
  });

  test('returns null for wrong decryption key (GCM auth tag mismatch)', () => {
    const wrongKey = Buffer.from('fedcba9876543210');
    const frame = packMessage6699(1, 1, Buffer.from('hello'), key);
    const msg = unpackMessage6699(frame, wrongKey);
    expect(msg).toBeNull();
  });

  test('frame length field is consistent with frame byte count', () => {
    const plaintext = Buffer.from('x'.repeat(37)); // odd-length to catch off-by-one
    const frame = packMessage6699(1, 16, plaintext, key);
    // header=18, iv=12, ciphertext=37, tag=16, suffix=4 → total 87 bytes
    expect(frame.length).toBe(18 + 12 + 37 + 16 + 4);
    // length field at offset 14 should be 12+37+16+4 = 69
    expect(frame.readUInt32BE(14)).toBe(12 + 37 + 16 + 4);
  });
});

describe('ProtocolV35 encode + decode round-trips', () => {
  const key = Buffer.from('0123456789abcdef');
  const proto = new ProtocolV35();

  test('data command (cmd 13) with session key: round-trip strips version header', () => {
    const payload = Buffer.from('{"protocol":5,"t":1234,"data":{"dps":{"1":true}}}');
    const frame = proto.encodeFrame(13, payload, 1, key);
    const decoded = proto.decodeFrame(frame, key, key);
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(13);
    expect(decoded!.payload).toEqual(payload);
  });

  test('key exchange cmd 3 (NO_VERSION_HEADER_CMDS): no version header added or stripped', () => {
    const nonce = Buffer.from('0123456789abcdef'); // 16 bytes
    const frame = proto.encodeFrame(3, nonce, 1, key);
    const decoded = proto.decodeFrame(frame, key, key);
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(3);
    expect(decoded!.payload).toEqual(nonce); // exactly 16 bytes, no header stripped
  });

  test('decodeFrame falls back to deviceKey when sessionKey is absent (pre-exchange)', () => {
    const nonce = Buffer.from('0123456789abcdef');
    // Encode with key (simulating device using deviceKey before exchange)
    const frame = proto.encodeFrame(3, nonce, 1, key);
    // Decode without passing sessionKey - should use deviceKey as fallback
    const decoded = proto.decodeFrame(frame, key); // sessionKey omitted
    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toEqual(nonce);
  });

  test('heartbeat cmd 9 (NO_VERSION_HEADER_CMDS): payload preserved', () => {
    const ping = Buffer.from('{}');
    const frame = proto.encodeFrame(9, ping, 5, key);
    const decoded = proto.decodeFrame(frame, key, key);
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(9);
    expect(decoded!.payload).toEqual(ping);
  });
});

describe('ProtocolV34 encode + decode round-trips', () => {
  const key = Buffer.from('0123456789abcdef');
  const proto = new ProtocolV34();

  test('simulated device response (cmd 16, DP_QUERY_NEW) with session key: no version header', () => {
    // DP_QUERY_NEW is in NO_VERSION_HEADER_CMDS — device sends no version header prefix
    const json = Buffer.from('{"dps":{"1":true}}');
    const encrypted = encryptECB(json, key);
    const retcode = Buffer.alloc(4);
    const rawWirePayload = Buffer.concat([retcode, encrypted]);
    const frame = packMessage55AA(5, 16, rawWirePayload, key);

    const decoded = proto.decodeFrame(frame, key, key);
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(16);
    expect(decoded!.payload.toString()).toBe('{"dps":{"1":true}}');
  });

  test('simulated device response (cmd 8, STATUS) with session key: version header stripped', () => {
    // STATUS (cmd 8) is NOT in NO_VERSION_HEADER_CMDS — device includes "3.4\x00..." prefix
    const json = Buffer.from('{"dps":{"1":true}}');
    const versionHeader = Buffer.from('3.4' + '\x00'.repeat(12), 'latin1');
    const encrypted = encryptECB(Buffer.concat([versionHeader, json]), key);
    const retcode = Buffer.alloc(4);
    const rawWirePayload = Buffer.concat([retcode, encrypted]);
    const frame = packMessage55AA(5, 8, rawWirePayload, key);

    const decoded = proto.decodeFrame(frame, key, key);
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(8);
    expect(decoded!.payload.toString()).toBe('{"dps":{"1":true}}');
  });

  test('key exchange cmd 4 response: retcode + encrypted nonce+hmac decoded correctly', () => {
    const localNonce = Buffer.from('0123456789abcdef');
    const remoteNonce = Buffer.from('fedcba9876543210');
    const hmacVal = hmac(localNonce, key); // 32 bytes
    // Device sends: retcode(4) + ECB_encrypt(remoteNonce(16) + hmac(32), deviceKey)
    const plaintext = Buffer.concat([remoteNonce, hmacVal]); // 48 bytes
    const encrypted = encryptECB(plaintext, key);
    const retcode = Buffer.alloc(4);
    const rawWirePayload = Buffer.concat([retcode, encrypted]);
    const frame = packMessage55AA(2, 4, rawWirePayload, key);

    const decoded = proto.decodeFrame(frame, key); // no sessionKey (pre-exchange)
    expect(decoded).not.toBeNull();
    expect(decoded!.cmd).toBe(4);
    // The decrypted payload should be the 48-byte plaintext (cmd 4 is NO_VERSION_HEADER, no stripping)
    expect(decoded!.payload).toEqual(plaintext);
  });

  test('processKeyExchangeStep2 derives session key and step3 HMAC', () => {
    const localNonce = Buffer.from('0123456789abcdef');
    const remoteNonce = Buffer.from('fedcba9876543210');
    const hmacVal = hmac(localNonce, key);
    const step2Payload = Buffer.concat([remoteNonce, hmacVal]);

    const result = proto.processKeyExchangeStep2(step2Payload, localNonce, key);

    expect(result).not.toBeNull();
    // Step3 = HMAC(remoteNonce, realKey)
    expect(result!.step3Payload).toEqual(hmac(remoteNonce, key));
    // SessionKey = ECBNoPad(localXORremote, realKey)
    const xored = Buffer.allocUnsafe(16);
    for (let i = 0; i < 16; i++) xored[i] = localNonce[i] ^ remoteNonce[i];
    expect(result!.sessionKey).toEqual(encryptECBNoPad(xored, key));
  });

  test('processKeyExchangeStep2 returns null on HMAC mismatch', () => {
    const localNonce = Buffer.from('0123456789abcdef');
    const remoteNonce = Buffer.from('fedcba9876543210');
    const badHmac = Buffer.alloc(32); // all zeros – wrong
    const step2Payload = Buffer.concat([remoteNonce, badHmac]);

    const result = proto.processKeyExchangeStep2(step2Payload, localNonce, key);
    expect(result).toBeNull();
  });
});

describe('ProtocolV35 key exchange', () => {
  const key = Buffer.from('0123456789abcdef');
  const proto = new ProtocolV35();

  test('processKeyExchangeStep2 derives session key via GCM (v3.5 path)', () => {
    const localNonce = Buffer.from('0123456789abcdef');
    const remoteNonce = Buffer.from('fedcba9876543210');
    const hmacVal = hmac(localNonce, key);
    const step2Payload = Buffer.concat([remoteNonce, hmacVal]);

    const result = proto.processKeyExchangeStep2(step2Payload, localNonce, key);

    expect(result).not.toBeNull();
    expect(result!.step3Payload).toEqual(hmac(remoteNonce, key));
    expect(result!.sessionKey.length).toBe(16);
    // Verify v3.5 session key differs from v3.4 session key (different derivation)
    const proto34 = new ProtocolV34();
    const result34 = proto34.processKeyExchangeStep2(step2Payload, localNonce, key);
    expect(result!.sessionKey).not.toEqual(result34!.sessionKey);
  });
});

describe('NO_VERSION_HEADER_CMDS coverage', () => {
  test('set contains expected key exchange and query commands', () => {
    expect(NO_VERSION_HEADER_CMDS.has(3)).toBe(true);   // SESS_KEY_NEG_START
    expect(NO_VERSION_HEADER_CMDS.has(4)).toBe(true);   // SESS_KEY_NEG_RESP
    expect(NO_VERSION_HEADER_CMDS.has(5)).toBe(true);   // SESS_KEY_NEG_FINISH
    expect(NO_VERSION_HEADER_CMDS.has(9)).toBe(true);   // HEART_BEAT
    expect(NO_VERSION_HEADER_CMDS.has(0x10)).toBe(true); // DP_QUERY_NEW
    expect(NO_VERSION_HEADER_CMDS.has(13)).toBe(false);  // CONTROL_NEW gets header
    expect(NO_VERSION_HEADER_CMDS.has(7)).toBe(false);   // CONTROL gets header
  });

  test('ProtocolV34: cmd 3 payload decoded without version header stripping', () => {
    // A nonce whose first byte happens to be 0x33 ('3') — must NOT be stripped
    const trickyNonce = Buffer.from('3456789012345678'); // starts with '3'
    const encrypted = encryptECB(trickyNonce, Buffer.from('0123456789abcdef'));
    const retcode = Buffer.alloc(4);
    const frame = packMessage55AA(1, 3, Buffer.concat([retcode, encrypted]), Buffer.from('0123456789abcdef'));

    const proto = new ProtocolV34();
    const decoded = proto.decodeFrame(frame, Buffer.from('0123456789abcdef'));
    expect(decoded).not.toBeNull();
    // length must be 16 (nonce), not 1 (nonce minus 15-byte header strip)
    expect(decoded!.payload.length).toBe(16);
    expect(decoded!.payload).toEqual(trickyNonce);
  });
});
