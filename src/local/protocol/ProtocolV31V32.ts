/**
 * Tuya Protocol v3.1 / v3.2 handler
 *
 * v3.1: plaintext payload (no encryption)
 * v3.2: AES-128-ECB encrypted payload
 *
 * Frame format (0x55AA, 16-byte header, CRC32 trailer):
 *   prefix  uint32 BE  0x000055AA
 *   seqno   uint32 BE
 *   cmd     uint32 BE
 *   length  uint32 BE  (payload bytes + 4 CRC + 4 suffix)
 *   payload variable
 *   crc     uint32 BE
 *   suffix  uint32 BE  0x0000AA55
 */
import { Protocol } from './Protocol';
import {
  decryptECB, encryptECB,
  packMessage55AA, unpackMessage55AA,
  isFrameComplete, extractFrame,
} from './ProtocolUtilities';

/** Version header bytes prepended to v3.1 plaintext payloads */
const VERSION_HEADER_31 = Buffer.from('3.1' + '\x00'.repeat(12), 'latin1');

export class ProtocolV31V32 implements Protocol {
  private isV31: boolean;

  constructor(version: '3.1' | '3.2' = '3.1') {
    this.isV31 = version === '3.1';
  }

  encodeFrame(cmd: number, data: Buffer, seqNo: number, _sessionKey?: Buffer, deviceKey?: Buffer): Buffer {
    let payload: Buffer;

    if (this.isV31) {
      // v3.1 CONTROL cmd: prefix + MD5 hash + base64-encrypted data
      // For the persistent-socket model used here we just send plaintext JSON
      // (devices accept it; encryption is optional for local LAN control on v3.1)
      payload = data;
    } else {
      // v3.2: AES-128-ECB encrypt
      payload = deviceKey ? encryptECB(data, deviceKey) : data;
      // Prepend 3.x version header (15 bytes) for non-heartbeat payloads
      if (payload.length > 0) {
        const versionHeader = Buffer.from('3.2' + '\x00'.repeat(12), 'latin1');
        payload = Buffer.concat([versionHeader, payload]);
      }
    }

    return packMessage55AA(seqNo, cmd, payload);
  }

  isFrameComplete(buffer: Buffer): boolean {
    return isFrameComplete(buffer);
  }

  extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null {
    return extractFrame(buffer);
  }

  decodeFrame(frame: Buffer, deviceKey: Buffer): { cmd: number; payload: Buffer } | null {
    const msg = unpackMessage55AA(frame, undefined, false);
    if (!msg) return null;
    if (!msg.hmacOk) return null;

    let payload = msg.payload;

    // Strip v3.x version header if present (first 15 bytes: e.g. "3.1\x00…")
    if (payload.length >= 15 && payload[0] === 0x33 /* '3' */) {
      payload = payload.subarray(15);
    }

    // Decrypt v3.2 ECB payload
    if (!this.isV31 && payload.length > 0) {
      try {
        payload = decryptECB(payload, deviceKey);
      } catch {
        return null;
      }
    }

    return { cmd: msg.cmd, payload };
  }
}
