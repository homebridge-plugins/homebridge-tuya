import { describe, expect, jest, test } from '@jest/globals';
import {
  sanitizeName,
  remap,
  limit,
  deepEqual,
  deepClone,
  debounce,
  toHapProperty,
  createDelegate,
} from '../src/shared/util/util';
import { TuyaDeviceSchemaProperty } from '../src/cloud/device/TuyaDevice';

// based on https://github.com/homebridge/HAP-NodeJS/blob/843453605a949f50e2e26aa7ab74364edcd8137d/src/lib/util/checkName.ts#L23
function isValidName(value: any) {
  if (
    typeof value === "string" &&
    !/^[\p{L}\p{N}][\p{L}\p{N}\p{Zs}\u2019'&!._:;()/,-]*[\p{L}\p{N}]$/u.test(value)
  ) {
    return false;
  } else {
    return true;
  }
}

describe('sanitizeName', () => {
  test('removes underscores and collapses to spaces', () => {
    expect(sanitizeName('switch_1')).toBe('switch 1');
    expect(isValidName(sanitizeName('switch_1'))).toBe(true);
  });

  test('preserves ASCII alphanumeric and apostrophes', () => {
    expect(sanitizeName("John's Lamp")).toBe("John's Lamp");
    expect(isValidName(sanitizeName("John's Lamp"))).toBe(true);
  });

  test('preserves accented and non-Latin letters (Unicode letters)', () => {
    expect(sanitizeName('Café')).toBe('Café');
    expect(sanitizeName('Тест123')).toBe('Тест123');
    expect(isValidName(sanitizeName('Café'))).toBe(true);
    expect(isValidName(sanitizeName('Тест123'))).toBe(true);
  });

  test('preserves CJK characters', () => {
    expect(sanitizeName('中文测试')).toBe('中文测试');
    expect(isValidName(sanitizeName('中文测试'))).toBe(true);
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
    expect(isValidName(sanitizeName('device_123_name'))).toBe(true);
    expect(isValidName(sanitizeName('My-Device-Name'))).toBe(true);
  });

  test('collapses multiple consecutive spaces', () => {
    expect(sanitizeName('name   with    spaces')).toBe('name with spaces');
    expect(isValidName(sanitizeName('name   with    spaces'))).toBe(true);
  });

  test('trims leading and trailing spaces', () => {
    expect(sanitizeName('  My Device  ')).toBe('My Device');
    expect(isValidName(sanitizeName('  My Device  '))).toBe(true);
  });

  test('handles single character names', () => {
    expect(sanitizeName('A')).toBeUndefined(); // Single char fails the regex
    expect(sanitizeName('AB')).toBe('AB');
    expect(isValidName(sanitizeName('AB'))).toBe(true);
  });

  test('name with braces', () => {
    expect(sanitizeName('AB(C)')).toBe('AB C');
    expect(isValidName(sanitizeName('AB(C)'))).toBe(true);
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

describe('deepClone', () => {
  test('clones nested objects and arrays', () => {
    const value = { a: 1, b: { c: [2, 3] } };
    const cloned = deepClone(value);

    expect(cloned).toEqual(value);
    expect(cloned).not.toBe(value);
    expect(cloned.b).not.toBe(value.b);
    expect(cloned.b.c).not.toBe(value.b.c);
  });

  test('preserves primitives and null', () => {
    expect(deepClone('test')).toBe('test');
    expect(deepClone(42)).toBe(42);
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
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

class DelegateTargetClass {
  do(x: number): number;
  do(x: number, y: number): number;
  do(x: any, y?: any): any {
    if (y === undefined) {
      return `original1:${x}`;
    }
    return `original2:${x},${y}`;
  }
}
describe("createDelegate with overloaded methods (different arg count)", () => {
  test("overrides both overload signatures", () => {
    const worker = new DelegateTargetClass();

    const delegate = createDelegate(worker, {
      do: ((original: any) => (...args: any[]) => {
        return `override:${args.join(",")}`;
      }) as any,
    });

    expect(delegate.do(10)).toBe("override:10");
    expect(delegate.do(10, 20)).toBe("override:10,20");
  });

  test("overrides only the single-argument overload and delegates the two-argument overload", () => {
    const worker = new DelegateTargetClass();

    const delegate = createDelegate(worker, {
      do: ((original: any) => (...args: any[]) => {
        if (args.length === 1) {
          return `override1:${args[0]}`;
        }
        return original(...args);
      }) as any,
    });

    expect(delegate.do(10)).toBe("override1:10");
    expect(delegate.do(10, 20)).toBe("original2:10,20");
  });

  test("overrides only the two-argument overload and delegates the single-argument overload", () => {
    const worker = new DelegateTargetClass();

    const delegate = createDelegate(worker, {
      do: ((original: any) => (...args: any[]) => {
        if (args.length === 2) {
          return `override2:${args[0]},${args[1]}`;
        }
        return original(...args);
      }) as any,
    });

    expect(delegate.do(10)).toBe("original1:10");
    expect(delegate.do(10, 20)).toBe("override2:10,20");
  });

});
