import { describe, expect, test } from '@jest/globals';
import {
  sanitizeName,
  remap,
  limit,
  deepEqual,
  debounce,
  toHapProperty,
} from '../src/shared/util/util';
import { TuyaDeviceSchemaProperty } from '../src/cloud/device/TuyaDevice';

describe('sanitizeName', () => {
  test('removes underscores and collapses to spaces', () => {
    expect(sanitizeName('switch_1')).toBe('switch 1');
  });

  test('preserves ASCII alphanumeric and apostrophes', () => {
    expect(sanitizeName("John's Lamp")).toBe("John's Lamp");
  });

  test('preserves accented and non-Latin letters (Unicode letters)', () => {
    expect(sanitizeName('Café')).toBe('Café');
    expect(sanitizeName('Тест123')).toBe('Тест123');
  });

  test('preserves CJK characters', () => {
    expect(sanitizeName('中文测试')).toBe('中文测试');
  });

  test('returns undefined if sanitized name is empty or invalid', () => {
    expect(sanitizeName('@@@')).toBeUndefined();
    expect(sanitizeName('  !!!  ')).toBeUndefined();
  });

  test('returns undefined for null or empty string', () => {
    expect(sanitizeName('')).toBeUndefined();
    expect(sanitizeName(undefined)).toBeUndefined();
  });

  test('handles mixed content correctly', () => {
    expect(sanitizeName('device_123_name')).toBe('device 123 name');
    expect(sanitizeName('My-Device-Name')).toBe('My Device Name');
  });

  test('collapses multiple consecutive spaces', () => {
    expect(sanitizeName('name   with    spaces')).toBe('name with spaces');
  });

  test('trims leading and trailing spaces', () => {
    expect(sanitizeName('  My Device  ')).toBe('My Device');
  });

  test('rejects names that start or end with non-alphanumeric', () => {
    expect(sanitizeName('_device')).toBeUndefined();
    expect(sanitizeName('device_')).toBeUndefined();
    expect(sanitizeName('_device_')).toBeUndefined();
  });

  test('handles single character names', () => {
    expect(sanitizeName('A')).toBeUndefined(); // Single char fails the regex
    expect(sanitizeName('AB')).toBe('AB');
  });
});

describe('remap', () => {
  test('remaps value from one range to another', () => {
    // Remap 5 from [0, 10] to [0, 100]
    const result = remap(5, 0, 10, 0, 100);
    expect(result).toBe(50);
  });

  test('remaps 0 correctly', () => {
    const result = remap(0, 0, 10, 0, 100);
    expect(result).toBe(0);
  });

  test('remaps maximum value correctly', () => {
    const result = remap(10, 0, 10, 0, 100);
    expect(result).toBe(100);
  });

  test('remaps to negative range', () => {
    const result = remap(5, 0, 10, -100, 0);
    expect(result).toBe(-50);
  });

  test('remaps float values', () => {
    const result = remap(2.5, 0, 5, 0, 100);
    expect(result).toBe(50);
  });

  test('handles identical source and destination ranges', () => {
    const result = remap(5, 0, 10, 0, 10);
    expect(result).toBe(5);
  });
});

describe('limit', () => {
  test('limits value within range', () => {
    expect(limit(50, 0, 100)).toBe(50);
  });

  test('clamps value below minimum', () => {
    expect(limit(-10, 0, 100)).toBe(0);
  });

  test('clamps value above maximum', () => {
    expect(limit(150, 0, 100)).toBe(100);
  });

  test('handles exact boundaries', () => {
    expect(limit(0, 0, 100)).toBe(0);
    expect(limit(100, 0, 100)).toBe(100);
  });

  test('handles negative ranges', () => {
    expect(limit(-50, -100, 0)).toBe(-50);
    expect(limit(-150, -100, 0)).toBe(-100);
    expect(limit(50, -100, 0)).toBe(0);
  });

  test('handles float values', () => {
    expect(limit(50.5, 0, 100)).toBe(50.5);
    expect(limit(100.5, 0, 100)).toBe(100);
  });
});

describe('deepEqual', () => {
  test('returns true for equal primitives', () => {
    expect(deepEqual(5, 5)).toBe(true);
    expect(deepEqual('test', 'test')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
  });

  test('returns false for different primitives', () => {
    expect(deepEqual(5, 10)).toBe(false);
    expect(deepEqual('test', 'other')).toBe(false);
  });

  test('returns true for equal objects', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 2 };
    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  test('returns false for different objects', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 3 };
    expect(deepEqual(obj1, obj2)).toBe(false);
  });

  test('returns true for equal arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  test('returns false for different arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  test('returns true for deeply nested equal structures', () => {
    const obj1 = { a: { b: { c: 1 } } };
    const obj2 = { a: { b: { c: 1 } } };
    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  test('handles null and undefined', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe('debounce', () => {
  test('debounces function execution', (done) => {
    let callCount = 0;
    const fn = jest.fn(() => {
      callCount++;
    });
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    setTimeout(() => {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(callCount).toBe(1);
      done();
    }, 150);
  });

  test('resets debounce timer on each call', (done) => {
    let callCount = 0;
    const fn = jest.fn(() => {
      callCount++;
    });
    const debounced = debounce(fn, 50);

    debounced();
    setTimeout(() => debounced(), 25);
    setTimeout(() => debounced(), 50);

    expect(fn).not.toHaveBeenCalled();

    setTimeout(() => {
      expect(fn).toHaveBeenCalledTimes(1);
      done();
    }, 150);
  });

  test('preserves function return type (though debounced returns void)', () => {
    const fn = (...args: unknown[]) => {
      const x = args[0] as number;
      return x * 2;
    };
    const debounced = debounce(fn, 100);

    // Debounced functions return void
    const result = debounced(5);
    expect(result).toBeUndefined();
  });
});

describe('toHapProperty', () => {
  test('converts min property', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: 0,
      max: 100,
      scale: 0,
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.minValue).toBeDefined();
    expect(result.minValue).toBe(0);
  });

  test('converts max property', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: 0,
      max: 100,
      scale: 0,
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.maxValue).toBeDefined();
    expect(result.maxValue).toBe(100);
  });

  test('converts step property', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: 0,
      max: 100,
      scale: 1,
      step: 10,
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.minStep).toBeDefined();
    expect(result.minStep).toBe(1); // 10 / 10^1 = 1
  });

  test('converts range property to validValues', () => {
    const property: TuyaDeviceSchemaProperty = {
      range: ['off', 'on', 'auto'],
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.validValues).toBeDefined();
    expect(result.validValues).toEqual(['off', 'on', 'auto']);
  });

  test('applies scale factor correctly', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: 0,
      max: 10000,
      scale: 2,
      step: 100,
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.minValue).toBe(0); // 0 / 100 = 0
    expect(result.maxValue).toBe(100); // 10000 / 100 = 100
    expect(result.minStep).toBe(1); // 100 / 100 = 1
  });

  test('clamps values to HAP limits', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: -500,
      max: 500,
      scale: 0,
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.minValue).toBeGreaterThanOrEqual(-273.15); // Absolute zero clamping
  });

  test('preserves other properties', () => {
    const property: TuyaDeviceSchemaProperty = {
      min: 0,
      max: 100,
      scale: 0,
      unit: '°C',
    };
    const result = toHapProperty(property) as Record<string, any>;

    expect(result.unit).toBe('°C');
  });

  test('handles empty properties object', () => {
    const property: TuyaDeviceSchemaProperty = {};
    const result = toHapProperty(property) as Record<string, any>;

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
