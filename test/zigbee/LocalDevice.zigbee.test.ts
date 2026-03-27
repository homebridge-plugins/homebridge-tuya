/// <reference types="node" />
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import EventEmitter from 'events';
import LocalDevice, { LocalDeviceContext } from '../../src/local/LocalDevice';

// ── Logger mock ───────────────────────────────────────────────────────────────

jest.mock('../../src/shared/util/Logger', () => ({
  __esModule: true,
  default: class Logger {
    log() {}; info() {}; warn() {}; error() {}; debug() {};
  },
  PrefixLogger: class PrefixLogger {
    constructor(public _log: any, public prefix: string) {}
    debug() {}; info() {}; warn() {}; error() {};
  },
}));

// ── Protocol mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/local/protocol/ProtocolFactory', () => ({
  ProtocolFactory: {
    createProtocol: jest.fn(() => ({
      isFrameComplete: jest.fn(() => false),
      extractFrame: jest.fn(() => null),
      encodeFrame: jest.fn(() => Buffer.alloc(0)),
      decodeFrame: jest.fn(() => null),
    })),
  },
}));

// ── net mock ───────────────────────────────────────────────────────────────────

jest.mock('net', () => ({
  createConnection: jest.fn(() => {
    const s = new EventEmitter() as any;
    s.setKeepAlive = jest.fn();
    s.setNoDelay = jest.fn();
    s.write = jest.fn();
    s.destroy = jest.fn();
    s.removeAllListeners = jest.fn(() => { s.removeAllListeners(); });
    // Don't actually call removeAllListeners on EventEmitter to avoid recursion
    s.removeAllListeners = jest.fn();
    return s;
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLogger() {
  return { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
}

function makeParent(overrides: Partial<LocalDeviceContext> = {}): LocalDevice {
  const ctx: LocalDeviceContext = {
    id: 'gateway_001',
    key: Buffer.from('0123456789abcdef'),
    ip: '192.168.1.100',
    version: '3.3',
    name: 'Test Gateway',
    ...overrides,
  };
  return new LocalDevice(ctx, makeLogger());
}

function makeChild(parent: LocalDevice, cid: string): LocalDevice {
  const ctx: LocalDeviceContext = {
    id: 'child_001',
    key: Buffer.from('0123456789abcdef'),
    ip: '192.168.1.100',
    version: '3.3',
    name: 'Test Child',
  };
  const child = new LocalDevice(ctx, makeLogger());
  child.parentDevice = parent;
  child.childId = cid;
  parent.children.set(cid, child);
  return child;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LocalDevice – Zigbee parent/child', () => {

  describe('children Map', () => {
    it('starts as an empty Map', () => {
      const parent = makeParent();
      expect(parent.children.size).toBe(0);
    });

    it('can register a child', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      expect(parent.children.has('0011223344556601')).toBe(true);
      expect(child.parentDevice).toBe(parent);
      expect(child.childId).toBe('0011223344556601');
    });

    it('can register multiple children with different CIDs', () => {
      const parent = makeParent();
      makeChild(parent, '0011223344556601');
      makeChild(parent, '0011223344556602');
      expect(parent.children.size).toBe(2);
    });
  });

  describe('update() routing', () => {
    it('calls updateChild on parent when this is a child', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      const spy = jest.spyOn(parent, 'updateChild');

      child.update({ '1': true });

      expect(spy).toHaveBeenCalledWith('0011223344556601', { '1': true });
    });

    it('does NOT call updateChild on parent for a standalone device', () => {
      const standalone = makeParent();
      const spy = jest.spyOn(standalone, 'updateChild');

      standalone.update({ '1': true }); // no-op (no socket), but should not delegate

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('updateChild()', () => {
    it('logs a warning and returns for an invalid CID', () => {
      const parent = makeParent();
      const warnSpy = jest.spyOn(parent.log, 'warn');

      parent.updateChild('bad-cid', { '1': true });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid CID'));
    });

    it('logs a warning for unsupported protocol versions', () => {
      const parent = makeParent({ version: '3.1' });
      const warnSpy = jest.spyOn(parent.log, 'warn');

      parent.updateChild('0011223344556601', { '1': true });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not supported for Zigbee'));
    });

    it('does not throw for a valid v3.3 gateway (even without socket)', () => {
      const parent = makeParent({ version: '3.3' });
      expect(() => parent.updateChild('0011223344556601', { '1': true })).not.toThrow();
    });

    it('does not throw for a valid v3.4 gateway', () => {
      const parent = makeParent({ version: '3.4' });
      expect(() => parent.updateChild('0011223344556601', { '1': true })).not.toThrow();
    });

    it('does not throw for a valid v3.5 gateway', () => {
      const parent = makeParent({ version: '3.5' });
      expect(() => parent.updateChild('0011223344556601', { '1': true })).not.toThrow();
    });
  });

  describe('queryStateChild()', () => {
    it('logs a warning for an invalid CID', () => {
      const parent = makeParent();
      const warnSpy = jest.spyOn(parent.log, 'warn');

      parent.queryStateChild('bad');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid CID'));
    });

    it('does not throw for a valid CID on v3.3 gateway', () => {
      const parent = makeParent({ version: '3.3' });
      expect(() => parent.queryStateChild('0011223344556601')).not.toThrow();
    });
  });

  describe('_change() routing (child state update from gateway)', () => {
    it('emits change on the correct child when CID matches', done => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');

      child.on('change', (changes: Record<string, unknown>) => {
        expect(changes['1']).toBe(true);
        done();
      });

      // Simulate parent routing child state update
      child._change({ '1': true });
    });

    it('updates child.state accumulator', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');

      child._change({ '1': true, '2': 80 });

      expect(child.state).toMatchObject({ '1': true, '2': 80 });
    });

    it('emits change only for values that actually changed', done => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      child.state = { '1': true }; // pre-set state

      child.on('change', (changes: Record<string, unknown>) => {
        // Only '2' changed
        expect(Object.keys(changes)).toEqual(['2']);
        done();
      });

      child._change({ '1': true, '2': 50 }); // '1' unchanged, '2' new
    });

    it('does not emit change when no values differ', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      child.state = { '1': true };

      const spy = jest.fn();
      child.on('change', spy);

      child._change({ '1': true }); // same value

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('disconnect() child propagation', () => {
    it('emits disconnect on each registered child', done => {
      const parent = makeParent();
      const child1 = makeChild(parent, '0011223344556601');
      const child2 = makeChild(parent, '0011223344556602');

      child1.connected = true;
      child2.connected = true;

      let count = 0;
      const onDisconnect = () => {
        count++;
        if (count === 2) done();
      };

      child1.on('disconnect', onDisconnect);
      child2.on('disconnect', onDisconnect);

      parent.disconnect();
    });

    it('sets connected=false on children', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      child.connected = true;

      parent.disconnect();

      expect(child.connected).toBe(false);
    });

    it('does not emit disconnect for children already disconnected', () => {
      const parent = makeParent();
      const child = makeChild(parent, '0011223344556601');
      child.connected = false; // already disconnected

      const spy = jest.fn();
      child.on('disconnect', spy);

      parent.disconnect();

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
