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
        hap['minValue'] = Math.max(-273.15, value / multiple);
        break;
      }
      case 'max': {
        const multiple = Math.pow(10, property ? property['scale'] : 0);
        hap['maxValue'] = Math.min(400, value / multiple);
        break;
      }
      case 'step': {
        const multiple = Math.pow(10, property ? property['scale'] : 0);
        hap['minStep'] = Math.max(0.01, value / multiple);
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