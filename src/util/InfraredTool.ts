// ===== Types =====

export type Endian = 'LE' | 'BE';

export interface ConvertOptions {
  tickMicros?: number;    // 1 tick の長さ(µs) 例: +Style/Tuyaは ~25
  trimPadding?: boolean;  // 末尾の 0xFF 連続をパディングとして切り落とす
  ffRunLength?: number;   // パディングとみなす 0xFF の最小連続数
  endian?: Endian;        // 16bitのエンディアン
}

export type Protocol = 'NEC' | 'AEHA' | 'SIRC' | 'UNKNOWN';

export interface DecodeBits {
  bits: number[];         // 0/1 の配列（先頭から送出順）
  bitCount: number;
  bytesLSB: number[];     // LSB-firstで詰めたバイト列
  bytesMSB: number[];     // MSB-firstで詰めたバイト列（主に参考）
}

export interface DecodeResult {
  protocol: Protocol;
  confidence: number;     // 0..1
  leader?: { mark: number; space: number };
  unitMicros?: number;    // 推定 T
  pulsesMicros: number[]; // 解析に使ったパルス配列(µs)
  bits?: DecodeBits;
  // NEC/AEHA向けの推定フィールド
  address?: number;
  command?: number;
  addressInvertedOk?: boolean;
  commandInvertedOk?: boolean;
  // SIRC向け
  sircBits?: 12 | 15 | 20;
  // エラーや注意
  notes?: string[];
}

// ===== Utilities =====

function cleanHex(hex: string): string {
  return hex.replace(/[\s:,|_-]/g, '').toLowerCase();
}

function hexToBytes(hex: string): number[] {
  const h = cleanHex(hex);
  if (!h) {
    throw new Error('empty hex string');
  }
  if (h.length % 2 !== 0) {
    throw new Error('hex string length must be even');
  }
  const out: number[] = new Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) {
    const b = parseInt(h.slice(i, i + 2), 16);
    if (Number.isNaN(b)) {
      throw new Error(`invalid hex at ${i}: ${h.slice(i, i + 2)}`);
    }
    out[i / 2] = b;
  }
  return out;
}

function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function trimPaddingFF(bytes: number[], ffRunLength: number): number[] {
  if (ffRunLength <= 0) {
    return bytes.slice();
  }
  let run = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xff) {
      run++;
      if (run >= ffRunLength) {
        return bytes.slice(0, i - run + 1);
      }
    } else {
      run = 0;
    }
  }
  return bytes.slice();
}

function bytesToBase64(bytes: number[]): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

function base64ToBytes(b64: string): number[] {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Array.from(Buffer.from(b64, 'base64'));
  }
  // eslint-disable-next-line no-undef
  const bin = atob(b64);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function u16FromBytes(bytes: number[], endian: Endian): number[] {
  if (bytes.length % 2 !== 0) {
    bytes = bytes.slice(0, bytes.length - 1);
  }
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const val = endian === 'LE'
      ? (bytes[i] | (bytes[i + 1] << 8))
      : ((bytes[i] << 8) | bytes[i + 1]);
    out.push(val);
  }
  return out;
}

function toPulsesMicrosFromU16(ticks: number[], tickMicros: number): number[] {
  return ticks.map(t => t * tickMicros);
}

function near(x: number, target: number, tolPct: number): boolean {
  const lo = target * (1 - tolPct);
  const hi = target * (1 + tolPct);
  return x >= lo && x <= hi;
}

function median(arr: number[]): number {
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function packBitsLSB(bits: number[]): number[] {
  const out: number[] = [];
  let cur = 0, count = 0;
  for (const bit of bits) {
    cur |= (bit & 1) << count;
    count++;
    if (count === 8) {
      out.push(cur);
      cur = 0;
      count = 0;
    }
  }
  if (count > 0) {
    out.push(cur);
  }
  return out;
}

function packBitsMSB(bits: number[]): number[] {
  const out: number[] = [];
  let cur = 0, count = 0;
  for (const bit of bits) {
    cur = (cur << 1) | (bit & 1);
    count++;
    if (count === 8) {
      out.push(cur);
      cur = 0;
      count = 0;
    }
  }
  if (count > 0) {
    out.push(cur);
  }
  return out;
}

// ===== Core conversions =====

export function internalCodeToBase64(hex: string, opts: ConvertOptions = {}): string {
  const {
    trimPadding = true,
    ffRunLength = 8,
  } = opts;
  const bytes = hexToBytes(hex);
  const body = trimPadding ? trimPaddingFF(bytes, ffRunLength) : bytes;
  return bytesToBase64(body);
}

export function base64ToInternalCode(b64: string): string {
  const bytes = base64ToBytes(b64);
  return bytesToHex(bytes);
}

export function internalCodeToPulsesMicros(hex: string, opts: ConvertOptions = {}): number[] {
  const {
    tickMicros = 25,
    endian = 'LE',
    trimPadding = true,
    ffRunLength = 8,
  } = opts;
  const bytes = hexToBytes(hex);
  const body = trimPadding ? trimPaddingFF(bytes, ffRunLength) : bytes;
  const ticks = u16FromBytes(body, endian);
  return toPulsesMicrosFromU16(ticks, tickMicros);
}

// ===== Protocol decoders =====

interface TryResult {
  ok: boolean;
  score: number;            // 0..1
  result?: DecodeResult;
}

function decodeNEC(pulses: number[]): TryResult {
  const notes: string[] = [];
  // Find leader (mark ~9000, space ~4500)
  let i = 0;
  const m0 = pulses[0] ?? 0;
  const s0 = pulses[1] ?? 0;
  if (!(m0 > 6000 && s0 > 2000)) {
    // sometimes extra gap precedes; try to skip small first element
    if (pulses.length > 3 && pulses[1] > 6000 && pulses[2] > 2000) {
      i = 1;
      notes.push('shifted by 1 to align leader');
    } else {
      return { ok: false, score: 0 };
    }
  }
  const leader = { mark: pulses[i], space: pulses[i + 1] };
  i += 2;

  // Estimate unit T from marks following leader (expect ~560µs)
  const markSamples: number[] = [];
  for (let k = i; k < Math.min(i + 100, pulses.length); k += 2) {
    const mk = pulses[k];
    if (mk > 200 && mk < 1200) {
      markSamples.push(mk);
    }
  }
  if (markSamples.length < 4) {
    return { ok: false, score: 0 };
  }
  const T = median(markSamples);

  const bits: number[] = [];
  while (i + 1 < pulses.length) {
    const mark = pulses[i];
    const space = pulses[i + 1];
    i += 2;
    if (mark < T * 0.5 || mark > T * 1.8) {
      break;
    } // mark drifted → end
    // classify by space length (0 ~T, 1 ~3T)
    const bit = (space > T * 2) ? 1 : 0;
    bits.push(bit);
    if (bits.length > 64) {
      break;
    } // NEC32（最大で拡張48）
  }

  // Expect 32 bits (allow 28..40)
  if (bits.length < 28) {
    return { ok: false, score: 0.2 };
  }

  const bytesLSB = packBitsLSB(bits);
  const res: DecodeResult = {
    protocol: 'NEC',
    confidence: 0.6,
    leader,
    unitMicros: T,
    pulsesMicros: pulses,
    bits: {
      bits,
      bitCount: bits.length,
      bytesLSB,
      bytesMSB: packBitsMSB(bits),
    },
    notes,
  };

  // Validate inverted bytes if 32 bits available
  if (bytesLSB.length >= 4) {
    const addr = bytesLSB[0] & 0xff;
    const addrInv = bytesLSB[1] & 0xff;
    const cmd = bytesLSB[2] & 0xff;
    const cmdInv = bytesLSB[3] & 0xff;
    const addrOk = ((addr ^ addrInv) & 0xff) === 0xff;
    const cmdOk = ((cmd ^ cmdInv) & 0xff) === 0xff;
    res.address = addr;
    res.command = cmd;
    res.addressInvertedOk = addrOk;
    res.commandInvertedOk = cmdOk;
    res.confidence = 0.75 + (addrOk && cmdOk ? 0.2 : 0);
  }

  // Score leader closeness
  const leaderScore =
    (near(leader.mark, 9000, 0.35) ? 0.1 : 0) +
    (near(leader.space, 4500, 0.35) ? 0.1 : 0);
  res.confidence = Math.min(1, res.confidence + leaderScore);

  return { ok: true, score: res.confidence, result: res };
}

function decodeAEHA(pulses: number[]): TryResult {
  const notes: string[] = [];
  // Leader ~3400/1700
  let i = 0;
  const m0 = pulses[0] ?? 0;
  const s0 = pulses[1] ?? 0;
  if (!(m0 > 2200 && m0 < 5200 && s0 > 900 && s0 < 3000)) {
    return { ok: false, score: 0 };
  }
  const leader = { mark: m0, space: s0 };
  i += 2;

  // Unit ~425
  const markSamples: number[] = [];
  for (let k = i; k < Math.min(i + 200, pulses.length); k += 2) {
    const mk = pulses[k];
    if (mk > 200 && mk < 900) {
      markSamples.push(mk);
    }
  }
  if (markSamples.length < 6) {
    return { ok: false, score: 0 };
  }
  const T = median(markSamples);

  const bits: number[] = [];
  while (i + 1 < pulses.length) {
    const mark = pulses[i];
    const space = pulses[i + 1];
    i += 2;
    if (mark < T * 0.5 || mark > T * 1.8) {
      break;
    }
    const bit = (space > T * 2.0) ? 1 : 0; // 0: ~T, 1: ~3T
    bits.push(bit);
    if (bits.length > 256) {
      break;
    } // AEHA長尺上限
  }

  if (bits.length < 32) {
    return { ok: false, score: 0.2 };
  }

  const bytesLSB = packBitsLSB(bits);
  const res: DecodeResult = {
    protocol: 'AEHA',
    confidence: 0.6,
    leader,
    unitMicros: T,
    pulsesMicros: pulses,
    bits: {
      bits, bitCount: bits.length, bytesLSB, bytesMSB: packBitsMSB(bits),
    },
    notes,
  };

  // Heuristic score: leader closeness + reasonable length
  let score = 0.6;
  score += (near(leader.mark, 3400, 0.35) ? 0.15 : 0);
  score += (near(leader.space, 1700, 0.35) ? 0.15 : 0);
  score += Math.min(0.1, bits.length / 2560); // longer frames slightly up
  res.confidence = Math.min(1, score);
  return { ok: true, score: res.confidence, result: res };
}

function decodeSIRC(pulses: number[]): TryResult {
  const notes: string[] = [];
  // Start: mark ~2400, space ~600
  let i = 0;
  const m0 = pulses[0] ?? 0;
  const s0 = pulses[1] ?? 0;
  if (!(near(m0, 2400, 0.35) && near(s0, 600, 0.35))) {
    return { ok: false, score: 0 };
  }
  i += 2;

  // Bits: mark 600(0) or 1200(1), space ~600
  const bits: number[] = [];
  const T = 600;
  while (i + 1 < pulses.length) {
    const mark = pulses[i];
    const space = pulses[i + 1];
    i += 2;
    if (!near(space, 600, 0.4)) {
      break;
    }
    const bit = near(mark, 1200, 0.35) ? 1 : (near(mark, 600, 0.35) ? 0 : -1);
    if (bit < 0) {
      break;
    }
    bits.push(bit);
    if (bits.length > 24) {
      break;
    }
  }

  // Valid lengths: 12/15/20 bits
  const validLens: Array<12 | 15 | 20> = [12, 15, 20];
  const len = bits.length as 12 | 15 | 20;
  if (!validLens.includes(len)) {
    return { ok: false, score: 0.2 };
  }

  const bytesLSB = packBitsLSB(bits);
  const res: DecodeResult = {
    protocol: 'SIRC',
    confidence: 0.7,
    unitMicros: T,
    pulsesMicros: pulses,
    bits: {
      bits, bitCount: bits.length, bytesLSB, bytesMSB: packBitsMSB(bits),
    },
    sircBits: len,
    notes,
  };
  return { ok: true, score: res.confidence, result: res };
}

// ===== Auto detect & decode =====

export function decodeInternalCode(hex: string, opts: ConvertOptions = {}): DecodeResult {
  const {
    tickMicros = 25,
    endian = 'LE',
    trimPadding = true,
    ffRunLength = 8,
  } = opts;

  // 1) 内部コード → µsパルス
  const bytes = hexToBytes(hex);
  const body = trimPadding ? trimPaddingFF(bytes, ffRunLength) : bytes.slice();
  const ticks = u16FromBytes(body, endian);
  const pulses = toPulsesMicrosFromU16(ticks, tickMicros);

  // 2) 先頭がスペースだった場合の簡易補正
  let pulsesUse = pulses.slice();
  if (pulsesUse.length >= 2 && pulsesUse[0] < 200) {
    pulsesUse = pulsesUse.slice(1); // 先頭の極小値を捨てる
  }

  // 3) 各方式で試す
  const tries: TryResult[] = [
    decodeNEC(pulsesUse),
    decodeAEHA(pulsesUse),
    decodeSIRC(pulsesUse),
  ].filter(t => t.ok);

  if (tries.length === 0) {
    return {
      protocol: 'UNKNOWN',
      confidence: 0,
      pulsesMicros: pulsesUse,
      notes: ['Failed to match NEC/AEHA/SIRC'],
    };
  }

  // 4) スコア最大の方式を採用
  tries.sort((a, b) => b.score - a.score);
  const best = tries[0].result!;
  return best;
}

/*
// 1) 内部コード → Base64
const b64 = internalCodeToBase64(internalHex, { trimPadding: true, endian: 'LE' });

// 2) Base64 → 内部コード
const hex = base64ToInternalCode(b64);

// 3) パルス配列（µs）
const pulses = internalCodeToPulsesMicros(internalHex, { tickMicros: 25, endian: 'LE' });

// 4) 自動デコード（NEC/AEHA/SIRC） TODO:上手くいかないことがある
const decoded = decodeInternalCode(internalHex, { tickMicros: 25, endian: 'LE' });
console.log(decoded.protocol, decoded.address, decoded.command, decoded.bits?.bytesLSB);
*/