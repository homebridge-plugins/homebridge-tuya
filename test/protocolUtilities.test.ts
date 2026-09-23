/* eslint-disable no-console */
import { describe, expect, test, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import {
  hmac,
  encryptECB,
  decryptECB,
  encryptGCM,
  decryptGCM,
  getCRC32,
  generateSessionKey,
} from '../src/local/protocol/ProtocolUtilities';

describe('ProtocolUtilities', () => {
  describe('HMAC-SHA256', () => {
    test('generates correct HMAC for data', () => {
      const data = Buffer.from('test_data');
      const key = Buffer.from('test_key_16bytes');
      const result = hmac(data, key);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32); // HMAC-SHA256 produces 32 bytes
    });

    test('same input produces same HMAC', () => {
      const data = Buffer.from('test_data');
      const key = Buffer.from('test_key_16bytes');
      const result1 = hmac(data, key);
      const result2 = hmac(data, key);

      expect(result1).toEqual(result2);
    });

    test('different data produces different HMAC', () => {
      const key = Buffer.from('test_key_16bytes');
      const result1 = hmac(Buffer.from('data1'), key);
      const result2 = hmac(Buffer.from('data2'), key);

      expect(result1).not.toEqual(result2);
    });

    test('different keys produce different HMAC', () => {
      const data = Buffer.from('test_data');
      const result1 = hmac(data, Buffer.from('key1_bytes_16byt'));
      const result2 = hmac(data, Buffer.from('key2_bytes_16byt'));

      expect(result1).not.toEqual(result2);
    });

    test('handles empty data', () => {
      const data = Buffer.from('');
      const key = Buffer.from('test_key_16bytes');
      const result = hmac(data, key);

      expect(result.length).toBe(32);
    });

    test('handles large data', () => {
      const data = Buffer.alloc(10000, 'test_data');
      const key = Buffer.from('test_key_16bytes');
      const result = hmac(data, key);

      expect(result.length).toBe(32);
    });
  });

  describe('AES-128-ECB Encryption/Decryption', () => {
    test('encrypts data with 16-byte key', () => {
      const data = Buffer.from('Hello World.....'); // 16 bytes for ECB
      const key = Buffer.from('0123456789abcdef');
      const encrypted = encryptECB(data, key);

      expect(encrypted).toBeInstanceOf(Buffer);
      // AES ECB with PKCS#7 padding: 16 bytes input + 16 bytes padding = 32 bytes output
      expect(encrypted.length).toBe(32);
      expect(encrypted).not.toEqual(data);
    });

    test('decrypts encrypted data', () => {
      const key = Buffer.from('0123456789abcdef');
      const originalData = Buffer.from('Hello World.....'); // 16 bytes for ECB
      const encrypted = encryptECB(originalData, key);
      const decrypted = decryptECB(encrypted, key);

      expect(decrypted).toEqual(originalData);
    });

    test('handles multiple blocks', () => {
      const key = Buffer.from('0123456789abcdef');
      // 32 bytes = 2 blocks of 16 bytes
      const data = Buffer.from('Hello World.....Hello World.....');
      const encrypted = encryptECB(data, key);
      const decrypted = decryptECB(encrypted, key);

      expect(decrypted).toEqual(data);
      // AES ECB with PKCS#7 padding: 32 bytes input + 16 bytes padding = 48 bytes output
      expect(encrypted.length).toBe(48);
    });

    test('different keys produce different ciphertext', () => {
      const data = Buffer.from('Hello World.....'); // 16 bytes
      const key1 = Buffer.from('0123456789abcdef');
      const key2 = Buffer.from('fedcba9876543210');
      const encrypted1 = encryptECB(data, key1);
      const encrypted2 = encryptECB(data, key2);

      expect(encrypted1).not.toEqual(encrypted2);
    });

    test('handles JSON data', () => {
      const key = Buffer.from('test_key_16bytes');
      const jsonStr = '{"id":"dev001","dp":{}}';
      // Pad to multiple of 16
      const padded = Buffer.alloc(Math.ceil(jsonStr.length / 16) * 16);
      padded.write(jsonStr);

      const encrypted = encryptECB(padded, key);
      const decrypted = decryptECB(encrypted, key);

      expect(decrypted.slice(0, jsonStr.length).toString()).toBe(jsonStr);
    });
  });

  describe('AES-128-GCM Encryption/Decryption', () => {
    test('encrypts data with GCM', () => {
      const data = Buffer.from('test data for GCM encryption');
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');

      const { ciphertext, authTag } = encryptGCM(data, key, iv);

      expect(ciphertext).toBeInstanceOf(Buffer);
      expect(authTag).toBeInstanceOf(Buffer);
      expect(authTag.length).toBe(16); // GCM auth tag is 16 bytes
      expect(ciphertext).not.toEqual(data);
    });

    test('decrypts GCM encrypted data', () => {
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');
      const originalData = Buffer.from('test data for GCM encryption');

      const { ciphertext, authTag } = encryptGCM(originalData, key, iv);
      const decrypted = decryptGCM(ciphertext, key, iv, authTag);

      expect(decrypted).toEqual(originalData);
    });

    test('fails to decrypt with wrong auth tag', () => {
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');
      const data = Buffer.from('test data for GCM encryption');

      const { ciphertext, authTag } = encryptGCM(data, key, iv);
      const wrongTag = Buffer.alloc(16, 0xff);

      expect(() => {
        decryptGCM(ciphertext, key, iv, wrongTag);
      }).toThrow();
    });

    test('fails to decrypt with wrong key', () => {
      const key = Buffer.from('0123456789abcdef');
      const wrongKey = Buffer.from('fedcba9876543210');
      const iv = Buffer.from('123456789012');
      const data = Buffer.from('test data for GCM encryption');

      const { ciphertext, authTag } = encryptGCM(data, key, iv);

      expect(() => {
        decryptGCM(ciphertext, wrongKey, iv, authTag);
      }).toThrow();
    });

    test('handles empty data', () => {
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');
      const data = Buffer.from('');

      const { ciphertext, authTag } = encryptGCM(data, key, iv);
      const decrypted = decryptGCM(ciphertext, key, iv, authTag);

      expect(decrypted).toEqual(data);
    });

    test('handles large data', () => {
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');
      const data = Buffer.alloc(10000, 'test data');

      const { ciphertext, authTag } = encryptGCM(data, key, iv);
      const decrypted = decryptGCM(ciphertext, key, iv, authTag);

      expect(decrypted).toEqual(data);
    });
  });

  describe('CRC32 Checksum', () => {
    test('calculates CRC32 for data', () => {
      const data = Buffer.from('test data');
      const crc = getCRC32(data);

      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThanOrEqual(0);
      expect(crc).toBeLessThanOrEqual(0xffffffff);
    });

    test('same data produces same CRC32', () => {
      const data = Buffer.from('test data');
      const crc1 = getCRC32(data);
      const crc2 = getCRC32(data);

      expect(crc1).toBe(crc2);
    });

    test('different data produces different CRC32', () => {
      const crc1 = getCRC32(Buffer.from('data1'));
      const crc2 = getCRC32(Buffer.from('data2'));

      expect(crc1).not.toBe(crc2);
    });

    test('handles empty buffer', () => {
      const data = Buffer.from('');
      const crc = getCRC32(data);

      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThanOrEqual(0);
    });

    test('handles large buffer', () => {
      const data = Buffer.alloc(10000, 'x');
      const crc = getCRC32(data);

      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThanOrEqual(0);
    });

    test('produces consistent results across multiple calls', () => {
      const data = Buffer.from('consistent_test_data');
      const crcs = Array.from({ length: 10 }, () => getCRC32(data));

      const firstCrc = crcs[0];
      expect(crcs.every(c => c === firstCrc)).toBe(true);
    });

    test('produces different results for binary data variations', () => {
      const data1 = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const data2 = Buffer.from([0x00, 0x01, 0x02, 0x04]); // Different last byte

      const crc1 = getCRC32(data1);
      const crc2 = getCRC32(data2);

      expect(crc1).not.toBe(crc2);
    });
  });

  describe('Session Key Generation', () => {
    test('generates 16-byte session key', () => {
      const key = generateSessionKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(16);
    });

    test('generates different keys on each call', () => {
      const keys = Array.from({ length: 10 }, () => generateSessionKey());
      const uniqueKeys = new Set(keys.map(k => k.toString('hex')));

      expect(uniqueKeys.size).toBe(10); // All keys should be unique
    });

    test('generated keys are cryptographically random', () => {
      const key = generateSessionKey();
      const keyHex = key.toString('hex');

      // Check that the key isn't all zeros or all ones (very basic sanity check)
      const isAllZeros = /^0+$/.test(keyHex);
      const isAllOnes = /^1+$/.test(keyHex);

      expect(!isAllZeros && !isAllOnes).toBe(true);
    });

    test('keys are usable for encryption', () => {
      const key = generateSessionKey();
      const data = Buffer.from('test_data_16bytes');

      expect(() => {
        const encrypted = encryptECB(data, key);
        decryptECB(encrypted, key);
      }).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    test('complete encryption flow: HMAC + ECB', () => {
      const key = Buffer.from('0123456789abcdef');
      const data = Buffer.from('Hello World.....'); // 16 bytes

      // Sign with HMAC
      const signature = hmac(data, key);

      // Encrypt with ECB
      const encrypted = encryptECB(data, key);

      // Decrypt
      const decrypted = decryptECB(encrypted, key);

      // Verify signature
      const verifySignature = hmac(decrypted, key);

      expect(decrypted).toEqual(data);
      expect(verifySignature).toEqual(signature);
    });

    test('complete GCM flow with multiple messages', () => {
      const key = Buffer.from('0123456789abcdef');
      const iv = Buffer.from('123456789012');

      const messages = [
        Buffer.from('message1'),
        Buffer.from('message2'),
        Buffer.from('message3'),
      ];

      const encrypted = messages.map(msg => {
        const { ciphertext, authTag } = encryptGCM(msg, key, iv);
        return { ciphertext, authTag };
      });

      const decrypted = encrypted.map(({ ciphertext, authTag }) =>
        decryptGCM(ciphertext, key, iv, authTag)
      );

      expect(decrypted).toEqual(messages);
    });

    test('CRC32 validation in frame', () => {
      // Simulate protocol frame: [header][data][crc32]
      const dataWithoutCrc = Buffer.from('frame_data_test');
      const crc = getCRC32(dataWithoutCrc);

      // Simulate frame
      const frame = Buffer.concat([dataWithoutCrc, Buffer.from(crc.toString(16))]);

      // Verify CRC
      const calculateCrc = getCRC32(dataWithoutCrc);
      expect(calculateCrc).toBe(crc);
    });
  });
});
