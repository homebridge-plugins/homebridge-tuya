import { TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import { limit } from '../util/util';
import BaseAccessory from './BaseAccessory';

const SCHEMA_CODE = {
  CONTROL: ['control', 'mach_operate'],
  CURRENT_POSITION: ['percent_state'],
  TARGET_POSITION: ['percent_control', 'position'],
  POSITION: ['position'],
};

/**
 * BlindsAccessory – handles roller motor shades and blinds.
 * Supports position control with tracking and state management.
 *
 * Categories: 'mg' (blinds), 'mgmt' (motorized blinds)
 */
export default class BlindsAccessory extends BaseAccessory {

  private targetPosition?: number;
  private positionResetTimer?: NodeJS.Timeout;

  requiredSchema() {
    return [SCHEMA_CODE.CONTROL];
  }

  configureServices() {
    this.configureCurrentPosition();
    this.configurePositionState();
    this.configureTargetPosition();
  }

  /**
   * Configure CurrentPosition characteristic.
   * Read-only value showing actual blind position (0-100%).
   */
  private configureCurrentPosition() {
    const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
    const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
                         this.getSchema(...SCHEMA_CODE.POSITION);

    const service = this.accessory.getService(this.Service.WindowCovering) ||
      this.accessory.addService(this.Service.WindowCovering);

    service.getCharacteristic(this.Characteristic.CurrentPosition)
      .onGet(() => {
        // Prefer current position schema if available
        if (currentSchema) {
          const status = this.getStatus(currentSchema.code)!;
          return limit(status.value as number, 0, 100);
        }

        // Fall back to target position schema
        if (targetSchema) {
          const status = this.getStatus(targetSchema.code)!;
          return limit(status.value as number, 0, 100);
        }

        // Fall back to control command status (open/close/stop)
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        if (controlSchema) {
          const status = this.getStatus(controlSchema.code)!;
          return this.controlValueToPosition(status.value as string);
        }

        return 50; // Default to middle position
      });
  }

  /**
   * Configure PositionState characteristic.
   * Indicates if blinds are going up (INCREASING), down (DECREASING), or stopped.
   */
  private configurePositionState() {
    const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
    const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
                         this.getSchema(...SCHEMA_CODE.POSITION);

    const { DECREASING, INCREASING, STOPPED } = this.Characteristic.PositionState;

    const service = this.accessory.getService(this.Service.WindowCovering) ||
      this.accessory.addService(this.Service.WindowCovering);

    service.getCharacteristic(this.Characteristic.PositionState)
      .onGet(() => {
        // If we don't have both current and target, assume stopped
        if (!currentSchema || !targetSchema) {
          return STOPPED;
        }

        const currentStatus = this.getStatus(currentSchema.code)!;
        const targetStatus = this.getStatus(targetSchema.code)!;
        const currentPos = currentStatus.value as number;
        const targetPos = targetStatus.value as number;

        if (targetPos > currentPos) {
          return INCREASING; // Moving up/open
        } else if (targetPos < currentPos) {
          return DECREASING; // Moving down/close
        } else {
          return STOPPED; // At target position
        }
      });
  }

  /**
   * Configure TargetPosition characteristic.
   * Allows user to set desired blind position (0-100%).
   */
  private configureTargetPosition() {
    const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
    const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
                         this.getSchema(...SCHEMA_CODE.POSITION);

    if (!controlSchema && !targetSchema) {
      this.log.warn('No target position schema available for blinds control');
      return;
    }

    const service = this.accessory.getService(this.Service.WindowCovering) ||
      this.accessory.addService(this.Service.WindowCovering);

    service.getCharacteristic(this.Characteristic.TargetPosition)
      .onGet(() => {
        // If target position schema exists, use it
        if (targetSchema) {
          const status = this.getStatus(targetSchema.code)!;
          return limit(status.value as number, 0, 100);
        }

        // Otherwise, use control schema (open/close/stop)
        if (controlSchema) {
          const status = this.getStatus(controlSchema.code)!;
          return this.controlValueToPosition(status.value as string);
        }

        return this.targetPosition ?? 50;
      })
      .onSet(async (value) => {
        const targetPos = value as number;
        this.targetPosition = targetPos;

        // Clear any pending reset timer
        if (this.positionResetTimer) {
          clearTimeout(this.positionResetTimer);
          this.positionResetTimer = undefined;
        }

        // If we have a percent_control schema, use it directly
        if (targetSchema && targetSchema.code !== 'control' && targetSchema.code !== 'mach_operate') {
          await this.sendCommands([{ code: targetSchema.code, value: targetPos }], true);
        } else if (controlSchema) {
          // Otherwise, use the control schema (open/close/stop)
          const controlValue = this.positionToControlValue(targetPos);
          await this.sendCommands([{ code: controlSchema.code, value: controlValue }], true);

          // Schedule idle reset after 30 seconds if device doesn't report position
          // This prevents the blinds from continuously moving
          this.positionResetTimer = setTimeout(() => {
            this._resetToIdle();
          }, 30 * 1000);
        }
      });
  }

  /**
   * Convert HomeKit position value (0-100) to Tuya control value (open/close/stop).
   */
  private positionToControlValue(position: number): string {
    if (position >= 95) {
      return 'open';  // or 'ZZ' for some devices
    } else if (position <= 5) {
      return 'close'; // or 'FZ' for some devices
    } else {
      return 'stop';  // or 'STOP' for some devices
    }
  }

  /**
   * Convert Tuya control value (open/close/stop) to HomeKit position (0-100).
   */
  private controlValueToPosition(value: string): number {
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'open' || lowerValue === 'zz') {
      return 100;
    } else if (lowerValue === 'close' || lowerValue === 'fz') {
      return 0;
    } else if (lowerValue === 'stop' || lowerValue === 'stopped') {
      return 50;
    }
    return 50; // Default to middle
  }

  /**
   * Reset control to idle state after position movement completes.
   */
  private _resetToIdle() {
    const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
    if (controlSchema) {
      this.sendCommands([{ code: controlSchema.code, value: 'stop' }]);
    }
    this.positionResetTimer = undefined;
  }

  /**
   * Handle device status updates from cloud/local.
   */
  override async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    super.onDeviceStatusUpdate(status);

    // If we receive a position update, clear the reset timer
    const positionUpdate = status.find(s =>
      SCHEMA_CODE.CURRENT_POSITION.includes(s.code) ||
      (SCHEMA_CODE.TARGET_POSITION.includes(s.code) && s.code !== 'control'),
    );

    if (positionUpdate && this.positionResetTimer) {
      clearTimeout(this.positionResetTimer);
      this.positionResetTimer = undefined;
    }
  }
}
