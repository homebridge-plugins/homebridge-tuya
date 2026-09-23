import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  extractZigbeeEvents,
  setupZigbeeEventMonitoring,
  isValidZigbeeEvent,
  batchProcessZigbeeEvents,
  logEventProcessingSummary,
  ZigbeeDeviceEvent,
  ZigbeeDeviceEventInfo,
} from '../../src/local/ZigbeeEventDetection';
import Logger from '../../src/shared/util/Logger';
import { EventEmitter } from 'events';

function makeMockLog(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  } as unknown as Logger;
}

describe('ZigbeeEventDetection - Phase 5', () => {
  let log: Logger;

  beforeEach(() => {
    log = makeMockLog();
  });

  describe('extractZigbeeEvents', () => {
    it('detects join event from subdev_event field', () => {
      const payload = {
        subdev_event: 'join',
        cid: '00112233445566aa',
      };

      const events = extractZigbeeEvents(payload, 'gw_001');

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe(ZigbeeDeviceEvent.JOINED);
      expect(events[0].cid).toBe('00112233445566aa');
      expect(events[0].gatewayId).toBe('gw_001');
    });

    it('detects leave event from subdev_event field', () => {
      const payload = {
        subdev_event: 'leave',
        cid: '00112233445566bb',
      };

      const events = extractZigbeeEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe(ZigbeeDeviceEvent.LEFT);
      expect(events[0].cid).toBe('00112233445566bb');
    });

    it('handles numeric event codes (0=leave, 1=join)', () => {
      const joinPayload = { device_join: 1, device_cid: '00112233445566aa' };
      const leavePayload = { device_join: 0, device_cid: '00112233445566bb' };

      const joinEvents = extractZigbeeEvents(joinPayload);
      const leaveEvents = extractZigbeeEvents(leavePayload);

      expect(joinEvents).toHaveLength(1);
      expect(leaveEvents).toHaveLength(1);
      expect(joinEvents[0].event).toBe(ZigbeeDeviceEvent.JOINED);
      expect(leaveEvents[0].event).toBe(ZigbeeDeviceEvent.LEFT);
    });

    it('detects device_join field', () => {
      const payload = {
        device_join: true,
        device_cid: '00aabbccddee1234',
      };

      const events = extractZigbeeEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe(ZigbeeDeviceEvent.JOINED);
      expect(events[0].cid).toBe('00aabbccddee1234');
    });

    it('parses subdev_list format (array of children)', () => {
      const payload = {
        subdev_list: [
          { cid: '00112233445566aa', online: 1, productName: 'Light' },
          { cid: '00112233445566bb', online: 0, productName: 'Switch' },
        ],
      };

      const events = extractZigbeeEvents(payload, 'gw_001');

      expect(events).toHaveLength(2);
      expect(events[0].event).toBe(ZigbeeDeviceEvent.JOINED);
      expect(events[0].productName).toBe('Light');
      expect(events[1].event).toBe(ZigbeeDeviceEvent.LEFT);
      expect(events[1].productName).toBe('Switch');
    });

    it('parses child_device_list format (alternative name)', () => {
      const payload = {
        child_device_list: [
          { cid: '11223344556600aa', online: true },
          { cid: '11223344556600bb', online: false },
        ],
      };

      const events = extractZigbeeEvents(payload);

      expect(events).toHaveLength(2);
      expect(events[0].cid).toBe('11223344556600aa');
      expect(events[1].cid).toBe('11223344556600bb');
    });

    it('ignores list entries without CID', () => {
      const payload = {
        subdev_list: [
          { cid: '00112233445566aa', online: 1 },
          { online: 1 }, // No CID - should be ignored
          { cid: '00112233445566cc', online: 1 },
        ],
      };

      const events = extractZigbeeEvents(payload);

      // Should only have 2 events (skipped the one without CID)
      expect(events).toHaveLength(2);
      expect(events.map(e => e.cid)).not.toContain(undefined);
    });

    it('returns empty array for empty payload', () => {
      const events = extractZigbeeEvents({});
      expect(events).toEqual([]);
    });

    it('returns empty array when no recognized event fields', () => {
      const payload = { some_other_field: 'value' };
      const events = extractZigbeeEvents(payload);
      expect(events).toEqual([]);
    });

    it('extracts CID from various field names', () => {
      const withCid = extractZigbeeEvents({
        subdev_event: 'join',
        cid: '00112233445566aa',
      });
      expect(withCid[0].cid).toBe('00112233445566aa');

      const withDeviceCid = extractZigbeeEvents({
        device_join: true,
        device_cid: '00112233445566bb',
      });
      expect(withDeviceCid[0].cid).toBe('00112233445566bb');

      const withChildCid = extractZigbeeEvents({
        subdev_event: 'leave',
        child_cid: '00112233445566cc',
      });
      expect(withChildCid[0].cid).toBe('00112233445566cc');
    });

    it('includes timestamp in events', () => {
      const payload = { subdev_event: 'join', cid: '00112233445566aa' };
      const before = Date.now();
      const events = extractZigbeeEvents(payload);
      const after = Date.now();

      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('isValidZigbeeEvent', () => {
    it('validates correct CID format (16 hex lowercase)', () => {
      const event: ZigbeeDeviceEventInfo = {
        event: ZigbeeDeviceEvent.JOINED,
        cid: '00112233445566aa',
        timestamp: Date.now(),
      };

      expect(isValidZigbeeEvent(event)).toBe(true);
    });

    it('rejects invalid CID format', () => {
      const event: ZigbeeDeviceEventInfo = {
        event: ZigbeeDeviceEvent.JOINED,
        cid: 'INVALID',
        timestamp: Date.now(),
      };

      expect(isValidZigbeeEvent(event)).toBe(false);
    });

    it('rejects uppercase CID', () => {
      const event: ZigbeeDeviceEventInfo = {
        event: ZigbeeDeviceEvent.JOINED,
        cid: '00112233445566AA',
        timestamp: Date.now(),
      };

      expect(isValidZigbeeEvent(event)).toBe(false);
    });

    it('rejects wrong-length CID', () => {
      const event: ZigbeeDeviceEventInfo = {
        event: ZigbeeDeviceEvent.JOINED,
        cid: '00112233445566',
        timestamp: Date.now(),
      };

      expect(isValidZigbeeEvent(event)).toBe(false);
    });

    it('accepts all valid event types', () => {
      const events = [
        ZigbeeDeviceEvent.JOINED,
        ZigbeeDeviceEvent.LEFT,
        ZigbeeDeviceEvent.ONLINE,
        ZigbeeDeviceEvent.OFFLINE,
      ];

      for (const eventType of events) {
        const event: ZigbeeDeviceEventInfo = {
          event: eventType,
          cid: '00112233445566aa',
          timestamp: Date.now(),
        };
        expect(isValidZigbeeEvent(event)).toBe(true);
      }
    });
  });

  describe('batchProcessZigbeeEvents', () => {
    it('groups events by joined/left', () => {
      const events: ZigbeeDeviceEventInfo[] = [
        {
          event: ZigbeeDeviceEvent.JOINED,
          cid: '00112233445566aa',
          timestamp: Date.now(),
        },
        {
          event: ZigbeeDeviceEvent.JOINED,
          cid: '00112233445566bb',
          timestamp: Date.now(),
        },
        {
          event: ZigbeeDeviceEvent.LEFT,
          cid: '00112233445566cc',
          timestamp: Date.now(),
        },
      ];

      const result = batchProcessZigbeeEvents(events, log);

      expect(result.joined).toEqual(['00112233445566aa', '00112233445566bb']);
      expect(result.left).toEqual(['00112233445566cc']);
    });

    it('filters out invalid events', () => {
      const events: ZigbeeDeviceEventInfo[] = [
        {
          event: ZigbeeDeviceEvent.JOINED,
          cid: '00112233445566aa',
          timestamp: Date.now(),
        },
        {
          event: ZigbeeDeviceEvent.JOINED,
          cid: 'INVALID',
          timestamp: Date.now(),
        },
      ];

      const result = batchProcessZigbeeEvents(events, log);

      expect(result.joined).toEqual(['00112233445566aa']);
      const warnSpy = log.warn as jest.MockedFunction<typeof log.warn>;
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid Zigbee event'));
    });

    it('handles empty event array', () => {
      const result = batchProcessZigbeeEvents([], log);

      expect(result.joined).toEqual([]);
      expect(result.left).toEqual([]);
    });
  });

  describe('logEventProcessingSummary', () => {
    it('logs event counts', () => {
      logEventProcessingSummary(
        ['00112233445566aa', '00112233445566bb'],
        ['00112233445566cc'],
        log,
      );

      const debugSpy = log.debug as jest.MockedFunction<typeof log.debug>;
      const calls = debugSpy.mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('2 joined'))).toBe(true);
      expect(calls.some(c => c.includes('1 left'))).toBe(true);
    });

    it('does not log when no events', () => {
      logEventProcessingSummary([], [], log);

      const debugSpy = log.debug as jest.MockedFunction<typeof log.debug>;
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('lists CIDs in debug output', () => {
      logEventProcessingSummary(
        ['00112233445566aa', '00112233445566bb'],
        ['00112233445566cc'],
        log,
      );

      const debugSpy = log.debug as jest.MockedFunction<typeof log.debug>;
      const calls = debugSpy.mock.calls.map(c => String(c[0]));

      const joinedCall = calls.find(c => c.includes('Joined'));
      expect(joinedCall).toContain('00112233445566aa');
      expect(joinedCall).toContain('00112233445566bb');

      const leftCall = calls.find(c => c.includes('Left'));
      expect(leftCall).toContain('00112233445566cc');
    });
  });

  describe('setupZigbeeEventMonitoring', () => {
    it('sets up change listener and calls callback on events', () => {
      const mockGateway = new EventEmitter();
      const callback = jest.fn();

      setupZigbeeEventMonitoring(mockGateway as any, 'gw_001', callback, log);

      // Emit a change event with join
      mockGateway.emit('change', {
        subdev_event: 'join',
        cid: '00112233445566aa',
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: ZigbeeDeviceEvent.JOINED,
          cid: '00112233445566aa',
          gatewayId: 'gw_001',
        }),
      );
    });

    it('logs event when detected', () => {
      const mockGateway = new EventEmitter();
      const callback = jest.fn();

      setupZigbeeEventMonitoring(mockGateway as any, 'gw_001', callback, log);

      mockGateway.emit('change', {
        subdev_event: 'leave',
        cid: '00112233445566aa',
      });

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('child device left'),
      );
    });

    it('returns cleanup function that removes listener', () => {
      const mockGateway = new EventEmitter();
      const callback = jest.fn();

      const cleanup = setupZigbeeEventMonitoring(mockGateway as any, 'gw_001', callback, log);

      // Emit before cleanup
      mockGateway.emit('change', { subdev_event: 'join', cid: '00112233445566aa' });
      expect(callback).toHaveBeenCalledTimes(1);

      // Call cleanup
      cleanup();

      // Emit after cleanup
      mockGateway.emit('change', { subdev_event: 'join', cid: '00112233445566bb' });
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, callback not called again
    });

    it('handles multiple events in single change', () => {
      const mockGateway = new EventEmitter();
      const callback = jest.fn();

      setupZigbeeEventMonitoring(mockGateway as any, 'gw_001', callback, log);

      // Emit with subdev_list (multiple children)
      mockGateway.emit('change', {
        subdev_list: [
          { cid: '00112233445566aa', online: 1 },
          { cid: '00112233445566bb', online: 0 },
        ],
      });

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('respects gateway ID in logging', () => {
      const mockGateway = new EventEmitter();
      const callback = jest.fn();

      setupZigbeeEventMonitoring(mockGateway as any, 'custom_gw', callback, log);

      mockGateway.emit('change', { subdev_event: 'join', cid: '00112233445566aa' });

      const infoSpy = log.info as jest.MockedFunction<typeof log.info>;
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom_gw'),
      );
    });
  });
});
