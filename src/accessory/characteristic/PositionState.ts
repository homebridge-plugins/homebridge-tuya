import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaEnumProperty } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';

export const ControlRange = {
  Open: ['open', 'ZZ'],
  Stop: ['stop', 'STOP'],
  Close: ['close', 'FZ'],
  Continue: ['continue'],
};

export function configurePositionState(
  accessory: BaseAccessory,
  service: Service,
  stateSchema?: TuyaDeviceSchema) {

  if (!stateSchema) {
    return;
  }

  const prop = stateSchema.property as TuyaDeviceSchemaEnumProperty;
  checkRange(prop);

  const { DECREASING, INCREASING, STOPPED } = accessory.Characteristic.PositionState;

  service.getCharacteristic(accessory.Characteristic.PositionState)
    .onGet(() => {
      const state = accessory.getStatus(stateSchema.code)!;
      switch (true) {
        case ControlRange.Open.includes(state.value as (typeof ControlRange.Open)[number]):
          return INCREASING;
        case ControlRange.Stop.includes(state.value as (typeof ControlRange.Stop)[number]):
          return STOPPED;
        case ControlRange.Close.includes(state.value as (typeof ControlRange.Close)[number]):
          return DECREASING;
        case ControlRange.Continue.includes(state.value as (typeof ControlRange.Continue)[number]):
          return STOPPED;
        default:
          return STOPPED;
      }
    });
}

export function configurePositionStateByPosition(
  accessory: BaseAccessory,
  service: Service,
  currentPositionSchema?: TuyaDeviceSchema,
  targetPositionSchema?: TuyaDeviceSchema,
  invert?: boolean) {

  const { DECREASING, INCREASING, STOPPED } = accessory.Characteristic.PositionState;

  service.getCharacteristic(accessory.Characteristic.PositionState)
    .onGet(() => {
      if (!currentPositionSchema || !targetPositionSchema) {
        return STOPPED;
      }

      const currentPosition = accessory.getStatus(currentPositionSchema.code)!;
      const targetPosition = accessory.getStatus(targetPositionSchema.code)!;

      accessory.log.debug(`position state onGet: current:${currentPosition.value}, target:${targetPosition.value}`);

      if (currentPosition.value === 0 || currentPosition.value === 100) {
        return STOPPED;
      }

      if (targetPosition.value === 100 && currentPosition.value !== 100) {
        return invert ? DECREASING : INCREASING;
      } else if (targetPosition.value === 0 && currentPosition.value !== 0) {
        return invert ? INCREASING : DECREASING;
      } else {
        return STOPPED;
      }
    });
}

function checkRange(prop: TuyaDeviceSchemaEnumProperty) {
  const range = prop.range;

  const open = range.find(state => ControlRange.Open.includes(state as (typeof ControlRange.Open)[number]));
  const stop = range.find(state => ControlRange.Stop.includes(state as (typeof ControlRange.Stop)[number]));
  const close = range.find(state => ControlRange.Close.includes(state as (typeof ControlRange.Close)[number]));

  const unused = range.filter(v => ![open, stop, close].includes(v));

  if (open === null && 0 < unused.length) {
    ControlRange.Open.push(unused.shift()!);
  }

  if (stop === null && 0 < unused.length) {
    ControlRange.Stop.push(unused.shift()!);
  }

  if (close === null && 0 < unused.length) {
    ControlRange.Close.push(unused.shift()!);
  }
}


