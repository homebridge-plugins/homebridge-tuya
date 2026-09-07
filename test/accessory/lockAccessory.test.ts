/* eslint-disable @typescript-eslint/no-explicit-any */
import util from 'util';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import LockAccessory from '../../src/accessory/LockAccessory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import { initLogger } from '../../src/util/Logger';

// HAP constants, mirroring the real values.
const LockCurrentState = { UNSECURED: 0, SECURED: 1, JAMMED: 2, UNKNOWN: 3 };
const LockTargetState = { UNSECURED: 0, SECURED: 1 };

class MockHapStatusError extends Error {
  constructor(public hapStatus: number) {
    super(`HapStatusError ${hapStatus}`);
  }
}
const HAPStatus = { SERVICE_COMMUNICATION_FAILURE: -70402 };

describe('LockAccessory', () => {

  let characteristics: Map<any, any>;
  let services: any[];
  let mockAccessory: any;
  let mockPlatform: any;
  let mockDeviceManager: any;
  let device: TuyaDevice;
  let logs: { level: string; message: string }[];

  const makeCharacteristic = (type: any) => {
    const characteristic: any = {
      type,
      value: null,
      getHandler: undefined,
      setHandler: undefined,
      onGet: jest.fn((handler: any) => (characteristic.getHandler = handler, characteristic)),
      onSet: jest.fn((handler: any) => (characteristic.setHandler = handler, characteristic)),
      setProps: jest.fn(() => characteristic),
      updateValue: jest.fn((value: any) => (characteristic.value = value, characteristic)),
    };
    characteristics.set(type, characteristic);
    return characteristic;
  };

  const getCharacteristic = (type: any) => characteristics.get(type) || makeCharacteristic(type);

  const makeService = (type: any) => {
    const owned: any[] = [];
    return {
      UUID: type,
      displayName: `${type}`,
      subtype: undefined,
      // `BaseAccessory.updateAllValues()` walks this array.
      characteristics: owned,
      getCharacteristic: jest.fn((characteristicType: any) => {
        const characteristic = getCharacteristic(characteristicType);
        if (!owned.includes(characteristic)) {
          owned.push(characteristic);
        }
        return characteristic;
      }),
      setCharacteristic: jest.fn(function(this: any) {
        return this;
      }),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => true),
    };
  };

  /** Codes present in the schema/status of the device under test. */
  const createDevice = (overrides: Partial<TuyaDevice> = {}) => new TuyaDevice({
    id: 'lock-device-id',
    uuid: 'lock-uuid',
    name: 'Fechadura Sala de Estar',
    online: true,
    owner_id: 'owner-1',
    product_id: 'ble-lock-product',
    product_name: 'BLE Smart Lock',
    category: 'ms',
    sub: true,
    schema: [
      {
        code: 'lock_motor_state',
        mode: TuyaDeviceSchemaMode.READ_ONLY,
        type: TuyaDeviceSchemaType.Boolean,
        property: {},
      },
      {
        code: 'residual_electricity',
        mode: TuyaDeviceSchemaMode.READ_ONLY,
        type: TuyaDeviceSchemaType.Integer,
        property: { min: 0, max: 100, scale: 0, step: 1, unit: '%' },
      },
    ],
    status: [
      { code: 'lock_motor_state', value: false },
      { code: 'residual_electricity', value: 80 },
    ],
    ...overrides,
  } as any);

  // Mirrors how homebridge renders a log line, so assertions can match the
  // text the user actually sees.
  const recordLog = (level: string) => (message?: any, ...args: any[]) => {
    logs.push({ level, message: util.format(message, ...args) });
  };

  beforeEach(() => {
    characteristics = new Map();
    services = [];
    logs = [];

    mockDeviceManager = {
      getDevice: jest.fn(() => device),
      sendCommands: jest.fn(),
      getLockTemporaryKey: jest.fn(async () => ({
        success: true,
        result: { ticket_id: 'TICKET-ABCDEF123456', ticket_key: 'SUPER-SECRET-KEY', expire_time: 300 },
      })),
      sendLockCommands: jest.fn(async () => ({ success: true, result: true })),
      getLockRemoteUnlockMethods: jest.fn(async () => ({ success: true, result: [] })),
    };

    const hap = {
      Service: {
        LockMechanism: 'LockMechanism',
        AccessoryInformation: 'AccessoryInformation',
        Battery: 'Battery',
      },
      Characteristic: {
        LockCurrentState,
        LockTargetState,
        StatusLowBattery: { BATTERY_LEVEL_NORMAL: 0, BATTERY_LEVEL_LOW: 1 },
        ChargingState: { NOT_CHARGING: 0, CHARGING: 1 },
        BatteryLevel: 'BatteryLevel',
        StatusActive: 'StatusActive',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        Name: 'Name',
        ConfiguredName: 'ConfiguredName',
        SerialNumber: 'SerialNumber',
        ProgrammableSwitchEvent: { UUID: 'ProgrammableSwitchEvent' },
      },
      HapStatusError: MockHapStatusError,
      HAPStatus,
    };

    mockPlatform = {
      api: { hap },
      Service: hap.Service,
      Characteristic: hap.Characteristic,
      options: { debug: true, debugLevel: '' },
      deviceManager: mockDeviceManager,
      getDeviceConfig: jest.fn(() => undefined),
      getDeviceSchemaConfig: jest.fn(() => undefined),
      log: {
        info: recordLog('info'),
        warn: recordLog('warn'),
        error: recordLog('error'),
        debug: recordLog('debug'),
      },
    };

    // BaseAccessory builds its PrefixLogger from the module-level logger.
    initLogger(mockPlatform.log);

    mockAccessory = {
      UUID: 'lock-uuid',
      displayName: 'Fechadura Sala de Estar',
      context: { deviceID: 'lock-device-id' },
      services,
      getService: jest.fn((type: any) => services.find(s => s.UUID === type)),
      addService: jest.fn((type: any) => {
        const service = makeService(type);
        services.push(service);
        return service;
      }),
      removeService: jest.fn(),
    };

    device = createDevice();
  });

  const setup = () => {
    const accessory = new LockAccessory(mockPlatform as any, mockAccessory as any);
    accessory.configureServices();
    return accessory;
  };

  const targetStateCharacteristic = () => characteristics.get(LockTargetState);
  const currentStateCharacteristic = () => characteristics.get(LockCurrentState);

  const allLogText = () => logs.map(l => l.message).join('\n');

  // ─── Handler registration ────────────────────────────────────────

  test('registers an onSet handler on LockTargetState for a `ms` BLE lock', () => {
    setup();

    const target = targetStateCharacteristic();
    expect(target).toBeDefined();
    expect(target.onSet).toHaveBeenCalledTimes(1);
    expect(typeof target.setHandler).toBe('function');
  });

  test('warns and skips LockTargetState when no writable lock dp is present', () => {
    device = createDevice({
      schema: [{
        code: 'closed_opened',
        mode: TuyaDeviceSchemaMode.READ_ONLY,
        type: TuyaDeviceSchemaType.Boolean,
        property: {},
      }],
      status: [{ code: 'closed_opened', value: false }],
    } as any);

    setup();

    expect(characteristics.has(LockTargetState)).toBe(false);
    expect(allLogText()).toContain('Remote lock/unlock from HomeKit is DISABLED');
  });

  // ─── SECURED -> UNSECURED ────────────────────────────────────────

  test('SECURED -> UNSECURED runs the Smart Lock unlock flow with open=true', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    expect(mockDeviceManager.getLockTemporaryKey).toHaveBeenCalledWith('lock-device-id');
    expect(mockDeviceManager.sendLockCommands)
      .toHaveBeenCalledWith('lock-device-id', 'TICKET-ABCDEF123456', true);
  });

  test('SECURED -> UNSECURED does not fall back to a raw unlock_ble dp write', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    expect(mockDeviceManager.sendCommands).not.toHaveBeenCalled();
  });

  test('logs each step of the unlock flow', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    const text = allLogText();
    expect(text).toContain('HomeKit requested target state: UNSECURED');
    expect(text).toContain('Requesting Tuya password ticket');
    expect(text).toContain('password-ticket response');
    expect(text).toContain('Sending door operation');
    expect(text).toContain('open=true');
    expect(text).toContain('door-operate response');
  });

  test('never logs the raw ticket_id or the ticket_key', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    const text = allLogText();
    expect(text).not.toContain('TICKET-ABCDEF123456');
    expect(text).not.toContain('SUPER-SECRET-KEY');
    expect(text).toContain('***3456');
  });

  // ─── getLockTemporaryKey failure ─────────────────────────────────

  test('password-ticket failure aborts, logs code/msg and reports the error to HomeKit', async () => {
    mockDeviceManager.getLockTemporaryKey.mockResolvedValue({
      success: false, code: 1106, msg: 'permission deny',
    } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED))
      .rejects.toBeInstanceOf(MockHapStatusError);

    expect(mockDeviceManager.sendLockCommands).not.toHaveBeenCalled();
    const text = allLogText();
    expect(text).toContain('password-ticket failed');
    expect(text).toContain('1106');
    expect(text).toContain('permission deny');
  });

  test('password-ticket success without a ticket_id is treated as a failure', async () => {
    mockDeviceManager.getLockTemporaryKey.mockResolvedValue({ success: true, result: {} } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED))
      .rejects.toBeInstanceOf(MockHapStatusError);
    expect(mockDeviceManager.sendLockCommands).not.toHaveBeenCalled();
  });

  // ─── door-operate failure ────────────────────────────────────────

  test('door-operate failure logs code/msg and reports the error to HomeKit', async () => {
    mockDeviceManager.sendLockCommands.mockResolvedValue({
      success: false, code: 2009, msg: 'device not support',
    } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED))
      .rejects.toBeInstanceOf(MockHapStatusError);

    const text = allLogText();
    expect(text).toContain('door-operate failed');
    expect(text).toContain('2009');
    expect(text).toContain('device not support');
  });

  test('door-operate answering success=true, result=false is treated as a rejection', async () => {
    mockDeviceManager.sendLockCommands.mockResolvedValue({ success: true, result: false } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED))
      .rejects.toBeInstanceOf(MockHapStatusError);
    expect(allLogText()).toContain('door-operate rejected by the device');
  });

  test('a rejected door operation queries the supported remote unlocking methods', async () => {
    mockDeviceManager.sendLockCommands.mockResolvedValue({ success: true, result: false } as never);
    mockDeviceManager.getLockRemoteUnlockMethods.mockResolvedValue({
      success: true, result: [{ open_type: 'ble_unlock' }],
    } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED)).rejects.toBeDefined();

    expect(mockDeviceManager.getLockRemoteUnlockMethods).toHaveBeenCalledWith('lock-device-id');
    expect(allLogText()).toContain('Remote unlocking methods reported by this lock');
  });

  // ─── Offline device ──────────────────────────────────────────────

  // A BLE sub-device behind a gateway is routinely reported offline by Tuya
  // while remote unlocking still works, so `online: false` must warn, not block.
  test('a device Tuya reports as offline still attempts the unlock, with a warning', async () => {
    device = createDevice({ online: false } as any);

    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    expect(mockDeviceManager.getLockTemporaryKey).toHaveBeenCalledWith('lock-device-id');
    expect(mockDeviceManager.sendLockCommands)
      .toHaveBeenCalledWith('lock-device-id', 'TICKET-ABCDEF123456', true);
    expect(allLogText()).toContain('Tuya reports this device as offline');
  });

  // ─── HTTP success must not imply an unlocked door ────────────────

  test('a successful HTTP unlock does NOT mark LockCurrentState as unsecured', async () => {
    const accessory = setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    // The device has not reported anything yet.
    expect(await currentStateCharacteristic().getHandler()).toBe(LockCurrentState.SECURED);

    await accessory.updateAllValues();
    expect(currentStateCharacteristic().value).toBe(LockCurrentState.SECURED);
  });

  test('LockTargetState stays on the requested value while the device has not answered', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

    expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.UNSECURED);
  });

  test('a failed unlock releases the pending target state back to the reported one', async () => {
    mockDeviceManager.sendLockCommands.mockResolvedValue({ success: true, result: false } as never);

    setup();

    await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED)).rejects.toBeDefined();

    expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.SECURED);
  });

  // ─── Real state arriving from the device ─────────────────────────

  test('a later lock_motor_state update drives LockCurrentState', async () => {
    const accessory = setup();

    expect(await currentStateCharacteristic().getHandler()).toBe(LockCurrentState.SECURED);

    // Simulate the MQTT device status update (TuyaDeviceManager mutates
    // device.status before emitting).
    device.status.find(s => s.code === 'lock_motor_state')!.value = true;
    await accessory.onDeviceStatusUpdate([{ code: 'lock_motor_state', value: true }]);

    expect(await currentStateCharacteristic().getHandler()).toBe(LockCurrentState.UNSECURED);
    expect(currentStateCharacteristic().value).toBe(LockCurrentState.UNSECURED);
    expect(allLogText()).toContain('Device reported lock_motor_state = true');
  });

  test('reaching the requested state releases the pending target state', async () => {
    const accessory = setup();

    await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);
    expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.UNSECURED);

    device.status.find(s => s.code === 'lock_motor_state')!.value = true;
    await accessory.onDeviceStatusUpdate([{ code: 'lock_motor_state', value: true }]);

    expect(allLogText()).toContain('Releasing the pending target state');

    // Once the lock relatches, HomeKit follows the device again.
    device.status.find(s => s.code === 'lock_motor_state')!.value = false;
    await accessory.onDeviceStatusUpdate([{ code: 'lock_motor_state', value: false }]);

    expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.SECURED);
  });

  // ─── Retry on 2312 (lock between connection windows) ─────────────

  describe('retry when the lock is not reachable', () => {
    const NOT_ONLINE = { success: false, code: 2312, msg: 'Door lock equipment is not online!' };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    test('a 2312 does NOT fail the HomeKit write — the retry runs behind it', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue(NOT_ONLINE as never);

      setup();

      // Must resolve: a HAP write that blocks for the whole retry window would
      // time out on the controller regardless of what it returns.
      await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED)).resolves.toBeUndefined();
      expect(allLogText()).toContain('Retrying for up to 90s in the background');
    });

    test('keeps retrying and succeeds when the lock’s window opens', async () => {
      mockDeviceManager.sendLockCommands
        .mockResolvedValueOnce(NOT_ONLINE as never)
        .mockResolvedValueOnce(NOT_ONLINE as never)
        .mockResolvedValueOnce(NOT_ONLINE as never)
        .mockResolvedValue({ success: true, result: true } as never);

      setup();
      await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);
      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(40 * 1000);

      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledTimes(4);
      expect(allLogText()).toContain('Door operation accepted on retry');
      // Every attempt carries its own ticket, since a rejected one may or may
      // not have been consumed.
      expect(mockDeviceManager.getLockTemporaryKey).toHaveBeenCalledTimes(4);
    });

    test('stops once the window closes and falls back to the reported state', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue(NOT_ONLINE as never);

      setup();
      await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);
      expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.UNSECURED);

      await jest.advanceTimersByTimeAsync(95 * 1000);

      expect(allLogText()).toContain('Gave up after 90s');
      expect(await targetStateCharacteristic().getHandler()).toBe(LockTargetState.SECURED);

      const before = mockDeviceManager.sendLockCommands.mock.calls.length;
      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(mockDeviceManager.sendLockCommands.mock.calls.length).toBe(before);
    });

    test('a real failure is not retried — it fails the write immediately', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue({
        success: false, code: 1106, msg: 'permission deny',
      } as never);

      setup();
      await expect(targetStateCharacteristic().setHandler(LockTargetState.UNSECURED))
        .rejects.toBeInstanceOf(MockHapStatusError);

      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledTimes(1);
    });

    test('a 2312 skips the diagnostics lookup, so retries do not spam the API', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue(NOT_ONLINE as never);

      setup();
      await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);
      await jest.advanceTimersByTimeAsync(40 * 1000);

      expect(mockDeviceManager.getLockRemoteUnlockMethods).not.toHaveBeenCalled();
    });

    test('the device reporting the requested state stops the retry loop', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue(NOT_ONLINE as never);

      const accessory = setup();
      await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);

      device.status.find(s => s.code === 'lock_motor_state')!.value = true;
      await accessory.onDeviceStatusUpdate([{ code: 'lock_motor_state', value: true }]);

      const before = mockDeviceManager.sendLockCommands.mock.calls.length;
      await jest.advanceTimersByTimeAsync(40 * 1000);
      expect(mockDeviceManager.sendLockCommands.mock.calls.length).toBe(before);
    });

    test('a new request supersedes the one still being retried', async () => {
      mockDeviceManager.sendLockCommands.mockResolvedValue(NOT_ONLINE as never);

      setup();
      await targetStateCharacteristic().setHandler(LockTargetState.UNSECURED);
      await targetStateCharacteristic().setHandler(LockTargetState.SECURED);

      await jest.advanceTimersByTimeAsync(25 * 1000);

      // Only the newest direction is still being asked for.
      const opens = mockDeviceManager.sendLockCommands.mock.calls.map((c: any[]) => c[2]);
      expect(opens.slice(2).every((o: boolean) => o === false)).toBe(true);
    });
  });

  // ─── UNSECURED -> SECURED ────────────────────────────────────────

  test('UNSECURED -> SECURED sends the documented door-operate with open=false', async () => {
    setup();

    await targetStateCharacteristic().setHandler(LockTargetState.SECURED);

    expect(mockDeviceManager.sendLockCommands)
      .toHaveBeenCalledWith('lock-device-id', 'TICKET-ABCDEF123456', false);
    expect(allLogText()).toContain('HomeKit requested target state: SECURED');
  });

});
