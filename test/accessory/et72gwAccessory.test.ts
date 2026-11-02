import { jest } from '@jest/globals';
import ThermostatAccessory from '../../src/accessory/ThermostatAccessory';
import ET72GWAccessory from '../../src/accessory/ET72GWAccessory';
import AccessoryFactory from '../../src/accessory/AccessoryFactory';
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
  { code: 'ControlMode', dpId: 103, value: 'Manual', time: Date.now() - 240000 },
  { code: 'FloorTemper', dpId: 106, value: 820, time: Date.now() - 240000 },
  { code: 'RoomTemper', dpId: 105, value: 740, time: Date.now() - 240000 },
  { code: 'SetTemp', dpId: 102, value: 800, time: Date.now() - 240000 },
  { code: 'TemperUnitChange', dpId: 107, value: true, time: Date.now() - 1000000 },
  { code: 'work_status', dpId: 118, value: false, time: Date.now() - 240000 },
  { code: 'power1', dpId: 101, value: true, time: Date.now() - 1000000 },
] });

describe('automatically recognized ET-72GW accessory', () => {
  const handlers: ThermostatAccessory[] = [];
  beforeEach(() => {
    jest.useFakeTimers({ now: 1800000000000 });
    initLogger({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() });
  });
  afterEach(() => { handlers.forEach(handler => handler.dispose()); handlers.length = 0; jest.useRealTimers(); });

  const setup = (withOverride = false, product = 'm2dkohai78cwr3yd', configID = deviceID, heating = false) => {
    const characteristics = new Map<any, any>();
    const makeCharacteristic = (type: any) => {
      const c: any = {
        UUID: type?.UUID ?? type, value: null,
        onGet: jest.fn((get: any) => { c.getHandler = get; return c; }),
        onSet: jest.fn((set: any) => { c.setHandler = set; return c; }),
        setProps: jest.fn((props: any) => { c.props = props; return c; }),
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
        { code: 'temp_set', mode: 'rw', type: 'Integer', property: { min: 50, max: 400, scale: 1, step: 1, unit: '°C' } },
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
    const setMode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const characteristic: any = {
      CurrentHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2 }, TargetHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 },
      CurrentTemperature: 'CurrentTemperature', TargetTemperature: 'TargetTemperature', TemperatureDisplayUnits: { CELSIUS: 0, FAHRENHEIT: 1 },
      StatusLowBattery: {}, ChargingState: {}, ProgrammableSwitchEvent: { UUID: 'event' },
    };
    for (const name of ['Manufacturer', 'Model', 'Name', 'ConfiguredName', 'SerialNumber']) { characteristic[name] = name; }
    const platform: any = {
      api: { hap: {
        Characteristic: characteristic, Service: { AccessoryInformation: 'Info', Battery: 'Battery', Thermostat: 'Thermostat' },
        HapStatusError: MockHapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402, INVALID_VALUE_IN_REQUEST: -70410 },
      } },
      options: withOverride ? { deviceOverrides: [{ id: configID, schema: [schemaOverride] }] } : {},
      deviceManager: { getDevice: () => device, api: { getDeviceShadow: shadow, setDeviceControlMode: setMode }, sendCommands: commands },
      getDeviceConfig: TuyaPlatform.prototype.getDeviceConfig,
      getDeviceSchemaConfig: TuyaPlatform.prototype.getDeviceSchemaConfig,
    };
    const handler = AccessoryFactory.createAccessory(platform, accessory, device) as ThermostatAccessory;
    handlers.push(handler);
    return {
      handler, accessory, platform, device, shadow, commands, setMode,
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

  test('shadow power-off reports both relay and target off without changing cached legacy mode', async () => {
    const t = setup(true, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    t.shadow.mockImplementation(async () => ({ properties: payload().properties.map(p => p.dpId === 118 ? { ...p, value: true }
      : p.dpId === 101 ? { ...p, value: false } : p) }));
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.state.getHandler()).toBe(0);
    expect(t.targetState.getHandler()).toBe(0);
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
    expect(t.targetState.getHandler()).toBe(1); // Shadow power and Manual mode also govern target state.
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

  test.each([false, true])('target conversion and exact commands work with explicit override=%s', async withOverride => {
    const t = setup(withOverride);
    await jest.advanceTimersByTimeAsync(0);
    expect(t.target.getHandler()).toBeCloseTo(26.6666667);
    await t.target.setHandler(27.3); // Mock command spy only: never connected to a device.
    expect(t.commands).toHaveBeenCalledTimes(1);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 811 }]);
    expect(t.target.getHandler()).toBeCloseTo((811 - 320) * 5 / 9 / 10);
    expect(t.current.getHandler()).toBeCloseTo(27.7777778);
  });

  test.each([false, true])('existing heating commands remain unchanged with opt-in=%s', async enabled => {
    const t = setup(enabled, 'm2dkohai78cwr3yd', deviceID, true);
    await jest.advanceTimersByTimeAsync(0);
    await t.targetState.setHandler(0);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'switch', value: false }]);
    await t.targetState.setHandler(1);
    expect(t.setMode).toHaveBeenLastCalledWith(deviceID, 'Manual');
    expect(t.commands).toHaveBeenCalledTimes(1);
  });

  test('Manual and Smart map to Heat and Auto without issuing commands on refresh', async () => {
    const t = setup();
    await jest.advanceTimersByTimeAsync(0);
    expect(t.targetState.props.validValues).toEqual([0, 1, 3]);
    expect(t.targetState.getHandler()).toBe(1);
    t.shadow.mockResolvedValue({ properties: payload().properties.map(p => p.dpId === 103
      ? { ...p, value: 'Smart', time: Date.now() } : p) });
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.targetState.getHandler()).toBe(3);
    expect(t.targetState.updateValue).toHaveBeenLastCalledWith(3);
    expect(t.state.getHandler()).toBe(0);
    expect(t.commands).not.toHaveBeenCalled();
    expect(t.setMode).not.toHaveBeenCalled();
    expect(t.shadow).toHaveBeenCalledTimes(2);
  });

  test('explicit mode writes leave the setpoint alone and reject cooling/offline requests', async () => {
    const t = setup(); await jest.advanceTimersByTimeAsync(0);
    const target = t.target.getHandler();
    await t.targetState.setHandler(3);
    await t.targetState.setHandler(1);
    expect(t.setMode.mock.calls).toEqual([[deviceID, 'Smart'], [deviceID, 'Manual']]);
    await expect(t.targetState.setHandler(2)).rejects.toThrow(MockHapStatusError);
    t.device.online = false;
    await expect(t.targetState.setHandler(1)).rejects.toThrow(MockHapStatusError);
    expect(t.setMode).toHaveBeenCalledTimes(2);
    expect(t.commands).not.toHaveBeenCalled();
    expect(t.target.getHandler()).toBe(target);
  });

  test('failed mode commands propagate without changing other controls', async () => {
    const t = setup(); await jest.advanceTimersByTimeAsync(0);
    t.setMode.mockRejectedValue(new Error('rejected'));
    await expect(t.targetState.setHandler(1)).rejects.toThrow('rejected');
    expect(t.setMode).toHaveBeenCalledTimes(1);
    expect(t.commands).not.toHaveBeenCalled();
    expect(t.target.getHandler()).toBeCloseTo(26.6666667);
  });

  test.each(['missing', 'unknown', 'future', 'duplicate', 'conflicting', 'regressing', 'invalid-time', 'malformed'])('invalid %s mode is unavailable independently of floor and relay', async kind => {
    const t = setup(); await jest.advanceTimersByTimeAsync(0);
    let properties = payload().properties;
    if (kind === 'missing') { properties = properties.filter(p => p.dpId !== 103); }
    if (kind === 'unknown') { properties = properties.map(p => p.dpId === 103 ? { ...p, value: 'Anti_frozen' } : p); }
    if (kind === 'future') { properties = properties.map(p => p.dpId === 103 ? { ...p, time: Date.now() + 1000000 } : p); }
    if (kind === 'regressing') { properties = properties.map(p => p.dpId === 103 ? { ...p, time: p.time - 1 } : p); }
    if (kind === 'invalid-time') { properties = properties.map(p => p.dpId === 103 ? { ...p, time: 0 } : p); }
    if (kind === 'malformed') { properties = properties.map(p => p.dpId === 103 ? { ...p, value: 1 } : p); }
    if (kind === 'duplicate') { properties.push(properties.find(p => p.dpId === 103)!); }
    if (kind === 'conflicting') { properties = properties.map(p => p.dpId === 103 ? { ...p, value: 'Smart' } : p); }
    t.shadow.mockResolvedValue({ properties });
    await jest.advanceTimersByTimeAsync(300000);
    expect(() => t.targetState.getHandler()).toThrow(MockHapStatusError);
    expect(t.targetState.value).toBeInstanceOf(MockHapStatusError);
    expect(t.current.getHandler()).toBeCloseTo(27.7777778);
    expect(t.state.getHandler()).toBe(0);
    expect(t.setMode).not.toHaveBeenCalled();
  });

  test('power off remains readable even with missing mode; expired mode is unavailable', async () => {
    const t = setup(); await jest.advanceTimersByTimeAsync(0);
    t.shadow.mockResolvedValue({ properties: payload().properties.filter(p => p.dpId !== 103)
      .map(p => p.dpId === 101 ? { ...p, value: false, time: Date.now() } : p) });
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.targetState.getHandler()).toBe(0);
    t.shadow.mockRejectedValue(new Error('transport'));
    await jest.advanceTimersByTimeAsync(900000);
    expect(() => t.targetState.getHandler()).toThrow(MockHapStatusError);
    expect(t.setMode).not.toHaveBeenCalled();
  });

  test('factory automatically selects only the verified product before category fallback', async () => {
    const t = setup();
    expect(t.platform.options.deviceOverrides).toBeUndefined();
    expect(t.handler).toBeInstanceOf(ET72GWAccessory);
    await jest.advanceTimersByTimeAsync(0);
    expect(t.shadow).toHaveBeenCalledTimes(1);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('unknown products keep the generic thermostat and never poll shadow', async () => {
    const t = setup(false, 'unverified-product');
    expect(t.handler).toBeInstanceOf(ThermostatAccessory);
    expect(t.handler).not.toBeInstanceOf(ET72GWAccessory);
    const before = t.current.getHandler();
    await jest.advanceTimersByTimeAsync(900000);
    expect(t.shadow).not.toHaveBeenCalled();
    expect(t.current.getHandler()).toBe(before);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test.each([
    ['f', 500, 10], ['f', 680, 20], ['f', 750, 23.8888889], ['f', 800, 26.6666667], ['f', 900, 32.2222222],
    ['f', 1000, 37.7777778], ['c', 100, 10], ['c', 225, 22.5], ['c', 250, 25], ['c', 380, 38],
  ])('native %s target %s reads as Celsius %s and round-trips without overrides', async (unit, raw, celsius) => {
    const t = setup();
    t.device.status.find(s => s.code === 'temp_unit_convert')!.value = unit;
    t.device.status.find(s => s.code === 'temp_set')!.value = raw;
    const value = t.target.getHandler();
    expect(value).toBeCloseTo(celsius);
    await t.target.setHandler(value);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: raw }]);
    expect(t.target.getHandler()).toBeCloseTo(celsius);
  });

  test.each([
    ['f', 26.7, 801], ['f', 27.3, 811], ['f', 32.2, 900], ['f', 26.69, 800],
    ['c', 25.65, 257], ['c', 27.3, 273], ['c', 32.2, 322],
  ])('native %s target writes Celsius %s as integer %s', async (unit, celsius, raw) => {
    const t = setup();
    t.device.status.find(s => s.code === 'temp_unit_convert')!.value = unit;
    await t.target.setHandler(celsius);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: raw }]);
  });

  test('target unit follows the reported unit after a switch, not the schema label or floor cache', async () => {
    const t = setup();
    expect(t.target.getHandler()).toBeCloseTo((80 - 32) * 5 / 9);
    t.device.status.find(s => s.code === 'temp_unit_convert')!.value = 'c';
    t.device.status.find(s => s.code === 'temp_set')!.value = 250;
    expect(t.target.getHandler()).toBe(25);
    await t.target.setHandler(26);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 260 }]);
  });

  test.each(['invalid', true, undefined])('unknown target unit %s is unavailable and cannot send a command', async unit => {
    const t = setup();
    t.device.status.find(s => s.code === 'temp_unit_convert')!.value = unit as any;
    expect(() => t.target.getHandler()).toThrow(MockHapStatusError);
    await expect(t.target.setHandler(25)).rejects.toBeInstanceOf(MockHapStatusError);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test.each([NaN, Infinity, '25', undefined, 9, 39])('invalid target write %s sends no command', async value => {
    const t = setup();
    await expect(t.target.setHandler(value)).rejects.toBeInstanceOf(MockHapStatusError);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('configuration refresh cancels the old polling instance', async () => {
    const t = setup();
    await jest.advanceTimersByTimeAsync(0);
    t.handler.configureServices();
    await jest.advanceTimersByTimeAsync(0);
    expect(t.shadow).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(300000);
    expect(t.shadow).toHaveBeenCalledTimes(3);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test.each([undefined, NaN, Infinity, 1000, -1000, 0.5])(
    'malformed explicit conversion scale %s cannot send a nonfinite command', async scale => {
      const t = setup(true);
      t.platform.options.deviceOverrides[0].schema[0] = {
        ...schemaOverride, property: { ...schemaOverride.property, scale },
      };
      t.handler.configureTargetTemp();
      expect(() => t.target.getHandler()).toThrow(MockHapStatusError);
      await expect(t.target.setHandler(25)).rejects.toBeInstanceOf(MockHapStatusError);
      expect(t.commands).not.toHaveBeenCalled();
    });

  test('Fahrenheit range metadata is converted to Celsius without a manual schema', async () => {
    const t = setup();
    t.device.schema.find(s => s.code === 'temp_set')!.property = {
      min: 500, max: 1040, scale: 1, step: 1, unit: '°F',
    };
    t.handler.configureTargetTemp();
    expect(t.target.props).toEqual({ minValue: 10, maxValue: 38, minStep: 0.1 });
    expect(t.target.getHandler()).toBeCloseTo((80 - 32) * 5 / 9);
    await t.target.setHandler(27.3);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 811 }]);
  });

  test.each([deviceID, 'global', 'm2dkohai78cwr3yd'])('existing %s conversion override applies once', async id => {
    const t = setup(true, 'm2dkohai78cwr3yd', id);
    expect(t.target.getHandler()).toBeCloseTo((80 - 32) * 5 / 9);
    await t.target.setHandler(26.69);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 800 }]);
  });

  test.each(['onGet', 'onSet'])('a one-direction %s override leaves the native other direction working', async direction => {
    const t = setup(true);
    const config = t.platform.options.deviceOverrides[0].schema[0];
    if (direction === 'onGet') { delete config.onSet; } else { delete config.onGet; }
    t.handler.configureTargetTemp();
    expect(t.target.getHandler()).toBeCloseTo((80 - 32) * 5 / 9);
    await t.target.setHandler(27.3);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 811 }]);
  });

  test('removing an accessory disposes polling before unregistering without commands', async () => {
    const t = setup();
    await jest.advanceTimersByTimeAsync(0);
    const unregister = jest.fn();
    TuyaPlatform.prototype.removeAccessory.call({
      getAccessoryHandler: () => t.handler, accessoryHandlers: [t.handler],
      api: { unregisterPlatformAccessories: unregister }, log: { info: jest.fn() },
    } as any, deviceID);
    await jest.advanceTimersByTimeAsync(900000);
    expect(t.shadow).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test.each([42, {}, null, 'kelvin'])('malformed unit metadata %s makes only target unavailable', async unit => {
    const t = setup();
    (t.device.schema.find(s => s.code === 'temp_set')!.property as any).unit = unit;
    expect(() => t.handler.configureTargetTemp()).not.toThrow();
    await jest.advanceTimersByTimeAsync(0);
    expect(t.current.getHandler()).toBeCloseTo(27.7777778);
    expect(() => t.target.getHandler()).toThrow(MockHapStatusError);
    await expect(t.target.setHandler(25)).rejects.toBeInstanceOf(MockHapStatusError);
    expect(t.commands).not.toHaveBeenCalled();
  });

  test('explicit native-unit conversion handlers honor whitespace-normalized Fahrenheit metadata', async () => {
    const t = setup(true);
    t.platform.options.deviceOverrides[0].schema[0] = {
      code: 'temp_set', property: { min: 500, max: 1040, scale: 1, step: 1, unit: ' °F ' },
      onGet: 'value', onSet: 'Math.round(value)',
    };
    t.handler.configureTargetTemp();
    expect(t.target.getHandler()).toBeCloseTo((80 - 32) * 5 / 9);
    await t.target.setHandler(27.3);
    expect(t.commands).toHaveBeenLastCalledWith(deviceID, [{ code: 'temp_set', value: 811 }]);
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
