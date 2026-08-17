import { CharacteristicProps, PartialAllowingNull, Service } from 'homebridge';
import {
  TuyaDeviceSchema,
  TuyaDeviceSchemaEnumProperty,
  TuyaDeviceSchemaIntegerProperty,
  TuyaDeviceSchemaType,
} from '../../../cloud/device/TuyaDevice';
import { deepClone, limit, toHapProperty } from '../../util/util';
import BaseAccessory from '../BaseAccessory';

export function configureRotationSpeed(
  accessory: BaseAccessory,
  service: Service,
  schema?: TuyaDeviceSchema,
) {

  if (!schema) {
    return;
  }

  if (schema.type === TuyaDeviceSchemaType.Enum) {
    configureRotationSpeedEnum(accessory, service, schema, ['auto']);
  } else if (schema.type === TuyaDeviceSchemaType.Integer) {
    configureRotationSpeedInteger(accessory, service, schema);
  } else {
    configureRotationSpeedOn(accessory, service, schema);
  }
}

function configureRotationSpeedInteger(
  accessory: BaseAccessory,
  service: Service,
  schema: TuyaDeviceSchema,
) {
  accessory.log.debug('configureRotationSpeedInteger');

  const property = schema.property as TuyaDeviceSchemaIntegerProperty;
  const hapProperty = toHapProperty(property) as PartialAllowingNull<CharacteristicProps>;
  const rotationSpeedProperty = integerToPercentageProperty(property);

  const multiple = Math.pow(10, property.scale);

  const onGetHandler = () => {
    const status = accessory.getStatus(schema.code)!;
    const value = status.value as number / multiple;
    let level = ((value - hapProperty.minValue!) / hapProperty.minStep!);
    if (hapProperty.minValue !== 0) {
      level += 1;
    }
    const hapValue = level * rotationSpeedProperty.minStep!;
    return limit(hapValue, rotationSpeedProperty.minValue!, rotationSpeedProperty.maxValue!);
  };

  accessory.log.debug('Set props for RotationSpeed:', rotationSpeedProperty);
  service.getCharacteristic(accessory.Characteristic.RotationSpeed)
    .onGet(onGetHandler)
    .onSet(async value => {
      const percent = Number(value);
      if (!Number.isFinite(percent) || percent <= 0) {
        return;
      }
      const hapLevel = Math.floor(percent / rotationSpeedProperty.minStep!);
      const speed = hapLevel * hapProperty.minStep! * multiple;
      await accessory.sendCommands([{ code: schema.code, value: speed }], true);
    })
    .updateValue(onGetHandler())
    .setProps(rotationSpeedProperty);
}

function configureRotationSpeedEnum(
  accessory: BaseAccessory,
  service: Service,
  schema: TuyaDeviceSchema,
  ignoreValues?: string[],
) {
  accessory.log.debug('configureRotationSpeedEnum');

  const property = schema.property as TuyaDeviceSchemaEnumProperty;
  const cloneProperty = deepClone(property);
  const range: string[] = [];
  for (const value of property.range) {
    if (ignoreValues?.includes(value)) {
      continue;
    }
    range.push(value);
  }
  cloneProperty.range = range;
  const rotationSpeedProperty = enumToPercentageProperty(cloneProperty);

  const onGetHandler = () => {
    const status = accessory.getStatus(schema.code)!;
    const index = range.indexOf(status.value as string);
    const level = index + 1;
    const hapValue = level * rotationSpeedProperty.minStep!;
    return limit(hapValue, rotationSpeedProperty.minValue!, rotationSpeedProperty.maxValue!);
  };

  accessory.log.debug('Set props for RotationSpeed:', rotationSpeedProperty);
  service.getCharacteristic(accessory.Characteristic.RotationSpeed)
    .onGet(onGetHandler)
    .onSet(async value => {
      const percent = Number(value);
      if (!Number.isFinite(percent) || percent <= 0) {
        return;
      }
      const speed = String(Math.floor(percent / rotationSpeedProperty.minStep!));
      await accessory.sendCommands([{ code: schema.code, value: speed }], true);
    })
    .updateValue(onGetHandler())
    .setProps(rotationSpeedProperty);
}

export function configureRotationSpeedLevel(
  accessory: BaseAccessory,
  service: Service,
  schema?: TuyaDeviceSchema,
  ignoreValues?: string[],
) {

  if (!schema) {
    return;
  }

  const property = schema.property as TuyaDeviceSchemaEnumProperty;
  const range: string[] = [];
  for (const value of property.range) {
    if (ignoreValues?.includes(value)) {
      continue;
    }
    range.push(value);
  }

  const props = { minValue: 0, maxValue: range.length, minStep: 1, unit: 'speed' };
  accessory.log.debug('Set props for RotationSpeed:', props);

  const onGetHandler = () => {
    const status = accessory.getStatus(schema.code)!;
    const index = range.indexOf(status.value as string);
    return limit(index + 1, props.minValue, props.maxValue);
  };

  service.getCharacteristic(accessory.Characteristic.RotationSpeed)
    .onGet(onGetHandler)
    .onSet(async value => {
      accessory.log.debug('Set RotationSpeed to:', value);
      const index = Math.round(value as number - 1);
      if (index < 0 || index >= range.length) {
        accessory.log.debug('Out of range, return.');
        return;
      }
      const speedLevel = range[index].toString();
      accessory.log.debug('Set RotationSpeedLevel to:', speedLevel);
      await accessory.sendCommands([{ code: schema.code, value: speedLevel }], true);
    })
    .updateValue(onGetHandler()) // ensure the value is correct before set props
    .setProps(props);
}

function configureRotationSpeedOn(
  accessory: BaseAccessory,
  service: Service,
  schema: TuyaDeviceSchema,
) {
  accessory.log.debug('configureRotationSpeedOn');

  const props = { minValue: 0, maxValue: 100, minStep: 100, unit: '%' };
  accessory.log.debug('Set props for RotationSpeed:', props);

  service.getCharacteristic(accessory.Characteristic.RotationSpeed)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      return (status.value as boolean) ? 100 : 0;
    })
    .setProps(props);
}

export function integerToPercentageProperty(property: TuyaDeviceSchemaIntegerProperty): PartialAllowingNull<CharacteristicProps> {
  const hapProperty = toHapProperty(property) as PartialAllowingNull<CharacteristicProps>;
  let stepCount:number;
  if (hapProperty.minValue === 0) {
    stepCount = Math.min(100, Math.ceil(hapProperty.maxValue! / hapProperty.minStep!));
  } else {
    stepCount = Math.min(100, Math.ceil((hapProperty.maxValue! - hapProperty.minValue!) / hapProperty.minStep!) + 1);
  }
  return { minValue: 0, maxValue: 100, minStep: Math.floor(100 / stepCount), unit: '%' };
}

export function enumToPercentageProperty(property: TuyaDeviceSchemaEnumProperty): PartialAllowingNull<CharacteristicProps> {
  const min = 0;
  const max = property.range.length;
  const step = 1;
  return integerToPercentageProperty({ min: min, max: max, step: step, scale: 0, unit: '%' });
}