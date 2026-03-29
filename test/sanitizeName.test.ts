import { describe, expect, test } from '@jest/globals';
import { sanitizeName } from '../src/shared/util/util';

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
});
