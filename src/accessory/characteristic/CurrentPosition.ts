import { CharacteristicProps, Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaEnumProperty } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';
import { limit, toHapProperty } from '../../util/util';
import { ControlRange } from './PositionState';

export function configureCurrentPosition(
  accessory: BaseAccessory,
  service: Service,
  percentSchema?: TuyaDeviceSchema,
  controlSchema?: TuyaDeviceSchema,
  invert?: boolean) {

  if (!!percentSchema && !!controlSchema) {
    accessory.log.debug('_configureCurrentPositionWithPositionStateControl');
    return _configureCurrentPositionWithPositionStateControl(accessory, service, percentSchema, controlSchema, invert);
  } else if (percentSchema) {
    accessory.log.debug('_configureCurrentPosition');
    return _configureCurrentPosition(accessory, service, percentSchema, invert);
  } else if (controlSchema) {
    accessory.log.warn('_configureCurrentPositionByPositionState');
    return _configureCurrentPositionByPositionState(accessory, service, controlSchema, invert);
  } else {
    // nop
    return;
  }
}

function _configureCurrentPosition(
  accessory: BaseAccessory,
  service: Service,
  percentSchema: TuyaDeviceSchema,
  invert?: boolean) {

  const onGet = onGetPositionHandler(accessory, percentSchema, !!invert);

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(onGet)
    .on('change', (context) => {
      // https://github.com/homebridge-plugins/homebridge-tuya/pull/50
      // Although the implementation is unconventional, it was reportedly necessary to achieve the correct behavior on actual hardware.
      // In principle, PositionState is a read‑only characteristic and should not be updated or set.
      if (context.newValue === 0 || context.newValue === 100) {
        service.updateCharacteristic(
          accessory.Characteristic.PositionState,
          accessory.Characteristic.PositionState.STOPPED,
        );
      }
    });
}

function _configureCurrentPositionByPositionState(
  accessory: BaseAccessory,
  service: Service,
  controlSchema: TuyaDeviceSchema,
  invert?: boolean) {

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(() => {
      accessory.log.debug(`CurrentPosition backMode: ${invert}`);
      const status = accessory.getStatus(controlSchema.code)!;
      if (ControlRange.Close.includes(status.value as (typeof ControlRange.Close)[number])) {
        return invert ? 100 : 0;
      } else if (ControlRange.Stop.includes(status.value as (typeof ControlRange.Stop)[number])) {
        return 50;
      } else if (ControlRange.Continue.includes(status.value as (typeof ControlRange.Continue)[number])) {
        return 50;
      } else if (ControlRange.Open.includes(status.value as (typeof ControlRange.Open)[number])) {
        return invert ? 0 : 100;
      }
      accessory.log.warn('Unknown CurrentPosition:', status.value);
      return 50;
    })
    .on('change', (context) => {
      // https://github.com/homebridge-plugins/homebridge-tuya/pull/50
      // Although the implementation is unconventional, it was reportedly necessary to achieve the correct behavior on actual hardware.
      // In principle, PositionState is a read‑only characteristic and should not be updated or set.
      if (context.newValue === 0 || context.newValue === 100) {
        service.updateCharacteristic(
          accessory.Characteristic.PositionState,
          accessory.Characteristic.PositionState.STOPPED,
        );
      }
    });
}

function _configureCurrentPositionWithPositionStateControl(
  accessory: BaseAccessory,
  service: Service,
  percentSchema: TuyaDeviceSchema,
  controlSchema: TuyaDeviceSchema,
  invert?: boolean) {

  const hapProps = toHapProperty(percentSchema.property) as CharacteristicProps;
  const onGet = onGetPositionHandler(accessory, percentSchema, !!invert);

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(onGet)
    .setProps(hapProps)
    .on('change', (context) => {
      // Because the context value was not correct, I retrieve the current value manually.
      const currentValue = onGet();
      const newValue = context.newValue as number;
//      const newValue = onGet();
      const oldValue = context.oldValue as number;
      accessory.log.debug(`current position onchange. currentValue:${currentValue}`);
      accessory.log.debug('context:%o', context);
      // https://github.com/homebridge-plugins/homebridge-tuya/pull/50
      // Although the implementation is unconventional, it was reportedly necessary to achieve the correct behavior on actual hardware.
      // In principle, PositionState is a read‑only characteristic and should not be updated or set.
      if (newValue === 0 || newValue === 100) {
        service.updateCharacteristic(
          accessory.Characteristic.PositionState,
          accessory.Characteristic.PositionState.STOPPED,
        );
        const status = accessory.getStatus(controlSchema.code);
        const range = (controlSchema.property as TuyaDeviceSchemaEnumProperty).range ?? [];
        const stopped = range.find(state => ControlRange.Stop.includes(state as (typeof ControlRange.Stop)[number]))!;
        accessory.log.debug(`status:${status?.value}, newValue:${newValue}`);
        if (status?.value !== stopped) {
          accessory.sendCommands([{ code: controlSchema.code, value: stopped }], true);
        }
      } else if ((newValue || 0) < (oldValue || 0)) {
        service.updateCharacteristic(
          accessory.Characteristic.PositionState,
          accessory.Characteristic.PositionState.DECREASING,
        );
      } else if ((oldValue || 0) < (newValue || 0)) {
        service.updateCharacteristic(
          accessory.Characteristic.PositionState,
          accessory.Characteristic.PositionState.INCREASING,
        );
      }
    });
}

export function onGetPositionHandler(accessory: BaseAccessory, schema: TuyaDeviceSchema, invert: boolean) {
  const hapProps = toHapProperty(schema.property) as CharacteristicProps;
  return () => {
    const status = accessory.getStatus(schema.code)!;
    if (invert) {
      return 100 - limit(status.value as number, hapProps.minValue ?? 0, hapProps.maxValue ?? 100);
    } else {
      return limit(status.value as number, hapProps.minValue ?? 0, hapProps.maxValue ?? 100);
    }
  };
}