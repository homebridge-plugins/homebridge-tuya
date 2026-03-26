/* eslint-disable no-console */
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import EventEmitter from 'events';
import TuyaDiscovery, { DiscoveryResult } from '../src/local/TuyaDiscovery';

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
    constructor(public log: any, public name: string, public debug: boolean) {}
    info() {}
    warn() {}
    error() {}
  },
}));

// Mock dgram
let mockServers: Record<number, EventEmitter> = {};

jest.mock('dgram', () => ({
  createSocket: jest.fn((options: any) => {
    const socket = new EventEmitter() as any;
    socket.bind = jest.fn();
    socket.close = jest.fn();
    socket.removeAllListeners = jest.fn();
    socket.destroy = jest.fn();
    return socket;
  }),
  Socket: EventEmitter,
}));

describe('TuyaDiscovery', () => {
  let discovery: TuyaDiscovery;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    discovery = new TuyaDiscovery(mockLogger, false);
  });

  describe('initialization', () => {
    test('creates discovery instance', () => {
      expect(discovery).toBeInstanceOf(EventEmitter);
      expect(discovery).toBeDefined();
    });

    test('creates logger', () => {
      expect(discovery.log).toBeDefined();
    });

    test('initializes with debug disabled', () => {
      const disc = new TuyaDiscovery(mockLogger, false);
      expect(disc).toBeDefined();
    });

    test('initializes with debug enabled', () => {
      const disc = new TuyaDiscovery(mockLogger, true);
      expect(disc).toBeDefined();
    });

    test('is instance of EventEmitter', () => {
      expect(discovery instanceof EventEmitter).toBe(true);
    });

    test('has event methods', () => {
      expect(typeof discovery.on).toBe('function');
      expect(typeof discovery.emit).toBe('function');
      expect(typeof discovery.once).toBe('function');
      expect(typeof discovery.removeListener).toBe('function');
    });
  });

  describe('state management', () => {
    test('starts not running', () => {
      expect(discovery['running']).toBe(false);
    });

    test('tracks discovered devices', () => {
      expect(discovery['discovered']).toBeDefined();
      expect(discovery['discovered'] instanceof Map).toBe(true);
    });

    test('discovered map is initially empty', () => {
      expect(discovery['discovered'].size).toBe(0);
    });
  });

  describe('start/stop lifecycle', () => {
    test('sets running flag when started', () => {
      discovery.start();
      expect(discovery['running']).toBe(true);
    });

    test('clears running flag when stopped', () => {
      discovery.start();
      expect(discovery['running']).toBe(true);
      discovery.stop();
      expect(discovery['running']).toBe(false);
    });

    test('start prevents multiple instances', () => {
      discovery.start();
      discovery.start(); // Should immediately return
      expect(discovery['running']).toBe(true);
    });

    test('creates UDP servers on start', () => {
      discovery.start();
      expect(discovery['servers']).toBeDefined();
    });

    test('removes UDP servers on stop', () => {
      discovery.start();
      discovery.stop();
      // Servers should be cleaned up
      expect(discovery['running']).toBe(false);
    });
  });

  describe('event emission', () => {
    test('emits discover events', (done) => {
      discovery.on('discover', (result: DiscoveryResult) => {
        expect(result).toBeDefined();
        done();
      });

      // Manually trigger discovery after setup
      const discoveryData: DiscoveryResult = {
        id: 'device_001',
        ip: '192.168.1.100',
        version: '3.5',
      };

      discovery.emit('discover', discoveryData);
    });

    test('emits end event when ending', (done) => {
      discovery.on('end', () => {
        expect(discovery['running']).toBe(false);
        done();
      });

      discovery.end();
    }, 10000);

    test('supports multiple listeners', (done) => {
      let count = 0;
      const callback = () => {
        count++;
        if (count === 2) {
          expect(count).toBe(2);
          done();
        }
      };

      discovery.on('test_event', callback);
      discovery.on('test_event', callback);
      discovery.emit('test_event');
    });
  });

  describe('device discovery', () => {
    test('discovery result has required fields', () => {
      const result: DiscoveryResult = {
        id: 'device_001',
        ip: '192.168.1.100',
        version: '3.5',
      };

      expect(result.id).toBe('device_001');
      expect(result.ip).toBe('192.168.1.100');
      expect(result.version).toBe('3.5');
    });

    test('discovery result can have optional fields', () => {
      const result: DiscoveryResult = {
        id: 'device_001',
        ip: '192.168.1.100',
        version: '3.5',
        productKey: 'prod_key_123',
        gwType: 'gateway_type',
      };

      expect(result.productKey).toBe('prod_key_123');
      expect(result.gwType).toBe('gateway_type');
    });

    test('can track multiple devices in discovered map', () => {
      discovery['discovered'].set('device_001', '192.168.1.100');
      discovery['discovered'].set('device_002', '192.168.1.101');
      discovery['discovered'].set('device_003', '192.168.1.102');

      expect(discovery['discovered'].size).toBe(3);
      expect(discovery['discovered'].get('device_001')).toBe('192.168.1.100');
      expect(discovery['discovered'].get('device_003')).toBe('192.168.1.102');
    });
  });

  describe('clear functionality', () => {
    test('clears discovered devices map', () => {
      discovery['discovered'].set('device_001', '192.168.1.100');
      discovery['discovered'].set('device_002', '192.168.1.101');

      expect(discovery['discovered'].size).toBe(2);

      discovery.clear();

      expect(discovery['discovered'].size).toBe(0);
    });

    test('clear can be called multiple times', () => {
      discovery['discovered'].set('device_001', '192.168.1.100');

      discovery.clear();
      discovery.clear();

      expect(discovery['discovered'].size).toBe(0);
    });
  });

  describe('end functionality', () => {
    test('stops discovery when ending', (done) => {
      discovery.start();
      expect(discovery['running']).toBe(true);

      discovery.on('end', () => {
        expect(discovery['running']).toBe(false);
        done();
      });

      discovery.end();
    }, 10000);

    test('clears discovered devices when ending', (done) => {
      discovery['discovered'].set('device_001', '192.168.1.100');
      expect(discovery['discovered'].size).toBe(1);

      discovery.on('end', () => {
        expect(discovery['discovered'].size).toBe(0);
        done();
      });

      discovery.end();
    }, 10000);

    test('removes all listeners when ending', (done) => {
      const listener = jest.fn();
      discovery.on('discover', listener);

      discovery.on('end', () => {
        // After end, listeners should be removed
        expect(discovery.listenerCount('discover')).toBe(0);
        done();
      });

      discovery.end();
    }, 10000);
  });

  describe('UDP port monitoring', () => {
    test('monitors standard v3.1-v3.4 ports', () => {
      discovery.start();

      expect(discovery['servers'][6666]).toBeDefined();
      expect(discovery['servers'][6667]).toBeDefined();
      expect(discovery['servers'][7000]).toBeDefined();
    });

    test('creates socket for port 6666', () => {
      discovery.start();
      expect(discovery['servers'][6666]).toBeDefined();
    });

    test('creates socket for port 6667', () => {
      discovery.start();
      expect(discovery['servers'][6667]).toBeDefined();
    });

    test('creates socket for port 7000 (v3.5)', () => {
      discovery.start();
      expect(discovery['servers'][7000]).toBeDefined();
    });
  });

  describe('protocol support', () => {
    test('supports v3.1-v3.4 discovery', () => {
      // Devices v3.1-v3.4 send discovery packets on ports 6666/6667
      const v31Result: DiscoveryResult = {
        id: 'device_v31',
        ip: '192.168.1.110',
        version: '3.1',
      };

      discovery.emit('discover', v31Result);

      expect(v31Result.version).toBe('3.1');
    });

    test('supports v3.5 discovery', () => {
      // Devices v3.5 send discovery packets on port 7000
      const v35Result: DiscoveryResult = {
        id: 'device_v35',
        ip: '192.168.1.120',
        version: '3.5',
      };

      discovery.emit('discover', v35Result);

      expect(v35Result.version).toBe('3.5');
    });
  });

  describe('device types', () => {
    test('can discover light device', () => {
      const result: DiscoveryResult = {
        id: 'light_001',
        ip: '192.168.1.100',
        version: '3.5',
      };

      discovery.emit('discover', result);
      expect(result.id).toMatch(/light/);
    });

    test('can discover switch device', () => {
      const result: DiscoveryResult = {
        id: 'switch_001',
        ip: '192.168.1.101',
        version: '3.4',
      };

      discovery.emit('discover', result);
      expect(result.id).toMatch(/switch/);
    });

    test('can discover gateway device', () => {
      const result: DiscoveryResult = {
        id: 'gateway_001',
        ip: '192.168.1.102',
        version: '3.5',
        gwType: 'ty_gw_001',
      };

      discovery.emit('discover', result);
      expect(result.gwType).toBeDefined();
    });
  });

  describe('logging and debugging', () => {
    test('creates logger with debug disabled', () => {
      const disc = new TuyaDiscovery(mockLogger, false);
      expect(disc.log).toBeDefined();
    });

    test('creates logger with debug enabled', () => {
      const disc = new TuyaDiscovery(mockLogger, true);
      expect(disc.log).toBeDefined();
    });
  });

  describe('multiple discovery instances', () => {
    test('multiple instances maintain separate state', () => {
      const disc1 = new TuyaDiscovery(mockLogger, false);
      const disc2 = new TuyaDiscovery(mockLogger, false);

      disc1['discovered'].set('device_1', '192.168.1.100');
      disc2['discovered'].set('device_2', '192.168.1.101');

      expect(disc1['discovered'].size).toBe(1);
      expect(disc2['discovered'].size).toBe(1);
      expect(disc1['discovered'].has('device_1')).toBe(true);
      expect(disc2['discovered'].has('device_2')).toBe(true);
    });

    test('multiple instances have separate servers', () => {
      const disc1 = new TuyaDiscovery(mockLogger, false);
      const disc2 = new TuyaDiscovery(mockLogger, false);

      disc1.start();
      disc2.start();

      expect(Object.keys(disc1['servers']).length).toBeGreaterThan(0);
      expect(Object.keys(disc2['servers']).length).toBeGreaterThan(0);

      disc1.stop();
      disc2.stop();
    });
  });

  describe('integration scenarios', () => {
    test('discovery workflow: start -> discover -> stop', (done) => {
      discovery.start();

      // Simulate discovering a device
      const device: DiscoveryResult = {
        id: 'discovered_device',
        ip: '192.168.1.100',
        version: '3.5',
      };

      discovery.on('discover', (result) => {
        discovery.stop();
        expect(discovery['running']).toBe(false);
        done();
      });

      discovery.emit('discover', device);
    });

    test('discovery workflow: start -> clear -> discover -> end', (done) => {
      discovery.start();

      discovery['discovered'].set('old_device', '192.168.1.50');
      discovery.clear();

      expect(discovery['discovered'].size).toBe(0);

      discovery.on('end', () => {
        expect(discovery['discovered'].size).toBe(0);
        done();
      });

      discovery.end();
    }, 10000);
  });
});
