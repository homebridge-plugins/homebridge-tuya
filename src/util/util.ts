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
