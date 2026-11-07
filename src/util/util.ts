import { createHash } from 'crypto';
import { TuyaDeviceSchemaProperty } from '../device/TuyaDevice';
import { Units } from 'homebridge';

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
      case 'unit': {
        switch (value) {
          case '%': {
            hap['unit'] = Units.PERCENTAGE;
            break;
          }
          case 's': {
            hap['unit'] = Units.SECONDS;
            break;
          }
          case 'lx': {
            hap['unit'] = Units.LUX;
            break;
          }
          case '℃': {
            hap['unit'] = Units.CELSIUS;
            break;
          }
          default: {
            hap['unit'] = value;
            break;
          }
        }
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
/** Shared credential names used for both structured and preformatted log data. */
const SENSITIVE_KEY_PATTERN = new RegExp('(password|secret|(?:access|refresh|local|api|tuya)[_-]?(?:key|token)'
  + '|ticket[_-]?(?:key|id)|token|^sign$|authorization|srtp[_-]?(?:in|out)?[_-]?params)', 'i');

/** Redact credentials in messages, JSON fragments, API paths and media URLs. */
export function redactSensitiveText(value: string, depth = 0): string {
  if (depth > 20) {
    return '***';
  }
  // Parse complete payloads before regex fallback so sensitive parent values,
  // escaped JSON keys and Tuya {code, value} pairs are also protected.
  if (['{', '['].includes(value.trimStart()[0])) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(redactSensitive(parsed, depth + 1), null, value.includes('\n') ? 2 : undefined);
    } catch {
      // Error responses and FFmpeg messages are not necessarily valid JSON.
    }
  }
  return value
    // A Tuya refresh token is a URL path segment rather than a named field.
    .replace(/(\/v\d+(?:\.\d+)?\/token\/)[^/?#\s"'<>\\]+/gi, '$1***')
    // RTSP URLs can carry credentials in their path/query as well as userinfo.
    .replace(/rtsps?:\/\/[^\s"'<>\\]+/gi, 'rtsp://***')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s"'<>@]+@/gi, '$1***@')
    .replace(/\b(Bearer|Basic)\s+[a-z0-9+/=_-]+/gi, '$1 ***')
    .replace(/"([^"\\]+)"(\s*:\s*)("(?:\\.|[^"\\])*(?:"|$))/g,
      (match, key, separator, literal) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return `"${key}"${separator}"***"`;
        }
        try {
          return `"${key}"${separator}${JSON.stringify(redactSensitiveText(JSON.parse(literal), depth + 1))}`;
        } catch {
          return match;
        }
      })
    .replace(/'([^'\\]+)'(\s*:\s*)'(?:\\.|[^'\\])*(?:'|$)/g,
      (match, key, separator) => SENSITIVE_KEY_PATTERN.test(key) ? `'${key}'${separator}'***'` : match)
    .replace(/(["'])([^"']+)\1(\s*:\s*)(-?\d+(?:\.\d+)?|true|false|null)/g,
      (match, quote, key, separator) => SENSITIVE_KEY_PATTERN.test(key) ? `${quote}${key}${quote}${separator}"***"` : match)
    .replace(/([?&]|\b)([a-z][a-z0-9_-]*)=([^&\s"'<>]+)/gi,
      (match, prefix, key) => SENSITIVE_KEY_PATTERN.test(key) ? `${prefix}${key}=***` : match)
    .replace(/(-srtp_(?:in|out)_params)(?:\s+|=)(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+)/gi, '$1 ***');
}

/** Format a diagnostic command without exposing media credentials or changing execution arguments. */
export function formatRedactedCommand(command: string, args: readonly string[]): string {
  let sensitiveArgument = false;
  const safeArgs = args.map(argument => {
    if (sensitiveArgument) {
      sensitiveArgument = false;
      return JSON.stringify('***');
    }
    if (/^-srtp_(?:in|out)_params$/i.test(argument)) {
      sensitiveArgument = true;
    }
    return JSON.stringify(redactSensitiveText(argument));
  });
  return `${redactSensitiveText(command)} ${safeArgs.join(' ')}`;
}

/** FFmpeg may repeat a raw SRTP value in errors without its option name. */
export function redactMediaLog(message: string, args: readonly string[]): string {
  let sensitiveArgument = false;
  for (const argument of args) {
    if (sensitiveArgument) {
      if (argument) {
        message = message.split(argument).join('***');
      }
      sensitiveArgument = false;
    } else if (/^-srtp_(?:in|out)_params$/i.test(argument)) {
      sensitiveArgument = true;
    } else {
      const inline = /^-srtp_(?:in|out)_params=(.+)$/i.exec(argument);
      if (inline) {
        message = message.split(inline[1]).join('***');
      }
    }
  }
  return redactSensitiveText(message);
}

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
 * Create a log-safe copy without invoking getters/custom inspectors. Cycles,
 * binary data and depth limits are replaced rather than exposing the original.
 * The generic return type is retained for existing payload-redaction callers.
 */
export function redactSensitive<T>(value: T, depth = 0): T {
  const ancestors = new WeakSet<object>();
  const redact = (item: unknown, currentDepth: number): unknown => {
    if (typeof item === 'string') {
      return redactSensitiveText(item, currentDepth);
    }
    if (item === null || typeof item !== 'object') {
      return typeof item === 'function' ? '[Function]' : typeof item === 'symbol' ? '[Symbol]' : item;
    }
    if (currentDepth > 20) {
      return '[Truncated]';
    }
    if (ancestors.has(item)) {
      return '[Circular]';
    }
    if (Buffer.isBuffer(item) || ArrayBuffer.isView(item) || item instanceof ArrayBuffer) {
      return '[Binary data]';
    }
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(item, index);
          return descriptor && 'value' in descriptor ? redact(descriptor.value, currentDepth + 1) : '[Getter]';
        });
      }
      if (item instanceof Map) {
        return Array.from(item, ([key, entry]) => [redact(key, currentDepth + 1),
          typeof key === 'string' && SENSITIVE_KEY_PATTERN.test(key) ? '***' : redact(entry, currentDepth + 1)]);
      }
      if (item instanceof Set) {
        return Array.from(item, entry => redact(entry, currentDepth + 1));
      }
      if (item instanceof Date) {
        return Date.prototype.toISOString.call(item);
      }
      const result: Record<string, unknown> = Object.create(null);
      if (item instanceof Error) {
        result.name = 'Error';
      }
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const code = descriptors.code;
      const sensitiveCode = code && 'value' in code && typeof code.value === 'string' && SENSITIVE_KEY_PATTERN.test(code.value);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        const safeKey = redactSensitiveText(key);
        result[safeKey] = SENSITIVE_KEY_PATTERN.test(key) || key === 'value' && sensitiveCode ? '***'
          : 'value' in descriptor ? redact(descriptor.value, currentDepth + 1) : '[Getter]';
      }
      return result;
    } catch {
      return '[Uninspectable]';
    } finally {
      ancestors.delete(item);
    }
  };
  return redact(value, depth) as T;
}
