import { jest } from '@jest/globals';
import { ET72GWMeasurements, ET72GWMeasurementOptions } from '../src/device/ET72GWMeasurements';
import { ShadowReadError } from '../src/core/TuyaOpenAPI';

const now = 1800000000000;
const options: ET72GWMeasurementOptions = { pollIntervalSeconds: 300, maxCacheAgeSeconds: 900, maxReportAgeSeconds: 0, maxHeatingReportAgeSeconds: 0 };
const fixture = (value = 820, fahrenheit = true, time = now - 240000) => ({ properties: [
  { code: 'FloorTemper', dpId: 106, value, time },
  { code: 'RoomTemper', dpId: 105, value: 740, time },
  { code: 'SetTemp', dpId: 102, value: 800, time },
  { code: 'TemperUnitChange', dpId: 107, value: fahrenheit, time: time - 1000000 },
  { code: 'work_status', dpId: 118, value: false, time },
] });

describe('ET-72GW read-only floor cache', () => {
  let adapter: ET72GWMeasurements;
  let read: jest.Mock<() => Promise<unknown>>;
  let changed: jest.Mock<() => void>;
  let online: boolean;
  beforeEach(() => {
    jest.useFakeTimers({ now });
    read = jest.fn<() => Promise<unknown>>().mockResolvedValue(fixture());
    changed = jest.fn();
    online = true;
    adapter = new ET72GWMeasurements(read, options, changed, () => online);
  });
  afterEach(() => { adapter.stop(); jest.useRealTimers(); });

  test.each([[820, true, 27.7777778], [320, true, 0], [250, false, 25], [0, false, 0], [-50, false, -5]])(
    'converts %s in unit %s to Celsius', async (raw, unit, expected) => {
      read.mockResolvedValue(fixture(raw, unit));
      await adapter.refresh();
      expect(adapter.currentFloor()?.celsius).toBeCloseTo(expected);
      expect(adapter.currentFloor()?.measuredAt).toBe(now - 240000);
    });

  test('logs failure categories once and recovery without exposing exception contents', async () => {
    const log = { warn: jest.fn(), info: jest.fn() };
    adapter = new ET72GWMeasurements(read, options, changed, () => online, log);
    read.mockRejectedValue(new Error('sensitive response must never be logged'));
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenLastCalledWith('ET-72GW cloud measurement refresh failed (%s).', 'transport');
    read.mockResolvedValue({ properties: [...fixture().properties,
      { code: 'power1', dpId: 101, value: true, time: now - 1000000 },
    ] });
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('ET-72GW cloud measurement refresh recovered.');
    read.mockResolvedValue({ properties: [] });
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(log.warn).toHaveBeenLastCalledWith('ET-72GW cloud measurement refresh failed (%s).', 'data');
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('sensitive');
  });

  test('single flight, bounded polling, no requests from getters, and no catch-up after stop', async () => {
    let resolve!: (value: unknown) => void;
    read.mockReturnValue(new Promise(r => { resolve = r; }));
    adapter.start();
    const flight = adapter.refresh();
    expect(adapter.refresh()).toBe(flight);
    await jest.advanceTimersByTimeAsync(900000);
    expect(read).toHaveBeenCalledTimes(1);
    resolve(fixture());
    await flight;
    for (let i = 0; i < 30; i++) { adapter.currentFloor(); }
    expect(read).toHaveBeenCalledTimes(1);
    adapter.stop();
    await jest.advanceTimersByTimeAsync(900000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('normal polling is once per interval; failures have no immediate retry', async () => {
    read.mockRejectedValue(new ShadowReadError('transport'));
    adapter.start();
    await jest.advanceTimersByTimeAsync(299999);
    expect(read).toHaveBeenCalledTimes(1);
    await adapter.refresh();
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('cache expiration uses time since successful retrieval and publishes an expiry notification', async () => {
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(899999);
    expect(adapter.currentFloor()).toBeDefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(adapter.currentFloor()).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  test('default accepts unchanged report timestamps after a new successful retrieval', async () => {
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(86400000);
    expect(adapter.currentFloor()).toBeUndefined();
    await adapter.refresh();
    expect(adapter.currentFloor()?.celsius).toBeCloseTo(27.77778);
  });

  test('optional strict report-age limit is independent of successful polling', async () => {
    adapter = new ET72GWMeasurements(read, { ...options, maxReportAgeSeconds: 600 }, changed, () => online);
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(359999);
    expect(adapter.currentFloor()).toBeDefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(adapter.currentFloor()).toBeUndefined();
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
  });

  test.each([
    ['missing properties', {}],
    ['missing floor', { properties: fixture().properties.filter(p => p.dpId !== 106) }],
    ['missing unit', { properties: fixture().properties.filter(p => p.dpId !== 107) }],
    ['duplicate floor', { properties: [...fixture().properties, fixture().properties[0]] }],
    ['string raw', { properties: [{ ...fixture().properties[0], value: '820' }, ...fixture().properties.slice(1)] }],
    ['non-boolean unit', { properties: fixture().properties.map(p => p.dpId === 107 ? { ...p, value: 'true' } : p) }],
    ['future floor', fixture(820, true, now + 300000 + 60001)],
    ['zero timestamp', fixture(820, true, 0)],
    ['invalid timestamp', fixture(820, true, NaN)],
    ['outside HAP range', fixture(1000000)],
    ['unit newer than floor', { properties: fixture().properties.map(p => p.dpId === 107 ? { ...p, time: now } : p) }],
    ['wrong DP', { properties: fixture().properties.map(p => p.dpId === 106 ? { ...p, dpId: 105 } : p) }],
    ['conflicting aliases', { properties: fixture().properties.map(p => p.dpId === 106 ? { ...p, dp_id: 105 } : p) }],
  ])('invalidates prior measurement on %s', async (_name, malformed) => {
    await adapter.refresh();
    read.mockResolvedValue(malformed);
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
  });

  test('accepts dp_id spelling and old unchanged unit metadata', async () => {
    read.mockResolvedValue({ properties: fixture().properties.map(({ dpId, ...p }) => ({ ...p, dp_id: dpId })) });
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeDefined();
  });

  test.each([fixture(820, true, now - 250000), fixture(830), fixture(820, false)])(
    'rejects regressing or conflicting samples without changing the high-water timestamp', async result => {
      await adapter.refresh();
      read.mockResolvedValue(result);
      await jest.advanceTimersByTimeAsync(300000);
      await adapter.refresh();
      expect(adapter.currentFloor()).toBeUndefined();
      read.mockResolvedValue(fixture());
      await jest.advanceTimersByTimeAsync(300000);
      await adapter.refresh();
      expect(adapter.currentFloor()).toBeDefined();
    });

  test('transport failure retains only a still-valid cached sample; offline hides it', async () => {
    await adapter.refresh();
    read.mockRejectedValue(new ShadowReadError('transport'));
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeDefined();
    online = false;
    expect(adapter.currentFloor()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(600000);
    online = true;
    expect(adapter.currentFloor()).toBeUndefined();
  });

  test('authorization failure makes measurement unavailable and stops future requests', async () => {
    await adapter.refresh();
    read.mockRejectedValue(new ShadowReadError('authorization'));
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(900000);
    await adapter.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('respects rate-limit cooldown and does not request when offline', async () => {
    read.mockRejectedValueOnce(new ShadowReadError('rate-limit', 1200));
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(900000);
    online = false;
    await adapter.refresh();
    expect(read).toHaveBeenCalledTimes(1);
    online = true;
    await adapter.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  test.each(['regressed', 'conflicting'])('rejects %s unit metadata even with a newer floor report', async mode => {
    await adapter.refresh();
    const updated = fixture(250, false, now);
    updated.properties = updated.properties.map(p => p.dpId === 107 ? { ...p, time: now - 1 } : p);
    read.mockResolvedValue(updated);
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()?.celsius).toBe(25);
    const regressed = fixture(820, true, now + 1);
    regressed.properties = regressed.properties.map(p => p.dpId === 107
      ? { ...p, time: mode === 'regressed' ? now - 2 : now - 1 } : p);
    read.mockResolvedValue(regressed);
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
  });

  test.each(['old-floor', 'missing-floor', 'invalid-floor'])('remembers a unit switch despite %s and never resurrects the old unit', async mode => {
    await adapter.refresh();
    const switched = fixture(250, false);
    switched.properties = switched.properties.map(p => p.dpId === 107 ? { ...p, time: now - 1 } : p);
    if (mode === 'missing-floor') { switched.properties = switched.properties.filter(p => p.dpId !== 106); }
    if (mode === 'invalid-floor') {
      switched.properties = switched.properties.map(p => p.dpId === 106 ? { ...p, value: NaN } : p);
    }
    read.mockResolvedValue(switched);
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
    read.mockResolvedValue(fixture());
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined();
    const consistent = fixture(250, false, now);
    consistent.properties = consistent.properties.map(p => p.dpId === 107 ? { ...p, time: now - 1 } : p);
    read.mockResolvedValue(consistent);
    await jest.advanceTimersByTimeAsync(300000);
    await adapter.refresh();
    expect(adapter.currentFloor()?.celsius).toBe(25);
  });

  test('stopping while a request is pending prevents updates and timer resurrection', async () => {
    let resolve!: (value: unknown) => void;
    read.mockReturnValue(new Promise(r => { resolve = r; }));
    const pending = adapter.refresh();
    adapter.stop();
    resolve(fixture());
    await pending;
    expect(changed).not.toHaveBeenCalled();
    expect(adapter.currentFloor()).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
