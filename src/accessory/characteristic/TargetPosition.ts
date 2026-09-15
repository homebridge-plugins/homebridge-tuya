import { CharacteristicProps, Service, Units } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaEnumProperty, TuyaDeviceSchemaType } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';
import { ControlRange } from './PositionState';
import { onGetPositionHandler } from './CurrentPosition';
import { toHapProperty } from '../../util/util';

export function configureTargetPosition(
  accessory: BaseAccessory,
  service: Service,
  schema?: TuyaDeviceSchema,
  invert?: boolean) {

  if (!schema) {
    return;
  }

  if (schema.type === TuyaDeviceSchemaType.Integer) {
    return _configureTargetPosition(accessory, service, schema, invert);
  } else if (schema.type === TuyaDeviceSchemaType.Enum) {
    accessory.log.warn('_configureTargetPositionByPositionState');
    return _configureTargetPositionByPositionState(accessory, service, schema, invert);
  } else {
    // nop
    return;
  }
}

function _configureTargetPosition(
  accessory: BaseAccessory,
  service: Service,
  percentSchema?: TuyaDeviceSchema,
  invert?: boolean) {

  if (!percentSchema) {
    return;
  }
  const hapProps = toHapProperty(percentSchema.property) as CharacteristicProps;
  const onGet = onGetPositionHandler(accessory, percentSchema, !!invert);

  service.getCharacteristic(accessory.Characteristic.TargetPosition)
    .onGet(onGet)
    .onSet(async value => {
      if (invert) {
        await accessory.sendCommands([{ code: percentSchema.code, value: (100 - (value as number)) }], true);
      } else {
        await accessory.sendCommands([{ code: percentSchema.code, value: (value as number) }], true);
      }
    })
    .setProps(hapProps);
}

function _configureTargetPositionByPositionState(
  accessory: BaseAccessory,
  service: Service,
  controlSchema?: TuyaDeviceSchema,
  invert?: boolean) {

  if (!controlSchema) {
    return;
  }

  const hapProps = { minValue: 0, maxValue: 100, minStep: 50, unit: Units.PERCENTAGE };

  let isOldSchema = false;
  if (controlSchema) {
    const props = controlSchema.property as TuyaDeviceSchemaEnumProperty;
    isOldSchema = !props.range.includes(ControlRange.Open[0]);
  }
  service.getCharacteristic(accessory.Characteristic.TargetPosition)
    .onGet(() => {
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
    .onSet(async value => {
      let control: string;
      const index = isOldSchema ? 1 : 0;
      const normalizedValue = invert ? 100 - (value as number) : value as number;
      if (normalizedValue === 0) {
        control = ControlRange.Close[index];
      } else {
        control = ControlRange.Open[index];
      }
      await accessory.sendCommands([{ code: controlSchema.code, value: control }], true);
    })
    .setProps(hapProps);
}
