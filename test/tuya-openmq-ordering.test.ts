import TuyaOpenAPI from '../src/core/TuyaOpenAPI';
import TuyaOpenMQ from '../src/core/TuyaOpenMQ';
import { initLogger } from '../src/util/Logger';

describe('Tuya MQTT out-of-order reports', () => {
  beforeEach(() => {
    initLogger({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });
  });

  test('does not replace a raw room reading with a different raw DP', () => {
    const mq = new TuyaOpenMQ({ forceIPv4: false } as TuyaOpenAPI);
    const now = Date.now();
    mq._fixWrongOrderMessage(4, {
      devId: 'thermostat', status: [{ dpId: 106, value: 0, t: now }],
    }, now);
    const older = { devId: 'thermostat', status: [{ dpId: 105, value: 195, t: now - 1 }] };

    mq._fixWrongOrderMessage(4, older, now - 1);

    expect(older.status).toEqual([{ dpId: 105, value: 195, t: now - 1 }]);
  });

  test('does not match raw reports with empty codes', () => {
    const mq = new TuyaOpenMQ({ forceIPv4: false } as TuyaOpenAPI);
    const now = Date.now();
    mq._fixWrongOrderMessage(4, {
      devId: 'thermostat', status: [{ code: '', dpId: 102, value: 200, t: now }],
    }, now);
    const older = { devId: 'thermostat', status: [{ code: '', dpId: 105, value: 195, t: now - 1 }] };

    mq._fixWrongOrderMessage(4, older, now - 1);

    expect(older.status[0].value).toBe(195);
  });

  test('still corrects an older standard report for the same device and code', () => {
    const mq = new TuyaOpenMQ({ forceIPv4: false } as TuyaOpenAPI);
    const now = Date.now();
    mq._fixWrongOrderMessage(4, {
      devId: 'thermostat', status: [{ code: 'temp_current', value: 200, t: now }],
    }, now);
    const older = { devId: 'thermostat', status: [{ code: 'temp_current', value: 195, t: now - 1 }] };

    mq._fixWrongOrderMessage(4, older, now - 1);

    expect(older.status).toEqual([{ code: 'temp_current', value: 200, t: now }]);
  });

  test('does not copy a standard reading between different devices', () => {
    const mq = new TuyaOpenMQ({ forceIPv4: false } as TuyaOpenAPI);
    const now = Date.now();
    mq._fixWrongOrderMessage(4, {
      devId: 'other-thermostat', status: [{ code: 'temp_current', value: 200, t: now }],
    }, now);
    const older = { devId: 'thermostat', status: [{ code: 'temp_current', value: 195, t: now - 1 }] };

    mq._fixWrongOrderMessage(4, older, now - 1);

    expect(older.status[0].value).toBe(195);
  });
});
