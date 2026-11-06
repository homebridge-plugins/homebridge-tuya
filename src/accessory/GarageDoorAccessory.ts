import { CharacteristicValue } from 'homebridge';

import BaseAccessory from './BaseAccessory';
import { TuyaDeviceStatus } from '../device/TuyaDevice';

const SCHEMA_CODE = {
  CURRENT_DOOR_STATE: ['doorcontact_state'],
  TARGET_DOOR_STATE: ['switch_1'],
};

/**
 * Timed door state, enabled per device with `deviceOverrides[].garageDoorTiming`.
 *
 * For garage door controllers without a usable door contact (no `doorcontact_state`,
 * or one hidden with a schema override), typically a relay that pulses an opener
 * which closes by itself. Every `switch_1` command pulses the relay, so Open sends
 * exactly one command, and HomeKit is shown a timed Opening -> Open -> Closing ->
 * Closed cycle instead of a state the controller can't report. Close sends nothing:
 * a second pulse would start the motor again.
 */
export interface GarageDoorTiming {
  /** Seconds from the tap until the door is fully open. */
  opening?: number;
  /** Seconds the door stays open before it closes by itself. */
  open?: number;
  /** Seconds the door takes to close. */
  closing?: number;
}

const DEFAULT_TIMING: Required<GarageDoorTiming> = { opening: 12, open: 20, closing: 12 };

/** Status reports arriving this soon after our own command are its echo, not a new press. */
const OWN_COMMAND_ECHO_SECONDS = 8;

/** DPs whose report means the opener was triggered from outside HomeKit (the Tuya app, a scene). */
const PRESS_REPORT_CODES = ['switch_1', 'door_control_1'];

export default class GarageDoorAccessory extends BaseAccessory {

  private displayedState?: CharacteristicValue;
  private cycleTimers: ReturnType<typeof setTimeout>[] = [];
  private cycleActive = false;
  private ownCommandUntil = 0;

  requiredSchema() {
    return [SCHEMA_CODE.TARGET_DOOR_STATE];
  }

  configureServices() {
    this.configureCurrentDoorState();
    this.configureTargetDoorState();

    if (this.useTiming()) {
      const t = this.getTiming();
      this.log.info('Timed door state: opening %ss, open %ss, closing %ss.', t.opening, t.open, t.closing);
    }
  }

  mainService() {
    return this.accessory.getService(this.Service.GarageDoorOpener)
      || this.accessory.addService(this.Service.GarageDoorOpener);
  }

  useContactSensorForState() {
    return this.platform.getDeviceConfig(this.device)?.garageDoorUseContactSensorForState === true;
  }

  /** Timed door state applies when it is configured and there is no usable door contact. */
  useTiming() {
    return this.platform.getDeviceConfig(this.device)?.garageDoorTiming !== undefined
      && !this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
  }

  getTiming(): Required<GarageDoorTiming> {
    const t: GarageDoorTiming = this.platform.getDeviceConfig(this.device)?.garageDoorTiming || {};
    const seconds = (value: unknown, fallback: number) => (typeof value === 'number' && value >= 0) ? value : fallback;
    return {
      opening: seconds(t.opening, DEFAULT_TIMING.opening),
      open: seconds(t.open, DEFAULT_TIMING.open),
      closing: seconds(t.closing, DEFAULT_TIMING.closing),
    };
  }

  configureCurrentDoorState() {
    const { OPEN, CLOSED, OPENING, CLOSING, STOPPED } = this.Characteristic.CurrentDoorState;
    this.mainService().getCharacteristic(this.Characteristic.CurrentDoorState)
      .onGet(() => {
        if (this.useTiming()) {
          return this.displayedState ?? CLOSED;
        }

        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
        if (!currentSchema) {
          return STOPPED;
        }

        const currentStatus = this.getStatus(currentSchema.code)!;

        if (this.useContactSensorForState()) {
          return currentStatus.value === false ? CLOSED : OPEN;
        }

        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
        if (!targetSchema) {
          return STOPPED;
        }

        const targetStatus = this.getStatus(targetSchema.code)!;

        if (currentStatus.value === true && targetStatus.value === true) {
          return OPEN;
        } else if (currentStatus.value === false && targetStatus.value === false) {
          return CLOSED;
        } else if (currentStatus.value === false && targetStatus.value === true) {
          return OPENING;
        } else if (currentStatus.value === true && targetStatus.value === false) {
          return CLOSING;
        }

        return STOPPED;
      });
  }

  configureTargetDoorState() {
    const schema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
    if (!schema) {
      return;
    }

    const { OPEN, CLOSED } = this.Characteristic.TargetDoorState;
    this.mainService().getCharacteristic(this.Characteristic.TargetDoorState)
      .onGet(() => {
        if (this.useTiming()) {
          const { OPENING, OPEN: IS_OPEN } = this.Characteristic.CurrentDoorState;
          return (this.displayedState === OPENING || this.displayedState === IS_OPEN) ? OPEN : CLOSED;
        }

        if (this.useContactSensorForState()) {
          const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);

          if (!currentSchema) {
            return CLOSED;
          }

          const currentStatus = this.getStatus(currentSchema.code)!;
          return currentStatus.value === false ? CLOSED : OPEN;
        }

        const status = this.getStatus(schema.code)!;
        return status.value as boolean ? OPEN : CLOSED;
      })
      .onSet(async value => {
        if (!this.useTiming()) {
          await this.sendCommands([{
            code: schema.code,
            value: (value === OPEN) ? true : false,
          }]);
          return;
        }

        if (value === OPEN) {
          if (!this.cycleActive) {
            await this.startCycle(true);
          }
        } else {
          // The door closes by itself; Close only resets what HomeKit shows.
          this.stopCycle();
        }
      });
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    await super.onDeviceStatusUpdate(status);

    if (!this.useTiming()) {
      return;
    }

    // Follow presses made outside HomeKit; display only, never sends a command.
    const pressed = status.some(item => PRESS_REPORT_CODES.includes(item.code));
    if (pressed && Date.now() > this.ownCommandUntil && !this.cycleActive) {
      this.log.info('Opener triggered outside HomeKit.');
      await this.startCycle(false);
    }
  }

  /** Runs the timed cycle. With `sendPress`, first sends the single relay pulse. */
  private async startCycle(sendPress: boolean) {
    const { CurrentDoorState, TargetDoorState } = this.Characteristic;
    const t = this.getTiming();

    if (sendPress) {
      const code = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE)!.code;
      this.ownCommandUntil = Date.now() + OWN_COMMAND_ECHO_SECONDS * 1000;
      // Same value the Tuya app sends; the relay pulses once whatever the value.
      await this.sendCommands([{ code, value: false }]);
    }

    this.clearCycleTimers();
    this.cycleActive = true;
    this.mainService().getCharacteristic(TargetDoorState).updateValue(TargetDoorState.OPEN);
    this.setDisplayedState(CurrentDoorState.OPENING);
    this.after(t.opening, () => this.setDisplayedState(CurrentDoorState.OPEN));
    this.after(t.opening + t.open, () => {
      this.mainService().getCharacteristic(TargetDoorState).updateValue(TargetDoorState.CLOSED);
      this.setDisplayedState(CurrentDoorState.CLOSING);
    });
    this.after(t.opening + t.open + t.closing, () => this.stopCycle());
  }

  /** Ends the cycle and shows the door closed. */
  private stopCycle() {
    const { CurrentDoorState, TargetDoorState } = this.Characteristic;
    this.clearCycleTimers();
    this.cycleActive = false;
    this.mainService().getCharacteristic(TargetDoorState).updateValue(TargetDoorState.CLOSED);
    this.setDisplayedState(CurrentDoorState.CLOSED);
  }

  private setDisplayedState(state: CharacteristicValue) {
    this.log.debug('Showing door state %s.', state);
    this.displayedState = state;
    this.mainService().getCharacteristic(this.Characteristic.CurrentDoorState).updateValue(state);
  }

  private after(seconds: number, fn: () => void) {
    const timer = setTimeout(fn, seconds * 1000);
    timer.unref?.();
    this.cycleTimers.push(timer);
  }

  private clearCycleTimers() {
    this.cycleTimers.forEach(timer => clearTimeout(timer));
    this.cycleTimers = [];
  }
}
