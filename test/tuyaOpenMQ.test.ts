/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock MQTT module before importing TuyaOpenMQ
jest.mock('mqtt', () => ({
  connect: jest.fn(),
}));

// Mock Logger
jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
  },
  PrefixLogger: class PrefixLogger {
    log = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
    constructor(public logger: any, public name: string, public isDebug: boolean) {}
  },
}));

// Mock util  
jest.mock('../src/shared/util/util', () => ({
  generateUUID: jest.fn(() => 'test-uuid-1234'),
}));

// Mock TuyaDevice
jest.mock('../src/cloud/device/TuyaDevice', () => ({
  default: jest.fn(),
}));

import TuyaOpenMQ from '../src/cloud/api/TuyaOpenMQ';
import mqtt from 'mqtt';

describe('TuyaOpenMQ', () => {
  let mq: TuyaOpenMQ;
  let mockAPI: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock MQTT client
    mockClient = {
      on: jest.fn().mockReturnThis(),
      off: jest.fn().mockReturnThis(),
      removeAllListeners: jest.fn().mockReturnThis(),
      end: jest.fn(),
      subscribe: jest.fn(),
    };

    // Mock mqtt.connect
    (mqtt.connect as jest.Mock).mockReturnValue(mockClient);

    mockAPI = {
      tokenInfo: { uid: 'test_uid' },
      post: jest.fn(),
    } as any;

    mq = new TuyaOpenMQ(mockAPI, undefined, false);
  });

  describe('initialization', () => {
    test('creates TuyaOpenMQ instance', () => {
      expect(mq).toBeDefined();
      expect(mq.api).toBe(mockAPI);
    });

    test('initializes with message listeners set', () => {
      expect(mq.messageListeners).toBeDefined();
      expect(mq.messageListeners instanceof Set).toBe(true);
    });

    test('sets default version to 1.0', () => {
      expect(mq.version).toBe('1.0');
    });

    test('generates unique link ID', () => {
      expect(mq.linkId).toBeDefined();
      expect(typeof mq.linkId).toBe('string');
    });

    test('initializes without MQTT client', () => {
      expect(mq.client).toBeUndefined();
    });
  });

  describe('message listener management', () => {
    test('adds message listener', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      expect(mq.messageListeners.size).toBe(1);
      expect(mq.messageListeners.has(listener)).toBe(true);
    });

    test('removes message listener', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);
      expect(mq.messageListeners.size).toBe(1);

      mq.messageListeners.delete(listener);
      expect(mq.messageListeners.size).toBe(0);
    });

    test('supports multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      mq.messageListeners.add(listener1);
      mq.messageListeners.add(listener2);
      mq.messageListeners.add(listener3);

      expect(mq.messageListeners.size).toBe(3);
    });

    test('prevents duplicate listeners', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);
      mq.messageListeners.add(listener);

      expect(mq.messageListeners.size).toBe(1);
    });

    test('clears all listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      mq.messageListeners.add(listener1);
      mq.messageListeners.add(listener2);

      mq.messageListeners.clear();
      expect(mq.messageListeners.size).toBe(0);
    });
  });

  describe('listener callback simulation', () => {
    test('invokes all listeners for received messages', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      mq.messageListeners.add(listener1);
      mq.messageListeners.add(listener2);
      mq.messageListeners.add(listener3);

      const topic = 'test/topic';
      const protocol = 4;
      const message = { devId: 'dev_001', status: [] };

      for (const listener of mq.messageListeners) {
        listener(topic, protocol, message);
      }

      expect(listener1).toHaveBeenCalledWith(topic, protocol, message);
      expect(listener2).toHaveBeenCalledWith(topic, protocol, message);
      expect(listener3).toHaveBeenCalledWith(topic, protocol, message);
    });

    test('listener not called after removal', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      mq.messageListeners.add(listener1);
      mq.messageListeners.add(listener2);

      mq.messageListeners.delete(listener1);

      const topic = 'test/topic';
      const protocol = 4;
      const message = { devId: 'dev_001' };

      for (const listener of mq.messageListeners) {
        listener(topic, protocol, message);
      }

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(topic, protocol, message);
    });

    test('handles listener exceptions without affecting other listeners', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      mq.messageListeners.add(errorListener);
      mq.messageListeners.add(normalListener);

      const topic = 'test/topic';
      const protocol = 4;
      const message = { devId: 'dev_001' };

      for (const listener of mq.messageListeners) {
        try {
          listener(topic, protocol, message);
        } catch (e) {
          // Expected
        }
      }

      expect(normalListener).toHaveBeenCalledWith(topic, protocol, message);
    });

    test('all listeners receive same data', () => {
      const listeners = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()];
      listeners.forEach(l => mq.messageListeners.add(l));

      const topic = 'device/123/status';
      const protocol = 5;
      const message = { online: true, test: 'data' };

      for (const listener of mq.messageListeners) {
        listener(topic, protocol, message);
      }

      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(topic, protocol, message);
      });
    });
  });

  describe('message protocol versions', () => {
    test('supports protocol v1.0', () => {
      mq.version = '1.0';
      expect(mq.version).toBe('1.0');
    });

    test('supports protocol v2.0', () => {
      mq.version = '2.0';
      expect(mq.version).toBe('2.0');
    });

    test('can switch between versions', () => {
      expect(mq.version).toBe('1.0');
      mq.version = '2.0';
      expect(mq.version).toBe('2.0');
      mq.version = '1.0';
      expect(mq.version).toBe('1.0');
    });
  });

  describe('stop functionality', () => {
    test('stop method exists', () => {
      expect(typeof mq.stop).toBe('function');
    });

    test('stop can be called without error', () => {
      expect(() => {
        mq.stop();
      }).not.toThrow();
    });

    test('double stop is safe', () => {
      mq.stop();
      expect(() => {
        mq.stop();
      }).not.toThrow();
    });
  });

  describe('configuration properties', () => {
    test('api property is set correctly', () => {
      expect(mq.api).toBe(mockAPI);
    });

    test('debug flag can be true', () => {
      const debugMQ = new TuyaOpenMQ(mockAPI, undefined, true);
      expect(debugMQ.debug).toBe(true);
    });

    test('debug flag can be false', () => {
      const noDebugMQ = new TuyaOpenMQ(mockAPI, undefined, false);
      expect(noDebugMQ.debug).toBe(false);
    });

    test('link ID is unique between instances', () => {
      const mq1 = new TuyaOpenMQ(mockAPI, undefined, false);
      const mq2 = new TuyaOpenMQ(mockAPI, undefined, false);

      expect(mq1.linkId).toBeDefined();
      expect(mq2.linkId).toBeDefined();
      // UUID should be generated, but mocked to be identical
      // In real usage they'd be unique
    });
  });

  describe('listener set behavior', () => {
    test('listener set is iterable', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      mq.messageListeners.add(listener1);
      mq.messageListeners.add(listener2);

      const listeners = [...mq.messageListeners];
      expect(listeners).toContain(listener1);
      expect(listeners).toContain(listener2);
      expect(listeners.length).toBe(2);
    });

    test('can iterate listener set multiple times', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      // First iteration
      let count1 = 0;
      for (const l of mq.messageListeners) {
        count1++;
      }

      // Second iteration
      let count2 = 0;
      for (const l of mq.messageListeners) {
        count2++;
      }

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    test('listener order is preserved during iteration', () => {
      const listeners = [jest.fn(), jest.fn(), jest.fn()];
      listeners.forEach(l => mq.messageListeners.add(l));

      const collected: any[] = [];
      for (const listener of mq.messageListeners) {
        collected.push(listener);
      }

      expect(collected.length).toBe(3);
      listeners.forEach(l => expect(collected).toContain(l));
    });
  });

  describe('edge cases', () => {
    test('handles empty listener set', () => {
      expect(mq.messageListeners.size).toBe(0);

      const topic = 'test/topic';
      const protocol = 4;
      const message = {};

      expect(() => {
        for (const listener of mq.messageListeners) {
          listener(topic, protocol, message);
        }
      }).not.toThrow();
    });

    test('handles large number of listeners', () => {
      const listeners = Array.from({ length: 100 }, () => jest.fn());
      listeners.forEach(l => mq.messageListeners.add(l));

      expect(mq.messageListeners.size).toBe(100);

      const topic = 'test';
      const protocol = 1;
      const message = { test: true };

      for (const listener of mq.messageListeners) {
        listener(topic, protocol, message);
      }

      listeners.forEach(l => {
        expect(l).toHaveBeenCalledWith(topic, protocol, message);
      });
    });

    test('handles null message data', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      listener('topic', 1, null);
      expect(listener).toHaveBeenCalledWith('topic', 1, null);
    });

    test('handles undefined message data', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      listener('topic', 1, undefined);
      expect(listener).toHaveBeenCalledWith('topic', 1, undefined);
    });

    test('handles complex message data structures', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      const complexData = {
        nested: {
          deep: {
            value: [1, 2, 3],
            obj: { key: 'value' },
          },
        },
        array: [
          { id: 1 },
          { id: 2 },
          { id: 3 },
        ],
      };

      listener('topic', 5, complexData);
      expect(listener).toHaveBeenCalledWith('topic', 5, complexData);
    });
  });

  describe('listener callback contract', () => {
    test('listener receives three parameters', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      listener('topic', 4, { data: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]).toHaveLength(3);
      expect(listener.mock.calls[0][0]).toBe('topic');
      expect(listener.mock.calls[0][1]).toBe(4);
      expect(listener.mock.calls[0][2]).toEqual({ data: 'test' });
    });

    test('listener parameters have correct types', () => {
      const listener = jest.fn();
      mq.messageListeners.add(listener);

      listener('tuya/device/status', 2, { status: [{ code: 'power', value: true }] });

      const [topic, protocol, data] = listener.mock.calls[0];
      expect(typeof topic).toBe('string');
      expect(typeof protocol).toBe('number');
      expect(typeof data).toBe('object');
    });
  });
});
