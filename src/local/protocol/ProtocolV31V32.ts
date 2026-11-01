/**
 * Tuya Protocol v3.1 / v3.2 handler
 *
 * v3.1: CONTROL (cmd 7) payloads and device status pushes use the envelope
 *       "3.1" + md5hex[8:24] + base64(AES-128-ECB(json)), where
 *       md5 = MD5("data=" + base64 + "||lpv=3.1||" + localKey).
 *       Other commands (queries, heartbeats) are plaintext.
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
import { createHash } from 'crypto';
import { Protocol } from './Protocol';
import {
  decryptECB, encryptECB,
  packMessage55AA, unpackMessage55AA,
  isFrameComplete, extractFrame,
} from './ProtocolUtilities';

const VERSION_31 = Buffer.from('3.1', 'latin1');
/** Length of the v3.1 envelope prefix: "3.1" + 16 hex chars of MD5 */
const V31_PREFIX_LENGTH = 3 + 16;
const CMD_CONTROL = 7;

export class ProtocolV31V32 implements Protocol {
  private isV31: boolean;

  constructor(version: '3.1' | '3.2' = '3.1') {
    this.isV31 = version === '3.1';
  }

  encodeFrame(cmd: number, data: Buffer, seqNo: number, _sessionKey?: Buffer, deviceKey?: Buffer): Buffer {
    let payload: Buffer;

    if (this.isV31) {
      // v3.1 devices ignore plaintext CONTROL frames; they must be encrypted and signed.
      payload = (cmd === CMD_CONTROL && deviceKey && data.length > 0)
        ? this.encryptV31(data, deviceKey)
        : data;
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
    // v3.1 devices only sometimes prefix a 4-byte return code (e.g. not on "3.1…"
    // status pushes or plaintext JSON), so detect it instead of always stripping.
    const msg = unpackMessage55AA(frame, undefined, this.isV31);
    if (!msg) {
      return null;
    }
    if (!msg.hmacOk) {
      return null;
    }

    let payload = msg.payload;

    if (this.isV31) {
      if (payload.length >= 4 && (payload.readUInt32BE(0) & 0xFFFFFF00) === 0) {
        payload = payload.subarray(4);
      }
      // Encrypted v3.1 envelope (status pushes / control echoes)
      if (payload.length > V31_PREFIX_LENGTH && payload.subarray(0, 3).equals(VERSION_31)) {
        try {
          const b64 = payload.subarray(V31_PREFIX_LENGTH).toString('latin1');
          payload = decryptECB(Buffer.from(b64, 'base64'), deviceKey);
        } catch {
          return null;
        }
      }
      return { cmd: msg.cmd, payload };
    }

    // Strip v3.x version header if present (first 15 bytes: e.g. "3.2\x00…")
    if (payload.length >= 15 && payload[0] === 0x33 /* '3' */) {
      payload = payload.subarray(15);
    }

    // Decrypt v3.2 ECB payload
    if (payload.length > 0) {
      try {
        payload = decryptECB(payload, deviceKey);
      } catch {
        return null;
      }
    }

    return { cmd: msg.cmd, payload };
  }

  /** Build the v3.1 encrypted envelope: "3.1" + md5hex[8:24] + base64(AES-ECB(data)) */
  private encryptV31(data: Buffer, deviceKey: Buffer): Buffer {
    const b64 = encryptECB(data, deviceKey).toString('base64');
    const signature = createHash('md5')
      .update(Buffer.concat([Buffer.from(`data=${b64}||lpv=3.1||`, 'latin1'), deviceKey]))
      .digest('hex')
      .substring(8, 24);
    return Buffer.from(`3.1${signature}${b64}`, 'latin1');
  }
}
