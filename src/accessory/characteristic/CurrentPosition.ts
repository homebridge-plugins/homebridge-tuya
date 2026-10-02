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
) {

  if (!!percentSchema && !!controlSchema) {
    accessory.log.debug('_configureCurrentPositionWithPositionStateControl');
    return _configureCurrentPositionWithPositionStateControl(accessory, service, percentSchema, controlSchema);
  } else if (percentSchema) {
    accessory.log.debug('_configureCurrentPosition');
    return _configureCurrentPosition(accessory, service, percentSchema);
  } else if (controlSchema) {
    accessory.log.warn('_configureCurrentPositionByPositionState');
    return _configureCurrentPositionByPositionState(accessory, service, controlSchema);
  } else {
    // nop
    return;
  }
}

function _configureCurrentPosition(
  accessory: BaseAccessory,
  service: Service,
  percentSchema: TuyaDeviceSchema,
) {

  const onGet = onGetPositionHandler(accessory, percentSchema);

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(onGet);
}

function _configureCurrentPositionByPositionState(
  accessory: BaseAccessory,
  service: Service,
  controlSchema: TuyaDeviceSchema,
) {

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(() => {
      const invert = accessory['isOpposite'] ?? false;
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
    });
}

function _configureCurrentPositionWithPositionStateControl(
  accessory: BaseAccessory,
  service: Service,
  percentSchema: TuyaDeviceSchema,
  controlSchema: TuyaDeviceSchema,
) {

  const hapProps = toHapProperty(percentSchema.property) as CharacteristicProps;
  const onGet = onGetPositionHandler(accessory, percentSchema);

  service.getCharacteristic(accessory.Characteristic.CurrentPosition)
    .onGet(onGet)
    .setProps(hapProps);
}

export function onGetPositionHandler(accessory: BaseAccessory, schema: TuyaDeviceSchema) {
  const hapProps = toHapProperty(schema.property) as CharacteristicProps;
  return () => {
    const invert = accessory['isOpposite'] ?? false;
    const status = accessory.getStatus(schema.code)!;
    if (invert) {
      return 100 - limit(status.value as number, hapProps.minValue ?? 0, hapProps.maxValue ?? 100);
    } else {
      return limit(status.value as number, hapProps.minValue ?? 0, hapProps.maxValue ?? 100);
    }
  };
}