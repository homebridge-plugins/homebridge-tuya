/**
 * Tuya Protocol v3.5 handler
 *
 * Uses the 0x6699 frame format (completely different from 0x55AA used by v3.1–v3.4).
 * All payloads are AES-128-GCM encrypted; the frame header bytes [4:18] serve as AAD.
 *
 * 0x6699 frame layout:
 *   prefix  uint32 BE  0x00006699
 *   unknown uint16 BE  0x0000
 *   seqno   uint32 BE
 *   cmd     uint32 BE
 *   length  uint32 BE  (IV(12) + ciphertext + GCM-tag(16) + suffix(4))
 *   iv      12 bytes
 *   ciphertext variable
 *   tag     16 bytes
 *   suffix  uint32 BE  0x00009966
 *
 * Session key negotiation is identical to v3.4 EXCEPT the finalize step:
 *   sessionKey = AES-GCM-encrypt(localNonce XOR remoteNonce, realKey, iv=localNonce[:12])[12:28]
 */
import { Protocol } from './Protocol';
import {
  hmac, encryptGCM,
  packMessage6699, packMessage55AA, unpackMessage6699,
  isFrameComplete, extractFrame,
  NO_VERSION_HEADER_CMDS,
} from './ProtocolUtilities';

/** 15-byte version header prepended to v3.5 payloads before GCM encryption */
const VERSION_HEADER_35 = Buffer.from('3.5' + '\x00'.repeat(12), 'latin1');

export class ProtocolV35 implements Protocol {
  encodeFrame(cmd: number, data: Buffer, seqNo: number, sessionKey?: Buffer, _deviceKey?: Buffer): Buffer {
    if (!sessionKey) {
      // During key exchange (before session key exists), send as 0x55AA plain
      return packMessage55AA(seqNo, cmd, data);
    }

    let plaintext = data;
    if (!NO_VERSION_HEADER_CMDS.has(cmd)) {
      plaintext = Buffer.concat([VERSION_HEADER_35, plaintext]);
    }

    return packMessage6699(seqNo, cmd, plaintext, sessionKey);
  }

  isFrameComplete(buffer: Buffer): boolean {
    return isFrameComplete(buffer);
  }

  extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null {
    return extractFrame(buffer);
  }

  decodeFrame(frame: Buffer, deviceKey: Buffer, sessionKey?: Buffer): { cmd: number; payload: Buffer } | null {
    // Use deviceKey as fallback during key exchange (before session key is established)
    const key = sessionKey ?? deviceKey;
    const msg = unpackMessage6699(frame, key);
    if (!msg) return null;

    let payload = msg.payload;

    // Only strip version header for commands that include it.
    // Key exchange cmds (3,4,5) and heartbeats are in NO_VERSION_HEADER_CMDS.
    if (!NO_VERSION_HEADER_CMDS.has(msg.cmd) && payload.length >= 15 && payload[0] === 0x33 /* '3' */) {
      payload = payload.subarray(15);
    }

    return { cmd: msg.cmd, payload };
  }

  /**
   * Key exchange step 1 payload (cmd 3): just the local nonce.
   * Matches TinyTuya _negotiate_session_key_generate_step_1.
   */
  buildKeyExchangeStep1(localNonce: Buffer, _realKey: Buffer): Buffer {
    return localNonce;
  }

  /**
   * Process step-2 response and derive session key.
   * For v3.5 the finalize differs from v3.4: uses GCM encrypt.
   * Matches TinyTuya _negotiate_session_key_generate_finalize for version 3.5.
   */
  processKeyExchangeStep2(
    step2Payload: Buffer,
    localNonce: Buffer,
    realKey: Buffer,
  ): { step3Payload: Buffer; sessionKey: Buffer } | null {
    if (step2Payload.length < 48) return null;

    const remoteNonce = step2Payload.subarray(0, 16);
    const receivedHmac = step2Payload.subarray(16, 48);

    // Verify HMAC(localNonce, realKey)
    const expectedHmac = hmac(localNonce, realKey);
    if (!receivedHmac.equals(expectedHmac)) return null;

    // Step 3: HMAC(remoteNonce, realKey)
    const step3Payload = hmac(remoteNonce, realKey);

    // Finalize (v3.5 path):
    //   xored = localNonce XOR remoteNonce
    //   iv    = localNonce[:12]
    //   encrypted = GCM-encrypt(xored, realKey, iv=iv)
    //   sessionKey = encrypted[12:28]  (first 16 bytes of ciphertext, after IV)
    const xored = Buffer.allocUnsafe(16);
    for (let i = 0; i < 16; i++) xored[i] = localNonce[i] ^ remoteNonce[i];
    const iv = localNonce.subarray(0, 12);
    const { ciphertext } = encryptGCM(xored, realKey, iv);
    const sessionKey = ciphertext.subarray(0, 16);

    return { step3Payload, sessionKey };
  }
}
