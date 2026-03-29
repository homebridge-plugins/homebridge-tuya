/**
 * Tuya Protocol v3.3 handler
 *
 * AES-128-ECB encrypted payload with a 15-byte version header ("3.3\x00…").
 * Checksum is CRC32 (not HMAC) – v3.4+ switches to HMAC.
 *
 * Frame format: standard 0x55AA 16-byte header, CRC32 trailer.
 */
import { Protocol } from './Protocol';
import {
  decryptECB, encryptECB,
  packMessage55AA, unpackMessage55AA,
  isFrameComplete, extractFrame,
  NO_VERSION_HEADER_CMDS,
} from './ProtocolUtilities';

/** 15-byte header prepended to v3.3 encrypted payloads */
const VERSION_HEADER_33 = Buffer.from('3.3' + '\x00'.repeat(12), 'latin1');

export class ProtocolV33 implements Protocol {
  encodeFrame(cmd: number, data: Buffer, seqNo: number, _sessionKey?: Buffer, deviceKey?: Buffer): Buffer {
    let payload = data;

    if (deviceKey) {
      payload = encryptECB(data, deviceKey);
    }

    // Prepend version header for commands that need it
    if (!NO_VERSION_HEADER_CMDS.has(cmd) && payload.length > 0) {
      payload = Buffer.concat([VERSION_HEADER_33, payload]);
    }

    // v3.3 uses CRC32 (no hmacKey)
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

    // Strip version header ("3.3\x00…", 15 bytes)
    if (payload.length >= 15 && payload[0] === 0x33 /* '3' */) {
      payload = payload.subarray(15);
    }

    if (payload.length === 0) {
      // Heartbeat or empty ACK — return as-is
      return { cmd: msg.cmd, payload };
    }

    // Decrypt ECB
    try {
      payload = decryptECB(payload, deviceKey);
    } catch {
      return null;
    }

    return { cmd: msg.cmd, payload };
  }
}
