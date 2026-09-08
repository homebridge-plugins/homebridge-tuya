import { createHash } from 'crypto';
import { TuyaDeviceSchemaProperty } from '../device/TuyaDevice';

export function remap(
  value: number,
  srcStart: number,
  srcEnd: number,
  dstStart: number,
  dstEnd: number,
) {
  const percent = (value - srcStart) / (srcEnd - srcStart);
  const result = percent * (dstEnd - dstStart) + dstStart;
  return result;
}

export function limit(
  value: number,
  start: number,
  end: number,
) {
  let result = value;
  result = Math.min(end, result);
  result = Math.max(start, result);
  return result;
}

export function toHapProperty(
  property: TuyaDeviceSchemaProperty,
) {
  return Object.entries(property).reduce((hap, [key, value]) => {
    switch (key) {
      case 'min': {
        const multiple = Math.pow(10, property ? property['scale'] : 0);
        hap['minValue'] = value / multiple;
        break;
      }
      case 'max': {
        const multiple = Math.pow(10, property ? property['scale'] : 0);
        hap['maxValue'] = value / multiple;
        break;
      }
      case 'step': {
        const multiple = Math.pow(10, property ? property['scale'] : 0);
        hap['minStep'] = value / multiple;
        break;
      }
      case 'range': {
        hap['validValues'] = [...value];
        break;
      }
      default: {
        hap[key] = value;
        break;
      }
    }
    return hap;
  }, {});
}

export function sanitizeName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }
  // keep Unicode alphanumeric characters, spaces and apostrophes; replace other chars with space
  // Uses Unicode property escapes so letters and numbers from all scripts are allowed.
  let s = name.toString().replace(/[^\p{L}\p{N}'\s]/gu, ' ');
  // collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // ensure it starts and ends with an alphanumeric (Unicode-aware)
  if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(s)) {
    return undefined;
  }
  return s;
}


export function uuidFromSeed(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');

  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16), // version 4
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join('-');
}
export function updateBase64(base64: string, byteIndex: number, value: number | Buffer | Array<number>): string {
  const buf = Buffer.from(base64, 'base64');
  return updateBuffer(buf, byteIndex, value).toString('base64');
}

export function updateHex(hex: string, byteIndex: number, value: number | Buffer | Array<number>): string {
  const buf = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  return updateBuffer(buf, byteIndex, value).toString('hex');
}

function updateBuffer(buf: Buffer, byteIndex: number, value: number | Buffer | Array<number>): Buffer {
  let valueBuf: Buffer;

  if (typeof value === 'number') {
    const byteLength = Math.ceil(Math.log2(value + 1) / 8) || 1;
    valueBuf = Buffer.alloc(byteLength);
    valueBuf.writeUIntBE(value, 0, byteLength);
  } else if (Buffer.isBuffer(value)) {
    valueBuf = value;
  } else if (Array.isArray(value)) {
    valueBuf = Buffer.from(value);
  } else {
    throw new Error('value is not number / Buffer / byte array');
  }

  valueBuf.copy(buf as Uint8Array, byteIndex);

  return buf;
}
/**
 * Keys whose values must never reach the log, no matter which log level is
 * active. Note that `PrefixLogger` disables its own masking in debug mode
 * (`mask = !debugMode`), so redaction has to happen at the call site.
 */
const SENSITIVE_KEY_PATTERN = /(password|secret|access_?key|access_?token|refresh_?token|ticket_key|api_?key|tuya_?key)/i;

/**
 * Mask an identifier that is not secret enough to print, but useful enough to
 * correlate log lines (e.g. a smart lock `ticket_id`).
 */
export function maskSecret(value?: string | number | null, visible = 4): string {
  if (value === undefined || value === null) {
    return '<none>';
  }
  const str = `${value}`;
  if (str.length === 0) {
    return '<empty>';
  }
  if (str.length <= visible) {
    return '***';
  }
  return `***${str.slice(-visible)}`;
}

/**
 * Deep-copy a JSON-ish value, replacing the values of sensitive keys with
 * `***`. Used before dumping API payloads to the log.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redactSensitive<T>(value: T, depth = 0): T {
  if (depth > 10 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, depth + 1)) as unknown as T;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '***';
    } else {
      result[key] = redactSensitive(item, depth + 1);
    }
  }
  return result as T;
}
