import { TuyaDeviceSchemaProperty } from '../../cloud/device/TuyaDevice';

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
  const original = name.toString();
  // First trim whitespace to check starting/ending characters
  const trimmed = original.trim();
  // keep Unicode alphanumeric characters, spaces and apostrophes; replace other chars with space
  // Uses Unicode property escapes so letters and numbers from all scripts are allowed.
  let s = trimmed.replace(/[^\p{L}\p{N}'\s]/gu, ' ');
  // collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // ensure it starts and ends with an alphanumeric (Unicode-aware)
  if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(s)) {
    return undefined;
  }
  return s;
}

/**
 * Deep equality check using JSON serialization
 * Works for most use cases (objects, arrays, primitives)
 */
export function deepEqual<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Fallback for circular references or non-serializable objects
    return a === b;
  }
}

export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deepClone(item)) as unknown as T;
  }

  const prototype = Object.getPrototypeOf(value);
  const cloned = Object.create(prototype) as Record<string, unknown>;

  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (!descriptor || !('value' in descriptor)) {
      continue;
    }
    cloned[String(key)] = deepClone(descriptor.value as never);
  }

  return cloned as T;
}

/**
 * Debounce function - delays execution until specified milliseconds pass without calls
 * @param fn Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Retry logic for async operations
 * @param fn Async function to retry
 * @param options Retry options
 * @returns Result of fn or throws last error
 */
interface RetryOptions {
  retriesMax?: number;
  interval?: number;
  exponential?: boolean;
  factor?: number;
  jitter?: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    retriesMax = 3,
    interval = 100,
    exponential = false,
    factor = 2,
    jitter = 0,
  } = options ?? {};

  let lastError: Error | null = null;
  let wait = interval;

  for (let attempt = 0; attempt <= retriesMax; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retriesMax) {
        // Calculate wait time
        let waitTime = wait;
        if (jitter > 0) {
          waitTime += Math.random() * jitter;
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Increase wait for next attempt if exponential
        if (exponential) {
          wait *= factor;
        }
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export function generateUUID(): string {
  const { randomUUID } = require('crypto');
  return randomUUID();
}

export function createDelegate<T extends object>(
  target: T,
  overrides: Partial<{ [K in keyof T]: (original: T[K]) => T[K] }>,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const key = prop as keyof T;

      if (overrides[key]) {
        const original = obj[key];
        return overrides[key]!((original as any).bind(obj));
      }

      return obj[key];
    },
  });
}

export function merge(obj1: any, obj2: any) {
  const result = { ...obj1 };

  for (const key of Object.keys(obj2)) {
    const v1 = obj1[key];
    const v2 = obj2[key];

    if (Array.isArray(v1) || Array.isArray(v2)) {
      const isEmptyArray = Array.isArray(v1) && v1.length === 0;
      if (v1 === null || isEmptyArray) {
        result[key] = v2;
      }
      continue;
    }

    if (isPlainObject(v1) && isPlainObject(v2)) {
      result[key] = merge(v1, v2);
      continue;
    }

    if (v1 === null) {
      result[key] = v2;
    }
  }

  return result;
}

function isPlainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
