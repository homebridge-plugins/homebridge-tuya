import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import AirConditionerAccessory from '../src/shared/accessory/AirConditionerAccessory';

/**
 * Coverage for the extra services an air conditioner publishes:
 *
 *  - one Switch per swing axis the device reports
 *  - a Fanv2 "Fan Speed" tile when the device has no fan mode
 *
 * Both exist because the Home app does not offer SwingMode or RotationSpeed as controls
 * on a HeaterCooler service (it does on a fan service), leaving those DPs unreachable on
 * an air conditioner that has no fan mode.
 */

const SWITCH_UUID = 'Switch';
const FANV2_UUID = 'Fanv2';
const HUMIDIFIER_UUID = 'HumidifierDehumidifier';

interface FakeService {
  UUID: string;
  displayName?: string;
  subtype?: string;
  characteristics: Record<string, unknown>;
  handlers: Record<string, { get?: () => unknown; set?: (v: unknown) => unknown }>;
  getCharacteristic: (c: unknown) => unknown;
  setCharacteristic: (c: unknown, v: unknown) => FakeService;
  updateCharacteristic?: (c: unknown, v: unknown) => FakeService;
}

/** Minimal service/accessory doubles: enough to observe what gets published. */
function makeService(uuid: string, displayName?: string, subtype?: string): FakeService {
  const service: FakeService = {
    UUID: uuid,
    displayName,
    subtype,
    characteristics: {},
    handlers: {},
    getCharacteristic(characteristic: any) {
      const key = String(characteristic?.name ?? characteristic);
      service.handlers[key] = service.handlers[key] || {};
      const chain: any = {
        onGet: (fn: any) => { service.handlers[key].get = fn; return chain; },
        onSet: (fn: any) => { service.handlers[key].set = fn; return chain; },
        updateValue: () => chain,
        setProps: () => chain,
      };
      return chain;
    },
    setCharacteristic(characteristic: any, value: unknown) {
      service.characteristics[String(characteristic?.name ?? characteristic)] = value;
      return service;
    },
  };
  return service;
}

function makeAccessory() {
  const services: FakeService[] = [];
  return {
    services,
    context: { deviceID: 'dev' },
    displayName: 'AC',
    getService: (type: any) => services.find(s => s.UUID === (type?.UUID ?? type) && !s.subtype),
    getServiceById: (type: any, subtype: string) =>
      services.find(s => s.UUID === (type?.UUID ?? type) && s.subtype === subtype),
    addService: (type: any, displayName?: string, subtype?: string) => {
      const svc = makeService(type?.UUID ?? type, displayName, subtype);
      services.push(svc);
      return svc;
    },
    removeService: (svc: FakeService) => {
      const i = services.indexOf(svc);
      if (i >= 0) {
        services.splice(i, 1);
      }
    },
  };
}

/**
 * Build an accessory instance without running the real constructor, then drive only
 * the methods under test.  Keeps the test focused on which services get published.
 */
function buildAccessory(opts: {
  swingCodes?: string[];
  modeRange?: string[];
  speedCode?: string | null;
  statuses?: Record<string, unknown>;
}) {
  const { swingCodes = [], modeRange = ['cold', 'heat', 'auto'], speedCode = 'fan_speed_enum', statuses = {} } = opts;

  const accessory = makeAccessory();
  const schemas: Record<string, any> = {
    switch: { code: 'switch', property: {} },
    mode: { code: 'mode', property: { range: modeRange } },
  };
  for (const code of swingCodes) {
    schemas[code] = { code, property: {} };
  }
  if (speedCode) {
    schemas[speedCode] = { code: speedCode, property: { range: ['level_auto', 'level_1', 'level_2'] } };
  }

  const sent: Array<Array<{ code: string; value: unknown }>> = [];

  // The real constructor needs a platform, a homebridge API and a device; assembling
  // the few members these two methods touch keeps the test focused on which services
  // get published.  Several of them are readonly, hence the single Object.assign.
  const ac: any = Object.assign(Object.create(AirConditionerAccessory.prototype), {
    accessory,
    Service: {
      Switch: { UUID: SWITCH_UUID },
      Fanv2: { UUID: FANV2_UUID },
      HumidifierDehumidifier: { UUID: HUMIDIFIER_UUID },
    },
    Characteristic: {
      On: { name: 'On' },
      Active: { name: 'Active', ACTIVE: 1, INACTIVE: 0 },
      ConfiguredName: { name: 'ConfiguredName' },
      RotationSpeed: { name: 'RotationSpeed' },
    },
    log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    getSchema: (...codes: string[]) => codes.map(c => schemas[c]).find(Boolean),
    getStatus: (code: string) => (code in statuses ? { code, value: statuses[code] } : undefined),
    sendCommands: jest.fn(async (commands: any) => { sent.push(commands); }),
  });

  return { ac, accessory, sent };
}

describe('AirConditionerAccessory swing switches', () => {
  test('publishes one switch per reported axis, with a name', () => {
    const { ac, accessory } = buildAccessory({ swingCodes: ['switch_vertical', 'switch_horizontal'] });
    ac.configureSwingSwitches();

    const switches = accessory.services.filter(s => s.UUID === SWITCH_UUID);
    expect(switches.map(s => s.subtype)).toEqual(['swing-switch_vertical', 'swing-switch_horizontal']);
    // Without ConfiguredName the Home app shows both tiles under the accessory name.
    expect(switches.map(s => s.characteristics.ConfiguredName)).toEqual(['Vertical Swing', 'Horizontal Swing']);
  });

  test('publishes nothing when the device reports no swing DP', () => {
    const { ac, accessory } = buildAccessory({ swingCodes: [] });
    ac.configureSwingSwitches();

    expect(accessory.services.filter(s => s.UUID === SWITCH_UUID)).toHaveLength(0);
  });

  test('only the axes the device reports get a switch', () => {
    const { ac, accessory } = buildAccessory({ swingCodes: ['switch_vertical'] });
    ac.configureSwingSwitches();

    const switches = accessory.services.filter(s => s.UUID === SWITCH_UUID);
    expect(switches).toHaveLength(1);
    expect(switches[0].subtype).toBe('swing-switch_vertical');
  });

  test('reads and writes the matching DP', async () => {
    const { ac, accessory, sent } = buildAccessory({
      swingCodes: ['switch_vertical'],
      statuses: { switch_vertical: true },
    });
    ac.configureSwingSwitches();

    const svc = accessory.services.find(s => s.subtype === 'swing-switch_vertical')!;
    expect(svc.handlers.On.get!()).toBe(true);

    await svc.handlers.On.set!(false);
    expect(sent).toEqual([[{ code: 'switch_vertical', value: false }]]);
  });

  test('drops a switch when the device stops reporting that axis', () => {
    const { ac, accessory } = buildAccessory({ swingCodes: ['switch_vertical', 'switch_horizontal'] });
    ac.configureSwingSwitches();
    expect(accessory.services.filter(s => s.UUID === SWITCH_UUID)).toHaveLength(2);

    // Same accessory, but the device now reports only the vertical louvre
    const reduced = buildAccessory({ swingCodes: ['switch_vertical'] });
    reduced.accessory.services.push(...accessory.services);
    reduced.ac.configureSwingSwitches();

    const remaining = reduced.accessory.services.filter(s => s.UUID === SWITCH_UUID);
    expect(remaining.map(s => s.subtype)).toEqual(['swing-switch_vertical']);
  });
});

describe('AirConditionerAccessory fan-speed tile', () => {
  test('publishes a named Fanv2 when the device has no fan mode', () => {
    const { ac, accessory } = buildAccessory({ modeRange: ['cold', 'heat', 'auto'] });
    ac.configureFanSpeedTile();

    const fans = accessory.services.filter(s => s.UUID === FANV2_UUID);
    expect(fans).toHaveLength(1);
    expect(fans[0].subtype).toBe('fan-speed');
    expect(fans[0].characteristics.ConfiguredName).toBe('Fan Speed');
  });

  test('publishes nothing when the device already has a fan mode', () => {
    // configureFan() already provides a Fanv2 with RotationSpeed in that case.
    const { ac, accessory } = buildAccessory({ modeRange: ['cold', 'fan', 'auto'] });
    ac.configureFanSpeedTile();

    expect(accessory.services.filter(s => s.UUID === FANV2_UUID)).toHaveLength(0);
  });

  test('publishes nothing when the device reports no fan-speed DP', () => {
    const { ac, accessory } = buildAccessory({ speedCode: null });
    ac.configureFanSpeedTile();

    expect(accessory.services.filter(s => s.UUID === FANV2_UUID)).toHaveLength(0);
  });

  test('Active drives the power DP and never sends a mode change', async () => {
    // Sending a mode alongside the speed is what made units flip into fan mode when
    // the slider moved.
    const { ac, accessory, sent } = buildAccessory({ statuses: { switch: false } });
    ac.configureFanSpeedTile();

    const fan = accessory.services.find(s => s.subtype === 'fan-speed')!;
    expect(fan.handlers.Active.get!()).toBe(0);

    await fan.handlers.Active.set!(1);
    expect(sent).toEqual([[{ code: 'switch', value: true }]]);
    expect(JSON.stringify(sent)).not.toContain('mode');
  });
});
