import { Service, ServiceCharacteristicChange, ServiceEventTypes } from 'homebridge';
import BaseAccessory from './BaseAccessory';
import { configureCurrentPosition } from './characteristic/CurrentPosition';
import { configurePositionState, configurePositionStateByPosition, ControlRange } from './characteristic/PositionState';
import { configureTargetPosition } from './characteristic/TargetPosition';
import {
  TuyaDeviceSchema,
  TuyaDeviceSchemaEnumProperty,
  TuyaDeviceSchemaIntegerProperty,
  TuyaDeviceSchemaMode,
} from '../device/TuyaDevice';
import { configureObstructionDetected } from './characteristic/ObstructionDetected';

const SCHEMA_CODE = [
  {
    NAME : 'control',
    TARGET_CONTROL: ['control', 'mach_operate'],
    TARGET_POSITION_CONTROL: ['work_state', 'control', 'mach_operate'],
    TARGET_POSITION_PERCENT: ['percent_control', 'position'],
    CONTROL_BACK: ['control_back_mode', 'control_back', 'opposite'],
    CURRENT_POSITION_PERCENT: ['percent_state'],
    OBSTRUCTION_DETECTED: ['fault'],
  },
  {
    NAME : 'control_2',
    TARGET_CONTROL: ['control2', 'mach_operate'],
    TARGET_POSITION_CONTROL: ['work_state2', 'control_2', 'mach_operate'],
    TARGET_POSITION_PERCENT: ['percent_control_2', 'position'],
    CONTROL_BACK: ['control_back_mode', 'control_back'],
    CURRENT_POSITION_PERCENT: ['percent_state'],
    OBSTRUCTION_DETECTED: ['fault'],
  },
];

export enum TriState {
  FALSE,
  TRUE,
  INDETERMINATE
}

export default class WindowCoveringAccessory extends BaseAccessory {
  // Some products treat the closed state as position 100%.
  // true: 100% -> close, 0% -> open, false: 0% -> close, 100% -> open
  private isOpposite = TriState.INDETERMINATE;

  requiredSchema() {
    // HAP mandates the presence of Current Position, Position State, and Target Position.
    // Because altering this logic may cause some devices to malfunction, the implementation will remain as it is.
    // return [SCHEMA_CODE[0].TARGET_POSITION_CONTROL];//, SCHEMA_CODE[1].TARGET_POSITION_CONTROL];
    return [];
  }

  configureServices() {
    let amount = 1;
    const schema = this.getSchema('control_2');
    if (schema) {
      amount = 2;
    }
    this.log.info('Curtain amount:', amount);

    this.isOpposite = this.isOppositePositionDevice(
      this.getSchema(...SCHEMA_CODE[0].TARGET_POSITION_CONTROL),
      this.getSchema(...SCHEMA_CODE[0].CURRENT_POSITION_PERCENT, ...SCHEMA_CODE[0].TARGET_POSITION_PERCENT),
    );

    if (this.isOpposite === TriState.TRUE) {
      this.log.info('this device treat the closed state as position 100%.');
    }

    for (let i = 0; i < amount; i++) {
      const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
        this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
      service.addListener(ServiceEventTypes.CHARACTERISTIC_CHANGE, this.positionUpdateListener.bind(
        this,
        this.getSchema(...SCHEMA_CODE[0].TARGET_POSITION_CONTROL)!,
        this.getSchema(...SCHEMA_CODE[0].CURRENT_POSITION_PERCENT, ...SCHEMA_CODE[0].TARGET_POSITION_PERCENT)!,
      ));
      configureCurrentPosition(
        this,
        service,
        this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION_PERCENT, ...SCHEMA_CODE[i].TARGET_POSITION_PERCENT),
        this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
      );

      if (this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL)) {
        configurePositionState(
          this,
          service,
          this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
        );
      } else {
        this.log.warn('configurePositionStateByPosition');
        configurePositionStateByPosition(
          this,
          service,
          this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION_PERCENT),
          this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT),
        );
      }

      configureTargetPosition(
        this,
        service,
        this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT, ...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
      );

      configureObstructionDetected(
        this,
        service,
        this.getSchema(...SCHEMA_CODE[i].OBSTRUCTION_DETECTED),
      );

      const currentPositionSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION_PERCENT);
      if (!currentPositionSchema) {
        this.currentPositionSchemaSupplmentation(
          service,
          this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT),
          this.getSchema(...SCHEMA_CODE[i].TARGET_CONTROL),
        );
      }
    }
  }

  positionUpdateListener(
    positionStateSchema: TuyaDeviceSchema,
    currentPositionSchema: TuyaDeviceSchema,
    change: ServiceCharacteristicChange,
  ) {
    switch (change.characteristic.UUID) {
      case this.Characteristic.TargetPosition.UUID: {
        this.log.debug(`characteristic change:${change.characteristic.displayName}`);
        this.log.debug(`oldValue: ${change.oldValue}, newValue:${change.newValue}`);
        if (this.isOpposite !== TriState.INDETERMINATE) {
          this.isOpposite = this.isOppositePositionDevice(positionStateSchema, currentPositionSchema);
        }
        break;
      }
      default:
        break;
    }
  }

  // Since the position state may not return the correct value when there is no current position, adjustments are made.
  currentPositionSchemaSupplmentation(service: Service, targetPositionSchema?: TuyaDeviceSchema, controlSchema?: TuyaDeviceSchema) {
    if (!targetPositionSchema || !controlSchema) {
      return;
    }
    const controlProperty = controlSchema.property as TuyaDeviceSchemaEnumProperty;
    if (controlProperty.range) {
      const range = controlProperty.range;
      if (!range.some(state => ControlRange.Stop.includes(state as (typeof ControlRange.Stop)[number]))) {
        return;
      }
      if (controlSchema.mode !== TuyaDeviceSchemaMode.READ_WRITE) {
        return;
      }
    }
    this.observeControlState(service, targetPositionSchema, controlSchema);
  }

  observeControlState(service: Service, targetPositionSchema: TuyaDeviceSchema, controlSchema: TuyaDeviceSchema) {
    const controlState = (this.getStatus(controlSchema.code)?.value as string) ?? '';
    if (ControlRange.Stop.includes(controlState as (typeof ControlRange.Stop)[number])) {
      setTimeout(() => this.observeControlState(service, targetPositionSchema, controlSchema), 500);
      return;
    }
    if (service.getCharacteristic(this.Characteristic.PositionState).value === this.Characteristic.PositionState.STOPPED) {
      setTimeout(() => this.observeControlState(service, targetPositionSchema, controlSchema), 500);
      return;
    }

    const positionProperty = targetPositionSchema.property as TuyaDeviceSchemaIntegerProperty;
    const targetPosition = (this.getStatus(targetPositionSchema.code)?.value as number) ?? 0;
    const step = positionProperty.step;
    const max = positionProperty.max;
    const min = positionProperty.min;

    let dummyPreviousPositionValue = 0;

    if (ControlRange.Open.includes(controlState as (typeof ControlRange.Open)[number])) {
      dummyPreviousPositionValue = this.isOpposite ? (targetPosition + step) : (targetPosition - step);
    } else if (ControlRange.Close.includes(controlState as (typeof ControlRange.Close)[number])) {
      dummyPreviousPositionValue = this.isOpposite ? (targetPosition - step) : (targetPosition + step);
    }

    dummyPreviousPositionValue = Math.max(min, Math.min(max, dummyPreviousPositionValue));

    // Make it appear as though the value has changed.
    service.getCharacteristic(this.Characteristic.CurrentPosition).updateValue(dummyPreviousPositionValue);
    service.getCharacteristic(this.Characteristic.TargetPosition).updateValue(dummyPreviousPositionValue);
    const updateHomeApp = (loopCount:number) => {
      const controlState = this.getStatus(controlSchema.code);
      if (ControlRange.Stop.includes(controlState?.value as (typeof ControlRange.Stop)[number])) {
        setTimeout(() => this.observeControlState(service, targetPositionSchema, controlSchema), 500);
        return;
      }
      if (service.getCharacteristic(this.Characteristic.PositionState).value === this.Characteristic.PositionState.STOPPED) {
        setTimeout(() => this.observeControlState(service, targetPositionSchema, controlSchema), 500);
        return;
      }

      service.getCharacteristic(this.Characteristic.CurrentPosition).updateValue(dummyPreviousPositionValue);
      service.getCharacteristic(this.Characteristic.TargetPosition).updateValue(targetPosition);
      service.getCharacteristic(this.Characteristic.CurrentPosition).updateValue(targetPosition);
      if (0 < loopCount) {
        setTimeout(() => updateHomeApp(--loopCount), 500);
      } else {
        this.log.warn('updating position state to STOPPED.');
        service.getCharacteristic(this.Characteristic.PositionState).updateValue(this.Characteristic.PositionState.STOPPED);
        const controlProperty = controlSchema.property as TuyaDeviceSchemaEnumProperty;
        const stop = controlProperty.range.find(state => ControlRange.Stop.includes(state as (typeof ControlRange.Stop)[number]));
        this.sendCommands([{ code: controlSchema.code, value: stop ?? ControlRange.Stop[0] }], true);
        setTimeout(() => this.observeControlState(service, targetPositionSchema, controlSchema), 500);
      }
    };
    setTimeout(() => updateHomeApp(10), 500);
  }

  isOppositePositionDevice(positionStateSchema?: TuyaDeviceSchema, currentPositionSchema?: TuyaDeviceSchema) {
    if (!positionStateSchema || !currentPositionSchema) {
      // eslint-disable-next-line max-len
      this.log.debug(`isOppositePositionDevice: ${!positionStateSchema ? 'no state schema ' : ''}${!currentPositionSchema ? 'no position schema' : ''}`);
      return TriState.INDETERMINATE;
    }
    const positionState = this.getStatus(positionStateSchema.code);
    const currentPosition = this.getStatus(currentPositionSchema.code);
    if (!positionState || !currentPosition) {
      // eslint-disable-next-line max-len
      this.log.debug(`isOppositePositionDevice: ${!positionState ? 'getState failed. ' : ''}${!currentPosition ? 'getPosition failed.' : ''}`);
      return TriState.INDETERMINATE;
    }
    const state = positionState.value;
    const position = currentPosition.value as number;
    if (position === 100) {
      if (ControlRange.Close.includes(state as (typeof ControlRange.Close)[number])) {
        return TriState.TRUE;
      } else {
        return TriState.FALSE;
      }
    } else if (position === 0) {
      if (ControlRange.Open.includes(state as (typeof ControlRange.Open)[number])) {
        return TriState.TRUE;
      } else {
        return TriState.FALSE;
      }
    }
    this.log.debug('isOppositePositionDevice: Indeterminate');
    return TriState.INDETERMINATE;
  }
}
