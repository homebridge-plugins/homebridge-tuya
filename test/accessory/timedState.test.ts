/* eslint-disable @typescript-eslint/no-explicit-any */
import util from 'util';
import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

import GarageDoorAccessory from '../../src/accessory/GarageDoorAccessory';
import LockAccessory from '../../src/accessory/LockAccessory';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import { initLogger } from '../../src/util/Logger';

// HAP constants, mirroring the real values.
const CurrentDoorState = { OPEN: 0, CLOSED: 1, OPENING: 2, CLOSING: 3, STOPPED: 4 };
const TargetDoorState = { OPEN: 0, CLOSED: 1 };
const LockCurrentState = { UNSECURED: 0, SECURED: 1, JAMMED: 2, UNKNOWN: 3 };
const LockTargetState = { UNSECURED: 0, SECURED: 1 };

class MockHapStatusError extends Error {
  constructor(public hapStatus: number) {
    super(`HapStatusError ${hapStatus}`);
  }
}

const bool = (code: string) => ({
  code, mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Boolean, property: {},
});

describe('timed garage door and lock state', () => {
  let characteristics: Map<any, any>;
  let services: any[];
  let mockAccessory: any;
  let mockPlatform: any;
  let mockDeviceManager: any;
  let deviceConfig: any;
  let device: TuyaDevice;
  let logs: string[];

  const getCharacteristic = (type: any) => {
    if (characteristics.has(type)) {
      return characteristics.get(type);
    }
    const c: any = {
      type,
      value: null,
      getHandler: undefined,
      setHandler: undefined,
      onGet: jest.fn((h: any) => (c.getHandler = h, c)),
      onSet: jest.fn((h: any) => (c.setHandler = h, c)),
      setProps: jest.fn(() => c),
      updateValue: jest.fn((v: any) => (c.value = v, c)),
    };
    characteristics.set(type, c);
    return c;
  };

  const makeService = (type: any) => {
    const owned: any[] = [];
    return {
      UUID: type,
      displayName: `${type}`,
      subtype: undefined,
      characteristics: owned,
      getCharacteristic: jest.fn((t: any) => {
        const c = getCharacteristic(t);
        if (!owned.includes(c)) {
          owned.push(c);
        }
        return c;
      }),
      setCharacteristic: jest.fn(function(this: any) {
        return this;
      }),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => true),
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    characteristics = new Map();
    services = [];
    logs = [];
    deviceConfig = undefined;

    mockDeviceManager = {
      getDevice: jest.fn(() => device),
      sendCommands: jest.fn(async () => ({ success: true })),
      getLockTemporaryKey: jest.fn(async () => ({ success: true, result: { ticket_id: 'T', expire_time: 300 } })),
      sendLockCommands: jest.fn(async () => ({ success: true, result: true })),
      getLockRemoteUnlockMethods: jest.fn(async () => ({ success: true, result: [] })),
    };

    const hap = {
      Service: {
        GarageDoorOpener: 'GarageDoorOpener',
        LockMechanism: 'LockMechanism',
        AccessoryInformation: 'AccessoryInformation',
        Battery: 'Battery',
      },
      Characteristic: {
        CurrentDoorState,
        TargetDoorState,
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
      HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
    };

    const record = (message?: any, ...args: any[]) => {
      logs.push(util.format(message, ...args));
    };

    mockPlatform = {
      api: { hap },
      Service: hap.Service,
      Characteristic: hap.Characteristic,
      options: { debug: true, debugLevel: '' },
      deviceManager: mockDeviceManager,
      getDeviceConfig: jest.fn(() => deviceConfig),
      getDeviceSchemaConfig: jest.fn(() => undefined),
      log: { info: record, warn: record, error: record, debug: record },
    };
    initLogger(mockPlatform.log);

    mockAccessory = {
      UUID: 'uuid',
      displayName: 'Test',
      context: { deviceID: 'dev-1' },
      services,
      getService: jest.fn((type: any) => services.find(s => s.UUID === type)),
      addService: jest.fn((type: any) => {
        const s = makeService(type);
        services.push(s);
        return s;
      }),
      removeService: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Garage ───────────────────────────────────────────────────────

  describe('garage door (garageDoorTiming)', () => {
    const setupGarage = () => {
      device = new TuyaDevice({
        id: 'dev-1', uuid: 'uuid', name: 'Garage', online: true, owner_id: 'o', product_id: 'p',
        product_name: 'Garage', category: 'ckmkzq', sub: false,
        schema: [bool('switch_1')],
        status: [{ code: 'switch_1', value: false }],
      } as any);
      const garage = new GarageDoorAccessory(mockPlatform as any, mockAccessory as any);
      garage.configureServices();
      return garage;
    };
    const current = () => characteristics.get(CurrentDoorState);
    const target = () => characteristics.get(TargetDoorState);

    test('without garageDoorTiming, Open sends switch_1=true as before', async () => {
      setupGarage();
      await target().setHandler(TargetDoorState.OPEN);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledWith('dev-1', [{ code: 'switch_1', value: true }]);
    });

    test('with a working doorcontact_state, garageDoorTiming is ignored', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      device = new TuyaDevice({
        id: 'dev-1', uuid: 'uuid', name: 'Garage', online: true, owner_id: 'o', product_id: 'p',
        product_name: 'Garage', category: 'ckmkzq', sub: false,
        schema: [bool('switch_1'), bool('doorcontact_state')],
        status: [{ code: 'switch_1', value: false }, { code: 'doorcontact_state', value: false }],
      } as any);
      const garage = new GarageDoorAccessory(mockPlatform as any, mockAccessory as any);
      garage.configureServices();
      await target().setHandler(TargetDoorState.OPEN);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledWith('dev-1', [{ code: 'switch_1', value: true }]);
    });

    test('Open sends exactly one pulse and runs Opening -> Open -> Closing -> Closed', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      setupGarage();
      expect(current().getHandler()).toBe(CurrentDoorState.CLOSED);

      await target().setHandler(TargetDoorState.OPEN);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledTimes(1);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledWith('dev-1', [{ code: 'switch_1', value: false }]);
      expect(current().getHandler()).toBe(CurrentDoorState.OPENING);
      expect(target().getHandler()).toBe(TargetDoorState.OPEN);

      await jest.advanceTimersByTimeAsync(8 * 1000);
      expect(current().getHandler()).toBe(CurrentDoorState.OPEN);

      await jest.advanceTimersByTimeAsync(17 * 1000);
      expect(current().getHandler()).toBe(CurrentDoorState.CLOSING);
      expect(target().getHandler()).toBe(TargetDoorState.CLOSED);

      await jest.advanceTimersByTimeAsync(8 * 1000);
      expect(current().getHandler()).toBe(CurrentDoorState.CLOSED);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledTimes(1);
    });

    test('a second Open during the cycle sends nothing', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      setupGarage();
      await target().setHandler(TargetDoorState.OPEN);
      await jest.advanceTimersByTimeAsync(3 * 1000);
      await target().setHandler(TargetDoorState.OPEN);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledTimes(1);
    });

    test('Close only resets the display and sends nothing', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      setupGarage();
      await target().setHandler(TargetDoorState.OPEN);
      await target().setHandler(TargetDoorState.CLOSED);
      expect(mockDeviceManager.sendCommands).toHaveBeenCalledTimes(1);
      expect(current().getHandler()).toBe(CurrentDoorState.CLOSED);
    });

    test('a press reported from outside HomeKit runs the cycle without sending', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      const garage = setupGarage();
      await garage.onDeviceStatusUpdate([{ code: 'switch_1', value: true }]);
      expect(mockDeviceManager.sendCommands).not.toHaveBeenCalled();
      expect(current().getHandler()).toBe(CurrentDoorState.OPENING);
    });

    test('the echo of our own command does not start a second cycle', async () => {
      deviceConfig = { id: 'dev-1', garageDoorTiming: { opening: 8, open: 17, closing: 8 } };
      const garage = setupGarage();
      await target().setHandler(TargetDoorState.OPEN);
      await jest.advanceTimersByTimeAsync(2 * 1000);
      await garage.onDeviceStatusUpdate([{ code: 'switch_1', value: false }]);
      await jest.advanceTimersByTimeAsync(6 * 1000);
      expect(current().getHandler()).toBe(CurrentDoorState.OPEN);
    });
  });

  // ─── Lock ─────────────────────────────────────────────────────────

  describe('lock (lockTiming)', () => {
    const setupLock = (status: any[] = []) => {
      device = new TuyaDevice({
        id: 'dev-1', uuid: 'uuid', name: 'Lock Box', online: true, owner_id: 'o', product_id: 'p',
        product_name: 'Lock Box', category: 'jtmspro', sub: true,
        schema: [bool('lock_motor_state')],
        status: [{ code: 'lock_motor_state', value: false }, ...status],
      } as any);
      const lock = new LockAccessory(mockPlatform as any, mockAccessory as any);
      lock.configureServices();
      return lock;
    };
    const current = () => characteristics.get(LockCurrentState);
    const target = () => characteristics.get(LockTargetState);

    test('Unlock opens once, shows Unlocked for the set time, then Locked', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      setupLock();

      await target().setHandler(LockTargetState.UNSECURED);
      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledWith('dev-1', 'T', true);
      expect(current().getHandler()).toBe(LockCurrentState.UNSECURED);
      expect(target().getHandler()).toBe(LockTargetState.UNSECURED);

      await jest.advanceTimersByTimeAsync(10 * 1000);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);
      expect(target().getHandler()).toBe(LockTargetState.SECURED);
    });

    test('unlocked -1 follows auto_lock_time + 1s', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: -1 } };
      setupLock([{ code: 'auto_lock_time', value: 5 }]);

      await target().setHandler(LockTargetState.UNSECURED);
      await jest.advanceTimersByTimeAsync(5 * 1000);
      expect(current().getHandler()).toBe(LockCurrentState.UNSECURED);
      await jest.advanceTimersByTimeAsync(1 * 1000);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);
    });

    test('Lock sends nothing and shows Locked', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      setupLock();
      await target().setHandler(LockTargetState.UNSECURED);
      await target().setHandler(LockTargetState.SECURED);
      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledTimes(1);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);
    });

    test('never stays stuck: no device report is needed to return to Locked', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      setupLock();
      await target().setHandler(LockTargetState.UNSECURED);
      await jest.advanceTimersByTimeAsync(11 * 1000);
      expect(target().getHandler()).toBe(LockTargetState.SECURED);
    });

    test('a failed unlock shows Locked and reports the error to HomeKit', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      mockDeviceManager.sendLockCommands.mockResolvedValueOnce({ success: false, code: 1, msg: 'nope' });
      setupLock();
      await expect(target().setHandler(LockTargetState.UNSECURED)).rejects.toBeInstanceOf(MockHapStatusError);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);
    });

    test('an unreachable lock is retried, and the cycle starts when it answers', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      mockDeviceManager.sendLockCommands
        .mockResolvedValueOnce({ success: false, code: 2312, msg: 'offline' })
        .mockResolvedValueOnce({ success: true, result: true });
      setupLock();

      await target().setHandler(LockTargetState.UNSECURED);
      expect(target().getHandler()).toBe(LockTargetState.UNSECURED);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);

      await jest.advanceTimersByTimeAsync(10 * 1000);
      expect(mockDeviceManager.sendLockCommands).toHaveBeenCalledTimes(2);
      expect(current().getHandler()).toBe(LockCurrentState.UNSECURED);
    });

    test('an unlock reported by the lock itself runs the cycle', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      const lock = setupLock();
      await lock.onDeviceStatusUpdate([{ code: 'unlock_fingerprint', value: 3 }]);
      expect(current().getHandler()).toBe(LockCurrentState.UNSECURED);
      expect(mockDeviceManager.sendLockCommands).not.toHaveBeenCalled();
    });

    test('record-type unlock dps are ignored', async () => {
      deviceConfig = { id: 'dev-1', lockTiming: { unlocked: 10 } };
      const lock = setupLock();
      await lock.onDeviceStatusUpdate([{ code: 'unlock_method_create', value: 1 }]);
      expect(current().getHandler()).toBe(LockCurrentState.SECURED);
    });
  });
});
