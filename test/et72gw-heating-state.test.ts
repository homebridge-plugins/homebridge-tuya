import { jest } from '@jest/globals';
import { ET72GWMeasurements } from '../src/device/ET72GWMeasurements';
import { ShadowReadError } from '../src/core/TuyaOpenAPI';

const now = 1800000000000;
const options = { pollIntervalSeconds: 300, maxCacheAgeSeconds: 900, maxReportAgeSeconds: 0, maxHeatingReportAgeSeconds: 0 };
const payload = (active = true, powered = true, time = now - 240000) => ({ properties: [
  { code: 'FloorTemper', dpId: 106, value: 820, time },
  { code: 'TemperUnitChange', dpId: 107, value: true, time: time - 1000000 },
  { code: 'work_status', dpId: 118, value: active, time },
  { code: 'power1', dpId: 101, value: powered, time: time - 1000000 },
] });

describe('ET-72GW relay/power cache on the single shadow response', () => {
  let adapter: ET72GWMeasurements;
  let read: jest.Mock<() => Promise<unknown>>;
  let changed: jest.Mock;
  let online: boolean;
  beforeEach(() => {
    jest.useFakeTimers({ now }); online = true;
    read = jest.fn<() => Promise<unknown>>().mockResolvedValue(payload()); changed = jest.fn();
    adapter = new ET72GWMeasurements(read, options, changed, () => online);
  });
  afterEach(() => { adapter.stop(); jest.restoreAllMocks(); jest.useRealTimers(); });
  test.each([[true,true,true],[false,true,false],[true,false,false],[false,false,false]])(
    'relay=%s power=%s reports heating=%s', async (relay,power,expected) => {
      read.mockResolvedValue(payload(relay,power)); await adapter.refresh();
      expect(adapter.currentHeating()).toMatchObject({ heating: expected, relayActive: relay, powered: power, measuredAt: now - 240000 });
      expect(adapter.currentFloor()?.celsius).toBeCloseTo(27.7778);
      expect(read).toHaveBeenCalledTimes(1);
    });
  test('not available before a valid report or while offline', async () => {
    expect(adapter.currentHeating()).toBeUndefined(); await adapter.refresh(); online = false;
    expect(adapter.currentHeating()).toBeUndefined();
  });
  test.each([
    ['missing relay', (p: any[]) => p.filter(x => x.dpId!==118)],
    ['missing power', (p: any[]) => p.filter(x => x.dpId!==101)],
    ['string relay', (p: any[]) => p.map(x => x.dpId===118 ? {...x,value:'true'} : x)],
    ['numeric power', (p: any[]) => p.map(x => x.dpId===101 ? {...x,value:0} : x)],
    ['null relay', (p: any[]) => p.map(x => x.dpId===118 ? {...x,value:null} : x)],
    ['duplicate relay', (p: any[]) => [...p,p.find(x => x.dpId===118)]],
    ['wrong code', (p: any[]) => p.map(x => x.dpId===118 ? {...x,code:'other'} : x)],
    ['conflicting ID', (p: any[]) => p.map(x => x.dpId===118 ? {...x,dp_id:101} : x)],
    ['invalid time', (p: any[]) => p.map(x => x.dpId===118 ? {...x,time:0} : x)],
    ['future time', (p: any[]) => p.map(x => x.dpId===118 ? {...x,time:Date.now()+60001} : x)],
  ])('rejects %s without losing a valid floor measurement', async (_name, corrupt) => {
    await adapter.refresh(); await jest.advanceTimersByTimeAsync(300000);
    read.mockResolvedValue({properties:corrupt(payload().properties)}); await adapter.refresh();
    expect(adapter.currentHeating()).toBeUndefined(); expect(adapter.currentFloor()).toBeDefined();
  });
  test('valid relay/power still available when floor data is missing', async () => {
    read.mockResolvedValue({properties:payload().properties.filter(p=>p.dpId!==106)}); await adapter.refresh();
    expect(adapter.currentFloor()).toBeUndefined(); expect(adapter.currentHeating()?.heating).toBe(true);
  });
  test('idle-active-idle transitions retain original timestamps and notify once per retrieval', async () => {
    for (const [index,active] of [false,true,false].entries()) {
      if (index) { await jest.advanceTimersByTimeAsync(300000); }
      read.mockResolvedValue(payload(active,true,Date.now())); await adapter.refresh();
      expect(adapter.currentHeating()?.heating).toBe(active);
      expect(adapter.currentHeating()?.measuredAt).toBe(Date.now());
    }
    expect(read).toHaveBeenCalledTimes(3); expect(changed).toHaveBeenCalledTimes(3);
  });
  test('cache expires even if the last relay was active, with a notification', async () => {
    await adapter.refresh(); await jest.advanceTimersByTimeAsync(900000);
    expect(adapter.currentHeating()).toBeUndefined(); expect(changed).toHaveBeenCalledTimes(2);
  });
  test('unchanged old relay timestamp is permitted by default, but report-age policy can reject it', async () => {
    read.mockResolvedValue(payload(false,true,now-86400000)); await adapter.refresh();
    expect(adapter.currentHeating()?.heating).toBe(false);
    adapter.stop();
    adapter=new ET72GWMeasurements(read,{...options,maxHeatingReportAgeSeconds:600},changed,()=>online);
    await adapter.refresh(); expect(adapter.currentHeating()).toBeUndefined(); expect(adapter.currentFloor()).toBeDefined();
  });
  test('strict relay age expires independently of floor and ignores old power-setting time', async () => {
    adapter=new ET72GWMeasurements(read,{...options,maxHeatingReportAgeSeconds:300},changed,()=>online);
    await adapter.refresh(); await jest.advanceTimersByTimeAsync(60000);
    expect(adapter.currentHeating()).toBeUndefined(); expect(adapter.currentFloor()).toBeDefined();
    expect(changed).toHaveBeenCalledTimes(2);
  });
  test.each([118,101])('rejects DP %s regression and conflicting values, preserving independent history',async id=>{
    await adapter.refresh();
    await jest.advanceTimersByTimeAsync(300000);
    const older=payload().properties.map(p=>p.dpId===id?{...p,time:p.time-1}:p);
    read.mockResolvedValue({properties:older});await adapter.refresh();expect(adapter.currentHeating()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(300000);
    const conflict=payload().properties.map(p=>p.dpId===id?{...p,value:false}:p);
    read.mockResolvedValue({properties:conflict});await adapter.refresh();expect(adapter.currentHeating()).toBeUndefined();
  });
  test('independent power/relay timestamps are valid; power off dominates and regressions remain invalid',async()=>{
    const off=payload(true,false,now-1);off.properties=off.properties.map(p=>p.dpId===101?{...p,time:now}:p);
    read.mockResolvedValue(off);await adapter.refresh();expect(adapter.currentHeating()?.heating).toBe(false);
    await jest.advanceTimersByTimeAsync(300000);
    const on=payload(true,true,now-1);on.properties=on.properties.map(p=>p.dpId===101?{...p,time:now+1}:p);
    read.mockResolvedValue(on);await adapter.refresh();expect(adapter.currentHeating()?.heating).toBe(true);
    await jest.advanceTimersByTimeAsync(300000);
    read.mockResolvedValue(off);await adapter.refresh();expect(adapter.currentHeating()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(300000);
    const consistent=payload(true,true,Date.now());consistent.properties=consistent.properties.map(p=>p.dpId===101?{...p,time:now+1}:p);
    read.mockResolvedValue(consistent);await adapter.refresh();expect(adapter.currentHeating()?.heating).toBe(true);
  });
  test.each([true, false])('a newer true power timestamp does not invalidate unchanged relay=%s', async active => {
    read.mockResolvedValue(payload(active)); await adapter.refresh();
    const oldTime = adapter.currentHeating()!.measuredAt;
    await jest.advanceTimersByTimeAsync(300000);
    read.mockResolvedValue({ properties: payload(active).properties.map(p => p.dpId === 101 ? { ...p, time: Date.now() } : p) });
    await adapter.refresh();
    expect(adapter.currentHeating()).toMatchObject({ heating: active, measuredAt: oldTime, powerMeasuredAt: Date.now() });
    expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(900000);
    expect(adapter.currentHeating()).toBeUndefined();
  });

  test.each(['transport','authorization'] as const)('handles %s using the common lifecycle without extra requests',async kind=>{
    await adapter.refresh();await jest.advanceTimersByTimeAsync(300000);
    read.mockRejectedValue(new ShadowReadError(kind));await adapter.refresh();
    expect(Boolean(adapter.currentHeating())).toBe(kind==='transport');
    await jest.advanceTimersByTimeAsync(600000);expect(adapter.currentHeating()).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
  test('slightly early timer is rescheduled for the remaining cooldown instead of skipping a poll',async()=>{
    const timer=jest.spyOn(global,'setTimeout');adapter.start();await jest.advanceTimersByTimeAsync(0);
    const index=timer.mock.calls.findIndex(args=>args[1]===300000);
    const callback=timer.mock.calls[index][0] as ()=>void;
    clearTimeout(timer.mock.results[index].value as ReturnType<typeof setTimeout>);
    await jest.advanceTimersByTimeAsync(299998);callback();await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2);expect(read).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(300000);expect(read).toHaveBeenCalledTimes(3);
  });
  test('a delayed host timer runs one request, without catch-up or duplicate requests',async()=>{
    const timer=jest.spyOn(global,'setTimeout');adapter.start();await jest.advanceTimersByTimeAsync(0);
    const index=timer.mock.calls.findIndex(args=>args[1]===300000);
    const callback=timer.mock.calls[index][0] as ()=>void;
    clearTimeout(timer.mock.results[index].value as ReturnType<typeof setTimeout>);
    await jest.advanceTimersByTimeAsync(1800000);callback();await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);await adapter.refresh();expect(read).toHaveBeenCalledTimes(2);
  });
});
