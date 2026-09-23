import { describe, expect, test } from '@jest/globals';

/**
 * Wire-format tests for the v3.5 (0x6699) frame layout.
 *
 * The golden vectors below were produced by TinyTuya (message_helper.pack_message
 * with prefix 0x6699), the reference implementation these frames follow.  They are
 * reproducible with:
 *
 *   from tinytuya.core import header as H
 *   from tinytuya.core.message_helper import TuyaMessage, pack_message
 *   msg = TuyaMessage(seq, cmd, None, payload, 0, True, H.PREFIX_6699_VALUE, b'0123456789ab')
 *   pack_message(msg, hmac_key=key).hex()
 *
 * The IV is pinned to '0123456789ab' so the bytes are deterministic.  At runtime the
 * IV is random; it travels inside the frame, so any unique value is wire-compatible.
 */

// Pin the 12-byte GCM nonce only while `pinnedIv` is set, so the golden vectors can
// be compared byte for byte while every other use of randomBytes stays real.
let pinnedIv: Buffer | null = null;

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomBytes: (size: number): Buffer =>
      (size === 12 && pinnedIv ? Buffer.from(pinnedIv) : actual.randomBytes(size)),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  packMessage6699,
  unpackMessage6699,
  isFrameComplete,
  extractFrame,
  HEADER_SIZE_6699,
  PREFIX_6699,
  SUFFIX_6699,
} = require('../src/local/protocol/ProtocolUtilities');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProtocolV35 } = require('../src/local/protocol/ProtocolV35');

const DEVICE_KEY = Buffer.from('0123456789abcdef', 'latin1');
const SESSION_KEY = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const FIXED_IV = Buffer.from('0123456789ab', 'latin1');
const NONCE = Buffer.from('aabbccddeeff00112233445566778899', 'hex');

const GOLDEN = {
  keyExchangeStart:
    '00006699000000000001000000030000002c303132333435363738396162c8f9c126c09f2d98213033b1'
    + 'e2ad2b6a4ea62b6ce07e9a059e670d5dca806da600009966',
  dpQueryNew:
    '00006699000000000003000000100000003a303132333435363738396162790702f77ca154ac87f222ad'
    + 'ba96e03e078b5fa743be4093905c8d4673cd0055f1c00304a7f59f502fb819f58afa00009966',
  heartbeat:
    '00006699000000000005000000090000001c3031323334353637383961628f7981ee45e7bc696425ac42'
    + '39b34ee000009966',
};

function withFixedIv<T>(fn: () => T): T {
  pinnedIv = FIXED_IV;
  try {
    return fn();
  } finally {
    pinnedIv = null;
  }
}

describe('v3.5 0x6699 frame format', () => {
  describe('length field', () => {
    test('counts IV + ciphertext + tag, excluding the 4-byte suffix', () => {
      const plaintext = Buffer.from('{"dps":{"1":true}}');
      const frame = packMessage6699(1, 13, plaintext, SESSION_KEY);

      const declared = frame.readUInt32BE(14);
      expect(declared).toBe(12 + plaintext.length + 16);
      // whole frame = header + declared length + suffix
      expect(frame.length).toBe(HEADER_SIZE_6699 + declared + 4);
      expect(frame.readUInt32BE(0)).toBe(PREFIX_6699);
      expect(frame.readUInt32BE(frame.length - 4)).toBe(SUFFIX_6699);
    });

    test('round-trips through unpackMessage6699', () => {
      // A device→client frame carries a 4-byte retcode ahead of the payload.
      const body = Buffer.from('{"dps":{"1":true,"2":250}}');
      const withRetcode = Buffer.concat([Buffer.alloc(4), body]);
      const frame = packMessage6699(7, 16, withRetcode, SESSION_KEY);

      const msg = unpackMessage6699(frame, SESSION_KEY);
      expect(msg).not.toBeNull();
      expect(msg.seqno).toBe(7);
      expect(msg.cmd).toBe(16);
      expect(msg.hmacOk).toBe(true);
      expect(msg.payload.toString()).toBe(body.toString());
    });

    test('returns null when the frame is truncated', () => {
      const frame = packMessage6699(1, 9, Buffer.alloc(4), SESSION_KEY);
      expect(unpackMessage6699(frame.subarray(0, frame.length - 1), SESSION_KEY)).toBeNull();
    });

    test('returns null when the auth tag does not verify', () => {
      const frame = packMessage6699(1, 16, Buffer.alloc(8), SESSION_KEY);
      const tampered = Buffer.from(frame);
      tampered[HEADER_SIZE_6699 + 12] ^= 0xff; // flip a ciphertext bit
      expect(unpackMessage6699(tampered, SESSION_KEY)).toBeNull();
    });
  });

  describe('frame boundaries', () => {
    test('isFrameComplete requires the suffix as well', () => {
      const frame = packMessage6699(1, 16, Buffer.alloc(16), SESSION_KEY);
      expect(isFrameComplete(frame)).toBe(true);
      expect(isFrameComplete(frame.subarray(0, frame.length - 1))).toBe(false);
    });

    test('extractFrame consumes the whole frame, leaving nothing behind', () => {
      const frame = packMessage6699(2, 16, Buffer.alloc(16), SESSION_KEY);
      const extracted = extractFrame(frame);

      expect(extracted).not.toBeNull();
      expect(extracted.frame.length).toBe(frame.length);
      // A short read here leaves suffix bytes in the buffer and desyncs every
      // following frame in the stream.
      expect(extracted.remaining.length).toBe(0);
    });

    test('extractFrame splits two concatenated frames cleanly', () => {
      const first = packMessage6699(1, 16, Buffer.alloc(8), SESSION_KEY);
      const second = packMessage6699(2, 9, Buffer.alloc(4), SESSION_KEY);
      const stream = Buffer.concat([first, second]);

      const a = extractFrame(stream);
      expect(a.frame).toEqual(first);
      const b = extractFrame(a.remaining);
      expect(b.frame).toEqual(second);
      expect(b.remaining.length).toBe(0);
    });
  });

  describe('GCM nonce', () => {
    test('differs between two frames with identical content', () => {
      const plaintext = Buffer.from('same');
      const a = packMessage6699(1, 16, plaintext, SESSION_KEY);
      const b = packMessage6699(1, 16, plaintext, SESSION_KEY);

      const ivA = a.subarray(HEADER_SIZE_6699, HEADER_SIZE_6699 + 12);
      const ivB = b.subarray(HEADER_SIZE_6699, HEADER_SIZE_6699 + 12);
      expect(ivA.equals(ivB)).toBe(false);
    });
  });

  describe('matches TinyTuya byte for byte', () => {
    test('SESS_KEY_NEG_START (cmd 3) keyed with the device key', () => {
      const frame = withFixedIv(() => new ProtocolV35().encodeFrame(3, NONCE, 1, undefined, DEVICE_KEY));
      expect(frame.toString('hex')).toBe(GOLDEN.keyExchangeStart);
    });

    test('DP_QUERY_NEW (cmd 16) keyed with the session key', () => {
      const payload = Buffer.from('{"gwId":"test","devId":"test"}');
      const frame = withFixedIv(() => new ProtocolV35().encodeFrame(16, payload, 3, SESSION_KEY, DEVICE_KEY));
      expect(frame.toString('hex')).toBe(GOLDEN.dpQueryNew);
    });

    test('HEART_BEAT (cmd 9)', () => {
      const frame = withFixedIv(() => new ProtocolV35().encodeFrame(9, Buffer.alloc(0), 5, SESSION_KEY, DEVICE_KEY));
      expect(frame.toString('hex')).toBe(GOLDEN.heartbeat);
    });

    test('decodes a TinyTuya-produced frame', () => {
      // The other direction: a frame generated by TinyTuya must be readable here,
      // including the length field that excludes the suffix.
      const frame = Buffer.from(GOLDEN.dpQueryNew, 'hex');
      expect(isFrameComplete(frame)).toBe(true);

      const msg = unpackMessage6699(frame, SESSION_KEY);
      expect(msg).not.toBeNull();
      expect(msg.cmd).toBe(16);
      expect(msg.hmacOk).toBe(true);
    });
  });

  describe('key exchange', () => {
    test('uses the 0x6699 format before a session key exists', () => {
      const frame = new ProtocolV35().encodeFrame(3, NONCE, 1, undefined, DEVICE_KEY);
      // A 0x55AA frame here is dropped by the device without any reply.
      expect(frame.readUInt32BE(0)).toBe(PREFIX_6699);
      expect(unpackMessage6699(frame, DEVICE_KEY)).not.toBeNull();
    });

    test('throws when no device key is available', () => {
      expect(() => new ProtocolV35().encodeFrame(3, NONCE, 1, undefined, undefined)).toThrow();
    });

    test('does not prepend the version header to key-exchange commands', () => {
      const frame = new ProtocolV35().encodeFrame(3, NONCE, 1, undefined, DEVICE_KEY);
      const msg = unpackMessage6699(frame, DEVICE_KEY);
      // unpack strips the 4-byte retcode, so compare against the nonce minus those bytes
      expect(msg.payload).toEqual(NONCE.subarray(4));
    });
  });
});
