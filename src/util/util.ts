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
        hap['validValues'] = value;
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