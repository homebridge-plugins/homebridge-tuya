import { CharacteristicValue } from 'homebridge';

import BaseAccessory from './BaseAccessory';
import { TuyaDeviceStatus } from '../device/TuyaDevice';
import { maskSecret } from '../util/util';

const SCHEMA_CODE = {
  LOCK_CURRENT_STATE: ['open_close', 'closed_opened', 'lock_motor_state'],
  LOCK_TARGET_STATE: ['lock_motor_state'],
};

/**
 * Tuya's "Door lock equipment is not online!". For a Bluetooth lock behind a
 * gateway this is not a permanent error — it means the request arrived while
 * the lock was not holding its link.
 */
const DEVICE_NOT_ONLINE_CODE = 2312;

/**
 * Measured on a Tuya BLE lock (category `ms`) behind a Tuya gateway, from the
 * device's own connection log over six hours:
 *
 *   19:39:51 online -> 19:43:39 offline   (window 3m48s, then 34m offline)
 *   20:18:21 online -> 20:19:37 offline   (window 1m16s, then 19m offline)
 *   20:38:56 online -> 20:40:08 offline   (window 1m12s, then 24m offline)
 *   21:04:42 online -> 21:06:47 offline   (window 2m05s, then 72m offline)
 *
 * The lock holds its link for one or two minutes and drops it for twenty to
 * seventy. A door-operate sent into one of those gaps is rejected with 2312,
 * and the lock came back online roughly 40s after a burst of four rejected
 * attempts. So a 2312 is a closed window, not a failure: keep asking across
 * one plausible window rather than giving up on the first no.
 *
 * Four attempts inside seven seconds caught nothing, which is why this is
 * measured in minutes.
 */
const RETRY_WINDOW = 90 * 1000;
const RETRY_INTERVAL = 10 * 1000;

/**
 * How long HomeKit's `LockTargetState` stays pinned to the value the user
 * asked for, while we wait for the device to report its real state over MQTT.
 * Without this, `updateAllValues()` snaps the target back to the reported
 * state on the very next status event, and the Home app then refuses to
 * re-send an identical target on the next tap.
 *
 * It has to outlast the retry window, or the Home app would drop back to
 * "locked" while the plugin is still trying.
 */
const PENDING_TARGET_STATE_TIMEOUT = RETRY_WINDOW + 15 * 1000;

/** What one attempt at the two-step Smart Lock flow concluded. */
type DoorOperationOutcome = 'ok' | 'unreachable' | 'failed';

/**
 * Tuya Smart Lock (categories `ms`, `jtmspro`), including Bluetooth locks
 * reachable through a Tuya gateway.
 *
 * Unlocking does not go through the regular `/devices/{id}/commands` DP write.
 * It uses the Smart Lock Open Service:
 *   1. POST /v1.0/smart-lock/devices/{id}/password-ticket      -> ticket_id
 *   2. POST /v1.0/smart-lock/devices/{id}/password-free/door-operate
 * See TuyaDeviceManager.getLockTemporaryKey / sendLockCommands.
 */
export default class LockAccessory extends BaseAccessory {

  private pendingTargetState?: CharacteristicValue;
  private pendingTargetStateTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;

  requiredSchema() {
    return [SCHEMA_CODE.LOCK_CURRENT_STATE];
  }

  configureServices() {
    this.configureLockCurrentState();
    this.configureLockTargetState();
  }

  mainService() {
    return this.accessory.getService(this.Service.LockMechanism)
      || this.accessory.addService(this.Service.LockMechanism);
  }

  configureLockCurrentState() {
    const schema = this.getSchema(...SCHEMA_CODE.LOCK_CURRENT_STATE);
    if (!schema) {
      this.log.warn('[Lock] No schema found for LockCurrentState (tried: %s). State reporting is disabled.',
        SCHEMA_CODE.LOCK_CURRENT_STATE.join(', '));
      return;
    }

    const { UNSECURED, SECURED } = this.Characteristic.LockCurrentState;
    this.mainService().getCharacteristic(this.Characteristic.LockCurrentState)
      .onGet(() => {
        const status = this.getStatus(schema.code);
        if (!status) {
          this.log.debug('[Lock] LockCurrentState: no status reported for dp `%s` yet, assuming SECURED.', schema.code);
          return SECURED;
        }
        return (status.value as boolean) ? UNSECURED : SECURED;
      });

    this.log.debug('[Lock] LockCurrentState is driven by dp `%s`.', schema.code);
  }

  configureLockTargetState() {
    const schema = this.getSchema(...SCHEMA_CODE.LOCK_TARGET_STATE);
    if (!schema) {
      this.log.warn('[Lock] No schema found for LockTargetState (tried: %s). '
        + 'Remote lock/unlock from HomeKit is DISABLED for this device.',
      SCHEMA_CODE.LOCK_TARGET_STATE.join(', '));
      return;
    }

    const { UNSECURED, SECURED } = this.Characteristic.LockTargetState;
    this.mainService().getCharacteristic(this.Characteristic.LockTargetState)
      .onGet(() => {
        if (this.pendingTargetState !== undefined) {
          return this.pendingTargetState;
        }
        const status = this.getStatus(schema.code);
        if (!status) {
          return SECURED;
        }
        return (status.value as boolean) ? UNSECURED : SECURED;
      })
      .onSet(async value => {
        await this.setLockTargetState(value);
      });

    this.log.debug('[Lock] LockTargetState handler registered (dp `%s`). '
      + 'Writes are routed through the Tuya Smart Lock Open Service.', schema.code);
  }

  /**
   * HomeKit -> Tuya. Never reports success optimistically: `LockCurrentState`
   * keeps reflecting whatever the device last reported, and only a real device
   * status update moves it.
   */
  private async setLockTargetState(value: CharacteristicValue) {
    const { UNSECURED } = this.Characteristic.LockTargetState;
    const open = (value === UNSECURED);

    this.log.info('[Lock] HomeKit requested target state: %s', open ? 'UNSECURED' : 'SECURED');

    // A BLE sub-device behind a gateway is routinely reported as `online:
    // false` by Tuya while remote unlocking still works — the gateway is what
    // has to be online. So warn, but let the Smart Lock API be the authority.
    if (this.device.online === false) {
      this.log.warn('[Lock] Tuya reports this device as offline. Trying the %s anyway '
        + '(BLE sub-devices are often reported offline while the gateway relays fine).',
      open ? 'unlock' : 'lock');
    }

    this.setPendingTargetState(value);

    const outcome = await this.performDoorOperation(open);

    if (outcome === 'failed') {
      this.clearPendingTargetState();
      this.updateAllValues();
      throw this.communicationError();
    }

    if (outcome === 'unreachable') {
      // Deliberately not an error to HomeKit, and deliberately not awaited.
      // A HAP write that takes 90s times out on the controller no matter what
      // it eventually returns, so the first attempt answers and the rest runs
      // behind it: the Home app shows "Unlocking…" while the pending target
      // state holds, and either the device reports the unlock or the state
      // falls back to what the lock actually says.
      this.log.info('[Lock] Lock is not reachable through the gateway right now. '
        + 'Retrying for up to %ds in the background — HomeKit will show the real state '
        + 'once the lock answers.', RETRY_WINDOW / 1000);
      this.scheduleRetry(open, Date.now() + RETRY_WINDOW);
      return;
    }

    this.log.info('[Lock] Door operation accepted. Waiting for the device to report its real state '
      + '(HomeKit is NOT marked as %s yet).', open ? 'unlocked' : 'locked');
  }

  /**
   * Keeps asking until the lock's next connection window opens, the deadline
   * passes, or something cancels the pending state (a device report, or the
   * user asking for the opposite).
   */
  private scheduleRetry(open: boolean, deadline: number) {
    this.clearRetryTimer();

    this.retryTimer = setTimeout(async () => {
      if (this.pendingTargetState === undefined) {
        this.log.debug('[Lock] Retry cancelled: no target state is pending any more.');
        return;
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.log.warn('[Lock] Gave up after %ds: the lock never became reachable through the gateway. '
          + 'HomeKit is falling back to the last state the lock reported.', RETRY_WINDOW / 1000);
        this.clearPendingTargetState();
        this.updateAllValues();
        return;
      }

      this.log.debug('[Lock] Retrying the door operation (%ds left in the window)...', Math.round(remaining / 1000));
      const outcome = await this.performDoorOperation(open);

      if (outcome === 'ok') {
        this.log.info('[Lock] Door operation accepted on retry. Waiting for the device to report its real state.');
        return;
      }

      if (outcome === 'failed') {
        this.clearPendingTargetState();
        this.updateAllValues();
        return;
      }

      this.scheduleRetry(open, deadline);
    }, RETRY_INTERVAL);

    this.retryTimer.unref?.();
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Runs the two-step Smart Lock Open Service flow once.
   * Reports the outcome — after logging why — instead of throwing, so the
   * caller owns the single HomeKit-facing error and the retry decision.
   */
  private async performDoorOperation(open: boolean): Promise<DoorOperationOutcome> {
    this.log.debug('[Lock] Requesting Tuya password ticket...');

    const ticketRes = await this.deviceManager.getLockTemporaryKey(this.device.id);
    if (!ticketRes.success) {
      this.log.error('[Lock] password-ticket failed:\n  success=false\n  code=%s\n  msg=%s',
        ticketRes.code, ticketRes.msg);
      return 'failed';
    }

    const ticketID = ticketRes.result?.ticket_id;
    if (!ticketID) {
      this.log.error('[Lock] password-ticket returned success but no ticket_id. '
        + 'Result keys: %s', Object.keys(ticketRes.result || {}).join(', ') || '<empty>');
      return 'failed';
    }

    this.log.debug('[Lock] password-ticket response:\n  success=true\n  ticket_id=%s\n  expire_time=%s',
      maskSecret(ticketID), ticketRes.result?.expire_time);

    this.log.debug('[Lock] Sending door operation:\n  open=%s', open);

    const operateRes = await this.deviceManager.sendLockCommands(this.device.id, ticketID, open);

    // Tuya may answer `success: true` with `result: false`, meaning the cloud
    // accepted the request but the lock refused the operation.
    if (!operateRes.success) {
      // 2312 is the lock being between connection windows. It is the normal
      // case for a BLE lock, so it is logged as a warning and left to the
      // retry loop — and the diagnostics lookup is skipped, or every attempt
      // would spend an extra API call re-reading settings that cannot have
      // changed since the last one.
      if (operateRes.code === DEVICE_NOT_ONLINE_CODE) {
        this.log.warn('[Lock] door-operate rejected:\n  success=false\n  code=%s\n  msg=%s',
          operateRes.code, operateRes.msg);
        return 'unreachable';
      }

      this.log.error('[Lock] door-operate failed:\n  success=false\n  code=%s\n  msg=%s',
        operateRes.code, operateRes.msg);
      await this.logRemoteUnlockDiagnostics();
      return 'failed';
    }

    if (operateRes.result === false) {
      this.log.error('[Lock] door-operate rejected by the device:\n  success=true\n  result=false');
      await this.logRemoteUnlockDiagnostics();
      return 'failed';
    }

    this.log.debug('[Lock] door-operate response:\n  success=true\n  result=%o', operateRes.result);
    return 'ok';
  }

  /**
   * Best-effort diagnostics after a rejected door operation: tells the user
   * which remote unlocking methods the lock actually exposes.
   */
  private async logRemoteUnlockDiagnostics() {
    if (typeof this.deviceManager.getLockRemoteUnlockMethods !== 'function') {
      return;
    }

    try {
      const res = await this.deviceManager.getLockRemoteUnlockMethods(this.device.id);
      if (!res.success) {
        this.log.warn('[Lock] Could not read the supported remote unlocking methods: code=%s, msg=%s',
          res.code, res.msg);
        return;
      }
      this.log.warn('[Lock] Remote unlocking methods reported by this lock: %o', res.result);
      this.log.warn('[Lock] If the list is empty, enable remote unlocking for this lock in the Tuya/Smart Life app.');
    } catch (error) {
      this.log.debug('[Lock] Remote unlocking methods lookup threw: %s', (error as Error).message);
    }
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    const schema = this.getSchema(...SCHEMA_CODE.LOCK_CURRENT_STATE);
    const update = schema && status.find(item => item.code === schema.code);

    if (update) {
      this.log.debug('[Lock] Device reported %s = %o', update.code, update.value);

      if (this.pendingTargetState !== undefined) {
        const { UNSECURED, SECURED } = this.Characteristic.LockTargetState;
        const reported = (update.value as boolean) ? UNSECURED : SECURED;
        if (reported === this.pendingTargetState) {
          this.log.debug('[Lock] Device reached the requested state. Releasing the pending target state.');
          this.clearPendingTargetState();
        }
      }
    }

    await super.onDeviceStatusUpdate(status);
  }

  private setPendingTargetState(value: CharacteristicValue) {
    // A fresh request supersedes whatever was still being retried, including
    // one going the opposite way.
    this.clearRetryTimer();
    this.pendingTargetState = value;

    if (this.pendingTargetStateTimer) {
      clearTimeout(this.pendingTargetStateTimer);
    }
    this.pendingTargetStateTimer = setTimeout(() => {
      this.log.debug('[Lock] Timed out after %ds waiting for the device to report the requested state. '
        + 'Falling back to the reported state.', PENDING_TARGET_STATE_TIMEOUT / 1000);
      this.clearPendingTargetState();
      this.updateAllValues();
    }, PENDING_TARGET_STATE_TIMEOUT);

    // Don't hold the event loop open.
    this.pendingTargetStateTimer.unref?.();
  }

  private clearPendingTargetState() {
    this.clearRetryTimer();
    this.pendingTargetState = undefined;
    if (this.pendingTargetStateTimer) {
      clearTimeout(this.pendingTargetStateTimer);
      this.pendingTargetStateTimer = undefined;
    }
  }

  private communicationError() {
    const { HapStatusError, HAPStatus } = this.platform.api.hap;
    return new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

}
