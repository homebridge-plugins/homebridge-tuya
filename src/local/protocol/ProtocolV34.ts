/**
 * Tuya Protocol v3.4 handler
 *
 * Uses 0x55AA 16-byte frame header, AES-128-ECB encryption, and HMAC-SHA256
 * (full 32-byte digest) as the frame trailer instead of CRC32.
 *
 * 3-way session key negotiation (mirrors TinyTuya _negotiate_session_key_*):
 *   Step 1 (cmd 3): client → device:  encrypt(localNonce, realKey)
 *   Step 2 (cmd 4): device → client:  encrypt(remoteNonce, realKey) + HMAC(localNonce, realKey)
 *   Step 3 (cmd 5): client → device:  HMAC(remoteNonce, realKey)
 *   Finalize:       sessionKey = AES-ECB-encrypt(localNonce XOR remoteNonce, realKey)
 *
 * Regular frame payload has a 15-byte version header prepended before
 * ECB encryption (except for commands in NO_VERSION_HEADER_CMDS).
 */
import { Protocol } from './Protocol';
import {
  decryptECB, encryptECB, encryptECBNoPad, hmac,
  packMessage55AA, unpackMessage55AA,
  isFrameComplete, extractFrame,
  NO_VERSION_HEADER_CMDS,
} from './ProtocolUtilities';

/** 15-byte version header prepended to v3.4 payloads before ECB encryption */
const VERSION_HEADER_34 = Buffer.from('3.4' + '\x00'.repeat(12), 'latin1');

export class ProtocolV34 implements Protocol {
  encodeFrame(cmd: number, data: Buffer, seqNo: number, sessionKey?: Buffer, deviceKey?: Buffer): Buffer {
    let payload = data;

    if (sessionKey) {
      // Post-exchange: encrypt with session key and sign with session key
      if (!NO_VERSION_HEADER_CMDS.has(cmd)) {
        payload = Buffer.concat([VERSION_HEADER_34, payload]);
      }
      payload = encryptECB(payload, sessionKey);
      return packMessage55AA(seqNo, cmd, payload, sessionKey);
    }

    if (deviceKey) {
      // During key exchange (cmd 3 / cmd 5): ECB-encrypt payload with real device key
      // and HMAC-sign the frame with the real device key (mirrors tinytuya _encode_message)
      payload = encryptECB(payload, deviceKey);
      return packMessage55AA(seqNo, cmd, payload, deviceKey);
    }

    // Fallback: unencrypted + CRC32 (should not normally reach here for v3.4)
    return packMessage55AA(seqNo, cmd, payload);
  }

  isFrameComplete(buffer: Buffer): boolean {
    return isFrameComplete(buffer);
  }

  extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null {
    return extractFrame(buffer);
  }

  decodeFrame(frame: Buffer, deviceKey: Buffer, sessionKey?: Buffer): { cmd: number; payload: Buffer } | null {
    // v3.4 uses HMAC-SHA256 (sessionKey for normal frames, deviceKey during key exchange)
    const hmacKey = sessionKey ?? deviceKey;
    const msg = unpackMessage55AA(frame, hmacKey, false);
    if (!msg) return null;
    if (!msg.hmacOk) return null;

    let payload = msg.payload;

    if (payload.length === 0) {
      return { cmd: msg.cmd, payload };
    }

    // Decrypt ECB with session key
    const decryptKey = sessionKey ?? deviceKey;
    try {
      payload = decryptECB(payload, decryptKey);
    } catch {
      return null;
    }

    // Only strip version header for commands that include it.
    // Key exchange cmds (3,4,5) and heartbeats (9) are in NO_VERSION_HEADER_CMDS
    // – their payloads must NOT be sliced or the nonce/HMAC bytes get corrupted.
    if (!NO_VERSION_HEADER_CMDS.has(msg.cmd) && payload.length >= 15 && payload[0] === 0x33 /* '3' */) {
      payload = payload.subarray(15);
    }

    return { cmd: msg.cmd, payload };
  }

  /**
   * Key exchange step 1: build the payload client sends to device (cmd 3).
   * Returns an encrypted 16-byte nonce; stores localNonce for later.
   *
   * Matches TinyTuya _negotiate_session_key_generate_step_1:
   *   local_nonce = b'0123456789abcdef'
   *   payload = MessagePayload(SESS_KEY_NEG_START, local_nonce)
   */
  buildKeyExchangeStep1(localNonce: Buffer, _deviceKey: Buffer): Buffer {
    // The nonce is sent as-is (no encryption at the payload level for cmd 3;
    // the frame itself carries the real key's HMAC wrapper).
    return localNonce;
  }

  /**
   * Key exchange step 3 + finalize.
   *
   * @param step2Payload  Decrypted 48-byte payload from device cmd-4 frame.
   * @param localNonce    The 16-byte nonce we sent in step 1.
   * @param realKey       The device's real local key (pre-exchange).
   * @returns { step3Payload, sessionKey } or null on verification failure.
   *
   * Matches TinyTuya _negotiate_session_key_generate_step_3 + _generate_finalize.
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

    // Step 3 payload: HMAC(remoteNonce, realKey)
    const step3Payload = hmac(remoteNonce, realKey);

    // Finalise: sessionKey = AES-ECB-encrypt(localNonce XOR remoteNonce, realKey)
    const xored = Buffer.allocUnsafe(16);
    for (let i = 0; i < 16; i++) xored[i] = localNonce[i] ^ remoteNonce[i];
    const sessionKey = encryptECBNoPad(xored, realKey);

    return { step3Payload, sessionKey };
  }
}
