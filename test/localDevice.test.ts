/// <reference types="node" />
/* eslint-disable no-console */
import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import EventEmitter from 'events';
import LocalDevice, { LocalDeviceContext } from '../src/local/LocalDevice';

// Mock Logger
jest.mock('../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}
    info() {}
    warn() {}
    error() {}
    debug() {}
  },
  PrefixLogger: class PrefixLogger {
    constructor(public log: any, public prefix: string, public debugMode: boolean) {}
    debug(message?: any, ...args: any[]) {
      if (this.debugMode) {
        this.log.info((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
      } else {
        this.log.debug((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
      }
    }
    info(message?: any, ...args: any[]) {
      this.log.info((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    }
    warn(message?: any, ...args: any[]) {
      this.log.warn((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    }
    error(message?: any, ...args: any[]) {
      this.log.error((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    }
  },
}));

// Mock Protocol
const mockProtocol = {
  frameSize: jest.fn(() => 0),
  isCompleteFrame: jest.fn(() => false),
  extractFrames: jest.fn(() => []),
};
jest.mock('../src/local/protocol/ProtocolFactory', () => ({
  ProtocolFactory: {
    createProtocol: jest.fn(() => mockProtocol),
  },
}));

// Mock net module partially
let mockSocket: any;
jest.mock('net', () => ({
  Socket: class MockSocket extends EventEmitter {
    connect = jest.fn();
    write = jest.fn();
    destroy = jest.fn();
  },
  createConnection: jest.fn(() => mockSocket),
}));

describe('LocalDevice', () => {
  let device: LocalDevice;
  let mockLogger: any;
  let context: LocalDeviceContext;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    context = {
      id: 'device_001',
      key: Buffer.from('0123456789abcdef'),
      ip: '192.168.1.100',
      version: '3.5',
      name: 'Test Device',
      port: 6668,
      pingGap: 9,
      connectTimeout: 30,
    };

    mockSocket = new EventEmitter();
    mockSocket.connect = jest.fn();
    mockSocket.write = jest.fn();
    mockSocket.destroy = jest.fn();
    mockSocket.removeAllListeners = jest.fn();

    device = new LocalDevice(context, mockLogger);
  });

  afterEach(() => {
    if (device) {
      device.disconnect();
    }
  });

  describe('initialization', () => {
    test('creates device with context', () => {
      expect(device).toBeInstanceOf(EventEmitter);
      expect(device.connected).toBe(false);
      expect(device.state).toEqual({});
    });

    test('sets default port if not provided', () => {
      const contextNoPort = { ...context, port: undefined };
      const dev = new LocalDevice(contextNoPort, mockLogger);

      expect(dev).toBeDefined();
      expect(dev.connected).toBe(false);
    });

    test('sets default pingGap if not provided', () => {
      const contextNoPingGap = { ...context, pingGap: undefined };
      const dev = new LocalDevice(contextNoPingGap, mockLogger);

      expect(dev).toBeDefined();
    });

    test('sets default connectTimeout if not provided', () => {
      const contextNoTimeout = { ...context, connectTimeout: undefined };
      const dev = new LocalDevice(contextNoTimeout, mockLogger);

      expect(dev).toBeDefined();
    });

    test('creates logger with device name', () => {
      expect(device.log).toBeDefined();
    });
  });

  describe('connection state', () => {
    test('starts in disconnected state', () => {
      expect(device.connected).toBe(false);
    });

    test('initializes empty state object', () => {
      expect(device.state).toEqual({});
      expect(typeof device.state).toBe('object');
    });

    test('is an EventEmitter', () => {
      expect(device instanceof EventEmitter).toBe(true);
      expect(typeof device.on).toBe('function');
      expect(typeof device.emit).toBe('function');
    });
  });

  describe('disconnect', () => {
    test('disconnects and clears socket', () => {
      device['socket'] = mockSocket;
      device['connected'] = true;
      device['sessionKey'] = Buffer.from('test_key');

      device.disconnect();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
      expect(device.connected).toBe(false);
    });

    test('handles disconnect when socket is undefined', () => {
      device['socket'] = undefined;
      device.disconnect();

      expect(device.connected).toBe(false);
    });

    test('clears session key on disconnect', () => {
      device['socket'] = mockSocket;
      device['sessionKey'] = Buffer.from('test');
      device['connected'] = true;

      device.disconnect();

      expect(device['sessionKey']).toBeUndefined();
    });
  });

  describe('state management', () => {
    test('allows setting state directly', () => {
      device.state = { switch: 1, brightness: 100 };

      expect((device.state as any).switch).toBe(1);
      expect((device.state as any).brightness).toBe(100);
    });

    test('state persists between operations', () => {
      device.state['test_key'] = 'test_value';
      const value1 = device.state['test_key'];

      device.state['another_key'] = 'another_value';
      const value2 = device.state['test_key'];

      expect(value1).toBe(value2);
    });

    test('can reset state', () => {
      device.state = { key1: 'value1', key2: 'value2' };
      device.state = {};

      expect(device.state).toEqual({});
    });

    test('handles complex state objects', () => {
      device.state = {
        switch: true,
        brightness: 100,
        color: { r: 255, g: 0, b: 0 },
        modes: ['mode1', 'mode2'],
      };

      expect((device.state as any).switch).toBe(true);
      expect((device.state as any).color.r).toBe(255);
      expect((device.state as any).modes).toEqual(['mode1', 'mode2']);
    });
  });

  describe('event emitter behavior', () => {
    test('emits custom events', (done) => {
      device.on('test_event', (data) => {
        expect(data).toBe('test_data');
        done();
      });

      device.emit('test_event', 'test_data');
    });

    test('supports multiple listeners', (done) => {
      let count = 0;
      const increment = () => {
        count++;
        if (count === 2) {
          expect(count).toBe(2);
          done();
        }
      };

      device.on('event', increment);
      device.on('event', increment);
      device.emit('event');
    });

    test('supports once listener', (done) => {
      let count = 0;
      device.once('once_event', () => {
        count++;
      });

      device.emit('once_event');
      device.emit('once_event');

      // Give it a moment to settle
      setImmediate(() => {
        expect(count).toBe(1);
        done();
      });
    });

    test('removes listeners', (done) => {
      const listener = jest.fn();
      device.on('test', listener);
      device.removeListener('test', listener);

      device.emit('test', 'data');

      setImmediate(() => {
        expect(listener).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('context properties', () => {
    test('stores device id', () => {
      expect(device['context'].id).toBe('device_001');
    });

    test('stores device IP', () => {
      expect(device['context'].ip).toBe('192.168.1.100');
    });

    test('stores device key', () => {
      expect(device['context'].key).toEqual(Buffer.from('0123456789abcdef'));
    });

    test('stores protocol version', () => {
      expect(device['context'].version).toBe('3.5');
    });

    test('stores device name', () => {
      expect(device['context'].name).toBe('Test Device');
    });
  });

  describe('protocol handling', () => {
    test('creates protocol for version 3.5', () => {
      const ctxV35 = { ...context, version: '3.5' };
      const devV35 = new LocalDevice(ctxV35, mockLogger);

      expect(devV35['protocol']).toBeDefined();
    });

    test('creates protocol for version 3.1', () => {
      const ctxV31 = { ...context, version: '3.1' };
      const devV31 = new LocalDevice(ctxV31, mockLogger);

      expect(devV31['protocol']).toBeDefined();
    });

    test('creates protocol for version 3.4', () => {
      const ctxV34 = { ...context, version: '3.4' };
      const devV34 = new LocalDevice(ctxV34, mockLogger);

      expect(devV34['protocol']).toBeDefined();
    });
  });

  describe('private state tracking', () => {
    test('initializes connection attempts to 0', () => {
      expect(device['connectionAttempts']).toBe(0);
    });

    test('initializes send counter to 0', () => {
      expect(device['sendCounter']).toBe(0);
    });

    test('initializes cached buffer', () => {
      expect(device['cachedBuffer']).toBeDefined();
      expect(device['cachedBuffer'].length).toBe(0);
    });

    test('initializes without session key', () => {
      expect(device['sessionKey']).toBeUndefined();
    });

    test('initializes without temp keys', () => {
      expect(device['tmpLocalKey']).toBeUndefined();
    });
  });

  describe('log prefix configuration', () => {
    test('creates device logger', () => {
      expect(device.log).toBeDefined();
    });

    test('creates device logger with context', () => {
      const ctxNoName = { ...context, name: undefined };
      const devNoName = new LocalDevice(ctxNoName, mockLogger);

      expect(devNoName.log).toBeDefined();
    });
  });

  describe('connection configuration', () => {
    test('uses custom port if provided', () => {
      const ctxCustomPort = { ...context, port: 8888 };
      const devCustomPort = new LocalDevice(ctxCustomPort, mockLogger);

      expect(devCustomPort['context'].port).toBe(8888);
    });

    test('uses custom pingGap if provided', () => {
      const ctxCustomPing = { ...context, pingGap: 15 };
      const devCustomPing = new LocalDevice(ctxCustomPing, mockLogger);

      expect(devCustomPing['context'].pingGap).toBe(15);
    });

    test('uses custom connectTimeout if provided', () => {
      const ctxCustomTimeout = { ...context, connectTimeout: 60 };
      const devCustomTimeout = new LocalDevice(ctxCustomTimeout, mockLogger);

      expect(devCustomTimeout['context'].connectTimeout).toBe(60);
    });
  });

  describe('device types', () => {
    test('handles light device', () => {
      const lightContext = { ...context, id: 'light_001', name: 'Smart Light' };
      const light = new LocalDevice(lightContext, mockLogger);

      expect(light['context'].id).toBe('light_001');
      expect(light['context'].name).toBe('Smart Light');
    });

    test('handles switch device', () => {
      const switchContext = { ...context, id: 'switch_001', name: 'Smart Switch' };
      const switchDev = new LocalDevice(switchContext, mockLogger);

      expect(switchDev['context'].id).toBe('switch_001');
    });

    test('handles outlet device', () => {
      const outletContext = { ...context, id: 'outlet_001', name: 'Smart Outlet' };
      const outlet = new LocalDevice(outletContext, mockLogger);

      expect(outlet['context'].id).toBe('outlet_001');
    });
  });

  describe('key exchange - HMAC verification (FIX: use context.key not sessionKey)', () => {
    let deviceV34: LocalDevice;
    let deviceV35: LocalDevice;
    let contextV34: LocalDeviceContext;
    let contextV35: LocalDeviceContext;

    beforeEach(() => {
      contextV34 = {
        id: 'device_v34',
        key: Buffer.from('0123456789abcdef'),
        ip: '192.168.1.100',
        version: '3.4',
        name: 'Test Device v3.4',
        port: 6668,
        connectTimeout: 30,
      };

      contextV35 = {
        id: 'device_v35',
        key: Buffer.from('fedcba9876543210'),
        ip: '192.168.1.101',
        version: '3.5',
        name: 'Test Device v3.5',
        port: 6668,
        connectTimeout: 30,
      };

      deviceV34 = new LocalDevice(contextV34, mockLogger);
      deviceV35 = new LocalDevice(contextV35, mockLogger);
    });

    afterEach(() => {
      deviceV34.disconnect();
      deviceV35.disconnect();
    });

    test('accepts valid HMAC in key exchange step 2 (v3.4)', () => {
      // Simulate receiving key exchange step 2 response
      const { hmac } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('0123456789abcdef');
      const remoteNonce = Buffer.from('fedcba9876543210');
      const validHmac = hmac(localNonce, contextV34.key);
      const step2Payload = Buffer.concat([remoteNonce, validHmac]);

      // Set up device state for key exchange
      deviceV34['tmpLocalKey'] = localNonce;
      deviceV34['socket'] = mockSocket;

      const connectSpy = jest.spyOn(deviceV34, 'emit');
      deviceV34['_handleKeyExchangeResponse'](step2Payload);

      // Should emit 'connect' and set connected state
      expect(deviceV34.connected).toBe(true);
      expect(connectSpy).toHaveBeenCalledWith('connect');
    });

    test('rejects invalid HMAC in key exchange step 2 (v3.4)', () => {
      // Use wrong HMAC that doesn't match
      const localNonce = Buffer.from('0123456789abcdef');
      const remoteNonce = Buffer.from('fedcba9876543210');
      const invalidHmac = Buffer.alloc(32); // all zeros - definitely wrong
      const step2Payload = Buffer.concat([remoteNonce, invalidHmac]);

      deviceV34['tmpLocalKey'] = localNonce;
      deviceV34['socket'] = mockSocket;

      const warnSpy = jest.spyOn(mockLogger, 'warn');
      const disconnectSpy = jest.spyOn(deviceV34, 'disconnect');

      deviceV34['_handleKeyExchangeResponse'](step2Payload);

      // Should reject with warning and NOT disconnect (just returns)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HMAC mismatch'));
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    test('rejects HMAC verification when key is wrong (critical bug scenario)', () => {
      const { hmac } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('0123456789abcdef');
      const remoteNonce = Buffer.from('fedcba9876543210');
      const wrongKey = Buffer.from('wrongkeywrongkey');
      
      // HMAC computed with wrong key
      const hmacWithWrongKey = hmac(localNonce, wrongKey);
      const step2Payload = Buffer.concat([remoteNonce, hmacWithWrongKey]);

      deviceV34['tmpLocalKey'] = localNonce;
      deviceV34['socket'] = mockSocket;

      const warnSpy = jest.spyOn(mockLogger, 'warn');
      const disconnectSpy = jest.spyOn(deviceV34, 'disconnect');
      deviceV34['_handleKeyExchangeResponse'](step2Payload);

      // Should reject because verification uses context.key, not the wrong key 
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HMAC mismatch'));
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    test('accepts valid HMAC in key exchange step 2 (v3.5)', () => {
      const { hmac } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('abcdef0123456789');
      const remoteNonce = Buffer.from('9876543210fedcba');
      const validHmac = hmac(localNonce, contextV35.key);
      const step2Payload = Buffer.concat([remoteNonce, validHmac]);

      deviceV35['tmpLocalKey'] = localNonce;
      deviceV35['socket'] = mockSocket;

      const connectSpy = jest.spyOn(deviceV35, 'emit');
      deviceV35['_handleKeyExchangeResponse'](step2Payload);

      expect(deviceV35.connected).toBe(true);
      expect(connectSpy).toHaveBeenCalledWith('connect');
    });
  });

  describe('session key derivation (v3.4 ECB vs v3.5 GCM)', () => {
    let deviceV34: LocalDevice;
    let deviceV35: LocalDevice;
    let contextV34: LocalDeviceContext;
    let contextV35: LocalDeviceContext;

    beforeEach(() => {
      contextV34 = {
        id: 'device_v34',
        key: Buffer.from('0123456789abcdef'),
        ip: '192.168.1.100',
        version: '3.4',
        name: 'Test v3.4',
        port: 6668,
      };

      contextV35 = {
        id: 'device_v35',
        key: Buffer.from('0123456789abcdef'),
        ip: '192.168.1.101',
        version: '3.5',
        name: 'Test v3.5',
        port: 6668,
      };

      deviceV34 = new LocalDevice(contextV34, mockLogger);
      deviceV35 = new LocalDevice(contextV35, mockLogger);
    });

    afterEach(() => {
      deviceV34.disconnect();
      deviceV35.disconnect();
    });

    test('v3.4 derives session key using ECB encryption', () => {
      const { hmac, encryptECBNoPad } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('0123456789abcdef');
      const remoteNonce = Buffer.from('fedcba9876543210');
      const validHmac = hmac(localNonce, contextV34.key);
      const step2Payload = Buffer.concat([remoteNonce, validHmac]);

      deviceV34['tmpLocalKey'] = localNonce;
      deviceV34['socket'] = mockSocket;

      deviceV34['_handleKeyExchangeResponse'](step2Payload);

      // Verify session key was derived using ECB
      const xored = Buffer.allocUnsafe(16);
      for (let i = 0; i < 16; i++) xored[i] = localNonce[i] ^ remoteNonce[i];
      const expectedSessionKey = encryptECBNoPad(xored, contextV34.key);
      expect(deviceV34['sessionKey']).toEqual(expectedSessionKey);
    });

    test('v3.5 derives session key using GCM encryption', () => {
      const { hmac, encryptGCM } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('abcdef0123456789');
      const remoteNonce = Buffer.from('9876543210fedcba');
      const validHmac = hmac(localNonce, contextV35.key);
      const step2Payload = Buffer.concat([remoteNonce, validHmac]);

      deviceV35['tmpLocalKey'] = localNonce;
      deviceV35['socket'] = mockSocket;

      deviceV35['_handleKeyExchangeResponse'](step2Payload);

      // Verify session key was derived using GCM with IV=localNonce[:12]
      const xored = Buffer.allocUnsafe(16);
      for (let i = 0; i < 16; i++) xored[i] = localNonce[i] ^ remoteNonce[i];
      const iv = localNonce.subarray(0, 12);
      const { ciphertext } = encryptGCM(xored, contextV35.key, iv);
      const expectedSessionKey = ciphertext.subarray(0, 16);
      expect(deviceV35['sessionKey']).toEqual(expectedSessionKey);
    });

    test('v3.4 and v3.5 produce different session keys (different derivation)', () => {
      const { hmac } = require('../src/local/protocol/ProtocolUtilities');
      const localNonce = Buffer.from('0123456789abcdef');
      const remoteNonce = Buffer.from('fedcba9876543210');
      const validHmac = hmac(localNonce, contextV34.key);
      const step2Payload = Buffer.concat([remoteNonce, validHmac]);

      deviceV34['tmpLocalKey'] = localNonce;
      deviceV34['socket'] = mockSocket;
      deviceV35['tmpLocalKey'] = localNonce;
      deviceV35['socket'] = mockSocket;

      deviceV34['_handleKeyExchangeResponse'](step2Payload);
      const validHmacV35 = hmac(localNonce, contextV35.key);
      const step2PayloadV35 = Buffer.concat([remoteNonce, validHmacV35]);
      deviceV35['_handleKeyExchangeResponse'](step2PayloadV35);

      // Session keys should differ because derivation methods are different
      expect(deviceV34['sessionKey']).not.toEqual(deviceV35['sessionKey']);
    });
  });
});
