/**
 * Shared protocol utilities for encryption/decryption, CRC, and Tuya frame
 * packing/unpacking.
 *
 * Frame formats follow TinyTuya's message_helper.py / header.py exactly.
 *
 * 0x55AA frame layout (v3.1–v3.4):
 *   prefix  uint32 BE  0x000055AA
 *   seqno   uint32 BE
 *   cmd     uint32 BE
 *   length  uint32 BE  (bytes from payload start up to and including CRC/HMAC+suffix)
 *   payload variable
 *   crc     uint32 BE  (CRC32 for v3.1/3.2/3.3; HMAC-SHA256 32 bytes for v3.4)
 *   suffix  uint32 BE  0x0000AA55
 *
 * 0x6699 frame layout (v3.5):
 *   prefix  uint32 BE  0x00006699
 *   unknown uint16 BE  0x0000
 *   seqno   uint32 BE
 *   cmd     uint32 BE
 *   length  uint32 BE  (bytes: IV(12) + ciphertext + GCM-tag(16) + suffix(4))
 *   iv      12 bytes
 *   ciphertext variable
 *   tag     16 bytes
 *   suffix  uint32 BE  0x00009966
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

// ── Constants (mirror TinyTuya header.py) ────────────────────────────────────
export const PREFIX_55AA = 0x000055AA;
export const SUFFIX_55AA = 0x0000AA55;
export const PREFIX_6699 = 0x00006699;
export const SUFFIX_6699 = 0x00009966;

/** Header size for 0x55AA frames: 4*uint32 = 16 bytes */
export const HEADER_SIZE_55AA = 16;
/** Header size for 0x6699 frames: uint32+uint16+uint16+uint32+uint32 = 18 bytes */
export const HEADER_SIZE_6699 = 18;

/**
 * Commands that must NOT have a protocol version header prepended to their
 * payload (matches TinyTuya NO_PROTOCOL_HEADER_CMDS).
 */
export const NO_VERSION_HEADER_CMDS = new Set([
  3,   // SESS_KEY_NEG_START
  4,   // SESS_KEY_NEG_RESP
  5,   // SESS_KEY_NEG_FINISH
  9,   // HEART_BEAT
  0x0a, // DP_QUERY (10)
  0x10, // DP_QUERY_NEW (16)
  0x12, // UPDATEDPS (18)
  0x40, // LAN_EXT_STREAM (64)
]);

// ── Crypto helpers ────────────────────────────────────────────────────────────

/** HMAC-SHA256 */
export function hmac(data: Buffer, key: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** AES-128-ECB encrypt, PKCS7 padding handled by Node crypto */
export function encryptECB(data: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, '');
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-128-ECB decrypt */
export function decryptECB(data: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, '');
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * AES-128-ECB encrypt WITHOUT padding (pad=False in TinyTuya).
 * Used for key-exchange payloads and session-key derivation where the caller
 * guarantees the data is already a multiple of 16 bytes.
 */
export function encryptECBNoPad(data: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, '');
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-128-GCM encrypt – returns { ciphertext, authTag } */
export function encryptGCM(
  data: Buffer,
  key: Buffer,
  iv: Buffer,
  aad?: Buffer,
): { ciphertext: Buffer; authTag: Buffer } {
  const cipher = createCipheriv('aes-128-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return { ciphertext, authTag: cipher.getAuthTag() };
}

/** AES-128-GCM decrypt */
export function decryptGCM(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  aad?: Buffer,
): Buffer {
  const decipher = createDecipheriv('aes-128-gcm', key, iv);
  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(aad);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── CRC32 ─────────────────────────────────────────────────────────────────────

let crc32Table: number[] | null = null;

function makeCRC32Table(): number[] {
  const poly = 0xedb88320;
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? poly ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

export function getCRC32(buf: Buffer): number {
  if (!crc32Table) crc32Table = makeCRC32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table![(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── 0x55AA frame pack / unpack ────────────────────────────────────────────────

/**
 * Pack a 0x55AA Tuya message into bytes.
 *
 * @param seqno     Message sequence number
 * @param cmd       Command byte
 * @param payload   Already-processed payload (encrypted/prefixed by caller)
 * @param hmacKey   If provided, appends HMAC-SHA256(header+payload, hmacKey)
 *                  as the checksum instead of CRC32.
 */
export function packMessage55AA(
  seqno: number,
  cmd: number,
  payload: Buffer,
  hmacKey?: Buffer,
): Buffer {
  // length field = payload.length + checksum(4 or 32) + suffix(4)
  const checksumLen = hmacKey ? 32 : 4;
  const length = payload.length + checksumLen + 4;

  const header = Buffer.allocUnsafe(HEADER_SIZE_55AA);
  header.writeUInt32BE(PREFIX_55AA, 0);
  header.writeUInt32BE(seqno, 4);
  header.writeUInt32BE(cmd, 8);
  header.writeUInt32BE(length, 12);

  const body = Buffer.concat([header, payload]);

  const suffix = Buffer.allocUnsafe(4);
  suffix.writeUInt32BE(SUFFIX_55AA, 0);

  let checksum: Buffer;
  if (hmacKey) {
    checksum = hmac(body, hmacKey);
  } else {
    const crc = getCRC32(body);
    checksum = Buffer.allocUnsafe(4);
    checksum.writeUInt32BE(crc, 0);
  }

  return Buffer.concat([body, checksum, suffix]);
}

/** Parsed result of unpackMessage55AA */
export interface TuyaMessage55AA {
  seqno: number;
  cmd: number;
  retcode: number;
  payload: Buffer;   // raw (still encrypted) payload — caller decrypts
  hmacOk: boolean;
}

/**
 * Unpack a complete 0x55AA frame.
 *
 * @param data      Full frame buffer (prefix through suffix inclusive)
 * @param hmacKey   If provided, verifies HMAC-SHA256; otherwise verifies CRC32
 * @param noRetcode If true, skip stripping the 4-byte retcode field
 */
export function unpackMessage55AA(
  data: Buffer,
  hmacKey?: Buffer,
  noRetcode = false,
): TuyaMessage55AA | null {
  if (data.length < HEADER_SIZE_55AA + 8) return null;
  if (data.readUInt32BE(0) !== PREFIX_55AA) return null;

  const seqno = data.readUInt32BE(4);
  const cmd = data.readUInt32BE(8);
  const payloadLen = data.readUInt32BE(12); // includes checksum + suffix

  const checksumLen = hmacKey ? 32 : 4;
  const totalLen = HEADER_SIZE_55AA + payloadLen;
  if (data.length < totalLen) return null;

  // payload sits between header and checksum
  const payloadEnd = totalLen - checksumLen - 4; // before checksum
  const rawPayload = data.subarray(HEADER_SIZE_55AA, payloadEnd);

  // verify checksum
  let hmacOk = false;
  if (hmacKey) {
    const expectedHmac = hmac(data.subarray(0, payloadEnd), hmacKey);
    const receivedHmac = data.subarray(payloadEnd, payloadEnd + 32);
    hmacOk = expectedHmac.equals(receivedHmac);
  } else {
    const expectedCrc = getCRC32(data.subarray(0, payloadEnd));
    const receivedCrc = data.readUInt32BE(payloadEnd);
    hmacOk = expectedCrc === receivedCrc;
  }

  // strip optional 4-byte retcode prefix (most server→client messages have it)
  let payload = rawPayload;
  let retcode = 0;
  if (!noRetcode && payload.length >= 4) {
    retcode = payload.readUInt32BE(0);
    payload = payload.subarray(4);
  }

  return { seqno, cmd, retcode, payload, hmacOk };
}

// ── 0x6699 frame pack / unpack (v3.5) ─────────────────────────────────────────

/**
 * Pack a 0x6699 (v3.5) frame.  The payload must be the *plaintext* that will
 * be encrypted with AES-128-GCM.  The header bytes [4:18] are used as AAD.
 *
 * length field = IV(12) + ciphertext + GCM-tag(16) + suffix(4)
 */
export function packMessage6699(
  seqno: number,
  cmd: number,
  plaintext: Buffer,
  hmacKey: Buffer,
): Buffer {
  // Generate IV from current time (matches TinyTuya debug=False behaviour)
  const iv = Buffer.from(String(Date.now() / 100).slice(0, 12).padStart(12, '0'), 'latin1');

  // header (18 bytes): prefix(4) + unknown(2) + seqno(4) + cmd(4) + length(4)
  const length = 12 + plaintext.length + 16 + 4; // IV(12) + cipher(N) + tag(16) + suffix(4)
  const header = Buffer.allocUnsafe(HEADER_SIZE_6699);
  header.writeUInt32BE(PREFIX_6699, 0);
  header.writeUInt16BE(0x0000, 4);
  header.writeUInt32BE(seqno, 6);
  header.writeUInt32BE(cmd, 10);
  header.writeUInt32BE(length, 14);

  // AAD = header bytes [4:18]
  const aad = header.subarray(4);
  const { ciphertext, authTag } = encryptGCM(plaintext, hmacKey, iv, aad);

  const suffix = Buffer.allocUnsafe(4);
  suffix.writeUInt32BE(SUFFIX_6699, 0);

  return Buffer.concat([header, iv, ciphertext, authTag, suffix]);
}

/** Parsed result of unpackMessage6699 */
export interface TuyaMessage6699 {
  seqno: number;
  cmd: number;
  payload: Buffer;  // decrypted plaintext
  hmacOk: boolean;
}

/**
 * Unpack a complete 0x6699 frame.
 */
export function unpackMessage6699(
  data: Buffer,
  hmacKey: Buffer,
): TuyaMessage6699 | null {
  if (data.length < HEADER_SIZE_6699 + 12 + 16 + 4) return null;
  if (data.readUInt32BE(0) !== PREFIX_6699) return null;

  const seqno = data.readUInt32BE(6);
  const cmd = data.readUInt32BE(10);
  const length = data.readUInt32BE(14);

  const totalLen = HEADER_SIZE_6699 + length;
  if (data.length < totalLen) return null;

  const iv = data.subarray(HEADER_SIZE_6699, HEADER_SIZE_6699 + 12);
  const tag = data.subarray(totalLen - 4 - 16, totalLen - 4);
  const ciphertext = data.subarray(HEADER_SIZE_6699 + 12, totalLen - 4 - 16);
  const aad = data.subarray(4, HEADER_SIZE_6699);

  let payload: Buffer;
  let hmacOk = false;
  try {
    payload = decryptGCM(ciphertext, hmacKey, iv, tag, aad);
    hmacOk = true;
  } catch {
    return null;
  }

  // strip 4-byte retcode if present
  if (payload.length >= 4 && payload[0] === 0 && payload[1] === 0) {
    payload = payload.subarray(4);
  }

  return { seqno, cmd, payload, hmacOk };
}

// ── Frame boundary helpers ────────────────────────────────────────────────────

/** True when `buffer` starts with a complete 0x55AA or 0x6699 frame */
export function isFrameComplete(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const prefix = buffer.readUInt32BE(0);
  if (prefix === PREFIX_55AA) {
    if (buffer.length < HEADER_SIZE_55AA) return false;
    const payloadLen = buffer.readUInt32BE(12);
    return buffer.length >= HEADER_SIZE_55AA + payloadLen;
  }
  if (prefix === PREFIX_6699) {
    if (buffer.length < HEADER_SIZE_6699) return false;
    const length = buffer.readUInt32BE(14);
    return buffer.length >= HEADER_SIZE_6699 + length;
  }
  return false;
}

/** Extract the first complete frame from buffer; returns frame + tail */
export function extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null {
  // Find a valid prefix, tolerating leading garbage
  let start = -1;
  for (let i = 0; i <= buffer.length - 4; i++) {
    const p = buffer.readUInt32BE(i);
    if (p === PREFIX_55AA || p === PREFIX_6699) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const slice = buffer.subarray(start);
  const prefix = slice.readUInt32BE(0);

  if (prefix === PREFIX_55AA) {
    if (slice.length < HEADER_SIZE_55AA) return null;
    const payloadLen = slice.readUInt32BE(12);
    const frameLen = HEADER_SIZE_55AA + payloadLen;
    if (slice.length < frameLen) return null;
    return {
      frame: Buffer.from(slice.subarray(0, frameLen)),
      remaining: Buffer.from(slice.subarray(frameLen)),
    };
  }

  // PREFIX_6699
  if (slice.length < HEADER_SIZE_6699) return null;
  const length = slice.readUInt32BE(14);
  const frameLen = HEADER_SIZE_6699 + length;
  if (slice.length < frameLen) return null;
  return {
    frame: Buffer.from(slice.subarray(0, frameLen)),
    remaining: Buffer.from(slice.subarray(frameLen)),
  };
}

/** Random 16-byte key */
export function generateSessionKey(): Buffer {
  return randomBytes(16);
}
