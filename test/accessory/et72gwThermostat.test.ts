import { jest } from '@jest/globals';
import ThermostatAccessory from '../../src/accessory/ThermostatAccessory';
import TuyaDevice from '../../src/device/TuyaDevice';
import { initLogger } from '../../src/util/Logger';
import { TuyaPlatform } from '../../src/platform';

class MockHapStatusError extends Error {
  constructor(public hapStatus: number) { super(String(hapStatus)); }
}
const deviceID = 'et72gw-test-device';
const schemaOverride = {
  code: 'temp_set', property: { unit: '°C', min: 50, max: 400, scale: 1, step: 1 },
  onGet: '(value - 320) * 5 / 9', onSet: 'Math.round(value * 9 / 5 + 320)',
};
const payload = () => ({ properties: [
  { code: 'FloorTemper', dpId: 106, value: 820, time: Date.now() - 240000 },
  { code: 'RoomTemper', dpId: 105, value: 740, time: Date.now() - 240000 },
  { code: 'SetTemp', dpId: 102, value: 800, time: Date.now() - 240000 },
  { code: 'TemperUnitChange', dpId: 107, value: true, time: Date.now() - 1000000 },
  { code: 'work_status', dpId: 118, value: false, time: Date.now() - 240000 },
  { code: 'power1', dpId: 101, value: true, time: Date.now() - 1000000 },
] });

describe('ET-72GW thermostat integration with original overrides', () => {
  const handlers: ThermostatAccessory[] = [];
  beforeEach(() => {
    jest.useFakeTimers({ now: 1800000000000 });
    initLogger({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() });
  });
  afterEach(() => { handlers.forEach(handler => handler.dispose()); handlers.length = 0; jest.useRealTimers(); });

  const setup = (enabled = true, product = 'm2dkohai78cwr3yd', configID = deviceID, heating = false) => {
    const characteristics = new Map<any, any>();
    const makeCharacteristic = (type: any) => {
      const c: any = {
        UUID: type?.UUID ?? type, value: null,
        onGet: jest.fn((get: any) => { c.getHandler = get; return c; }),
        onSet: jest.fn((set: any) => { c.setHandler = set; return c; }),
        setProps: jest.fn(() => c),
        updateValue: jest.fn((value: any) => { c.value = value; return c; }),
      };
      characteristics.set(type, c); return c;
    };
    const services: any[] = [];
    const accessory: any = {
      UUID: 'existing-accessory-uuid', context: { deviceID }, services,
      getService: (type: any) => services.find(s => s.UUID === type),
      addService: (type: any) => {
        const s: any = {
          UUID: type, characteristics: [],
          getCharacteristic: (key: any) => {
            const c = characteristics.get(key) || makeCharacteristic(key);
            if (!s.characteristics.includes(c)) { s.characteristics.push(c); }
            return c;
          },
          setCharacteristic: () => s,
          testCharacteristic: () => true,
        };
        services.push(s); return s;
      },
    };
    const device = new TuyaDevice({
      id: deviceID, uuid: 'existing-device-uuid', name: 'Floor thermostat', online: true,
      product_id: product, category: 'wk', schema: [
        { code: 'temp_set', mode: 'rw', type: 'Integer', property: { min: 500, max: 1040, scale: 1, step: 1, unit: '°F' } },
        { code: 'temp_unit_convert', mode: 'rw', type: 'Enum', property: { range: ['c', 'f'] } },
      ], status: [{ code: 'temp_set', value: 800 }, { code: 'temp_unit_convert', value: 'f' }],
    } as any);
    if (heating) {
      device.schema.push(
        { code: 'switch', mode: 'rw', type: 'Boolean', property: {} } as any,
        { code: 'mode', mode: 'rw', type: 'Enum', property: { range: ['hot', 'auto'] } } as any,
      );
      device.status.push({ code: 'switch', value: true }, { code: 'mode', value: 'hot' });
    }
    const shadow = jest.fn<() => Promise<unknown>>().mockResolvedValue(payload());
    const commands = jest.fn();
    const characteristic: any = {
      CurrentHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2 }, TargetHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 },
      CurrentTemperature: 'CurrentTemperature', TargetTemperature: 'TargetTemperature', TemperatureDisplayUnits: { CELSIUS: 0, FAHRENHEIT: 1 },
      StatusLowBattery: {}, ChargingState: {}, ProgrammableSwitchEvent: { UUID: 'event' },
    };
    for (const name of ['Manufacturer', 'Model', 'Name', 'ConfiguredName', 'SerialNumber']) { characteristic[name] = name; }
    const platform: any = {
      api: { hap: {
        Characteristic: characteristic, Service: { AccessoryInformation: 'Info', Battery: 'Battery', Thermostat: 'Thermostat' },
        HapStatusError: MockHapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
      } },
      options: { deviceOverrides: [{ id: configID, schema: [schemaOverride], et72gwCloudMeasurements: { enabled } }] },
      deviceManager: { getDevice: () => device, api: { getDeviceShadow: shadow }, sendCommands: commands },
      getDeviceConfig: TuyaPlatform.prototype.getDeviceConfig,
      getDeviceSchemaConfig: TuyaPlatform.prototype.getDeviceSchemaConfig,
    };
    const handler = new ThermostatAccessory(platform, accessory);
    handlers.push(handler); handler.configureServices();
    return {
      handler, accessory, platform, device, shadow, commands,
      current: characteristics.get('CurrentTemperature'), target: characteristics.get('TargetTemperature'),
      state: characteristics.get(characteristic.CurrentHeatingCoolingState),
      targetState: characteristics.get(characteristic.TargetHeatingCoolingState),
    };
  };

  test('actual floor replaces setpoint, leaves state/identities/cache untouched, and never sends commands', async () => {
    const t = setup();
    expect(() => t.current.getHandler()).toThrow(MockHapStatusError);
    expect(t.current.value).toBeInstanceOf(MockHapStatusError);
    await jest.advanceTimersByTimeAsync(0);
    expect(t.current.getHandler()).toBeCloseTo(27.7777778);
    expect(t.current.value).toBeCloseTo(27.7777778);
    expect(t.target.getHandler()).toBeCloseTo(26.6666667);
    expect(t.state.getHandler()).toBe(0); // Explicit idle relay, regardless of the unchanged target mode.
    expect(t.device.status.find(s => s.code === 'temp_set')?.value).toBe(800);
    expect(t.accessory.UUID).toBe('existing-accessory-uuid');
    expect(t.accessory.context.deviceID).toBe(deviceID);
    for (let i = 0; i < 20; i++) { t.current.getHandler(); }
    expect(t.shadow).toHaveBeenCalledTimes(1);
    expect(t.commands).not.toHaveBeenCalled();
    t.device.online = false;
    await t.handler.onDeviceInfoUpdate({});
    expect(() => t.current.getHandler()).toThrow(MockHapStatusError);
    expect(t.current.value).toBeInstanceOf(MockHapStatusError);
  });

  test('relay notifications never turn idle into a target-mode or setpoint change', async () => {
    const t = setup(true, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    expect(t.state.value).toBe(0);
    const before = JSON.stringify(t.device.status);
    const mode = t.targetState.getHandler();
    const target = t.target.getHandler();
    for (const active of [true, false, true]) {
      t.shadow.mockImplementation(async () => ({ properties: payload().properties.map(p => p.dpId === 118 ? { ...p, value: active } : p) }));
      await jest.advanceTimersByTimeAsync(300000);
      expect(t.state.getHandler()).toBe(active ? 1 : 0);
      expect(t.state.updateValue).toHaveBeenLastCalledWith(active ? 1 : 0);
      expect(t.targetState.getHandler()).toBe(mode);
      expect(t.target.getHandler()).toBe(target);
      expect(JSON.stringify(t.device.status)).toBe(before);
    }
    expect(t.shadow).toHaveBeenCalledTimes(4); // One response supplies both readings.
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('shadow power-off dominates active relay without changing configured heat mode', async () => {
    const t = setup(true, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    t.shadow.mockImplementation(async () => ({ properties: payload().properties.map(p => p.dpId === 118 ? { ...p, value: true }
      : p.dpId === 101 ? { ...p, value: false } : p) }));
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.state.getHandler()).toBe(0);
    expect(t.targetState.getHandler()).toBe(1);
    expect(t.device.status.find(s => s.code === 'switch')?.value).toBe(true);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('timestamped shadow power is authoritative over an untimestamped legacy power cache', async () => {
    const t = setup(true, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    t.device.status.find(s => s.code === 'switch')!.value = false;
    t.shadow.mockImplementation(async () => ({ properties: payload().properties.map(p => p.dpId === 118 ? { ...p, value: true } : p) }));
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.state.getHandler()).toBe(1); // Actual shadow power=true/relay=true.
    expect(t.targetState.getHandler()).toBe(0); // Existing target-mode semantics remain untouched.
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('missing relay publishes unavailable rather than inferring activity from temperature', async () => {
    const t = setup(); await jest.advanceTimersByTimeAsync(0);
    t.shadow.mockResolvedValue({ properties: payload().properties.filter(p => p.dpId !== 118) });
    await jest.advanceTimersByTimeAsync(300000);
    expect(() => t.state.getHandler()).toThrow(MockHapStatusError);
    expect(t.state.value).toBeInstanceOf(MockHapStatusError);
    expect(t.current.getHandler()).toBeCloseTo(27.77778);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test.each([false, true])('target conversion and exact command payload stay unchanged with opt-in=%s', async enabled => {
    const t = setup(enabled);
    await jest.advanceTimersByTimeAsync(0);
    expect(t.target.getHandler()).toBeCloseTo(26.6666667);
    await t.target.setHandler(27.3); // Mock command spy only: never connected to a device.
    expect(t.commands).toHaveBeenCalledTimes(1);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 811 }]);
    expect(t.target.getHandler()).toBeCloseTo((811 - 320) * 5 / 9 / 10);
    if (enabled) { expect(t.current.getHandler()).toBeCloseTo(27.7777778); }
  });

  test.each([false, true])('existing heating commands remain unchanged with opt-in=%s', async enabled => {
    const t = setup(enabled, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    await t.targetState.setHandler(0);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'switch', value: false }]);
    await t.targetState.setHandler(1);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'switch', value: true }, { code: 'mode', value: 'hot' }]);
    expect(t.commands).toHaveBeenCalledTimes(2);
  });

  test.each([
    [false, 'm2dkohai78cwr3yd', deviceID],
    [true, 'unrelated-product', deviceID],
    [true, 'm2dkohai78cwr3yd', 'global'],
    [true, 'm2dkohai78cwr3yd', 'm2dkohai78cwr3yd'],
  ])('does not activate for enabled=%s/product=%s/config=%s', async (enabled, product, id) => {
    const t = setup(enabled, product, id);
    const legacyValue = t.current.getHandler();
    await jest.advanceTimersByTimeAsync(900000);
    expect(t.shadow).not.toHaveBeenCalled();
    expect(t.current.getHandler()).toBe(legacyValue);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('cache expiry publishes unavailable without replacing it with setpoint; dispose cancels polling', async () => {
    const t = setup();
    await jest.advanceTimersByTimeAsync(0);
    t.shadow.mockRejectedValue(new Error('mock timeout'));
    await jest.advanceTimersByTimeAsync(900000);
    expect(() => t.current.getHandler()).toThrow(MockHapStatusError);
    expect(t.current.value).toBeInstanceOf(MockHapStatusError);
    expect(t.state.value).toBeInstanceOf(MockHapStatusError);
    expect(() => t.state.getHandler()).toThrow(MockHapStatusError);
    const calls = t.shadow.mock.calls.length;
    t.handler.dispose();
    await jest.advanceTimersByTimeAsync(900000);
    expect(t.shadow).toHaveBeenCalledTimes(calls);
    expect(t.commands).not.toHaveBeenCalled();
  });
});
