import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaIntegerProperty } from '../../../cloud/device/TuyaDevice';
import { limit, toHapProperty } from '../../util/util';
import BaseAccessory from '../BaseAccessory';

export function configureTargetTemperature(accessory: BaseAccessory, service?: Service, schema?: TuyaDeviceSchema) {

  if (!schema) {
    return;
  }

  if (!service) {
    service = accessory.accessory.getService(accessory.Service.Thermostat)
      || accessory.accessory.addService(accessory.Service.Thermostat);
  }

  const property = schema.property as TuyaDeviceSchemaIntegerProperty || {};
  const props = toHapProperty(property);
  const multiple = Math.pow(10, property['scale'] || 0);
  service.getCharacteristic(accessory.Characteristic.TargetTemperature)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      return limit(status.value as number / multiple, props['minValue'], props['maxValue']);
    })
    .onSet(async value => {
      await accessory.sendCommands([{
        code: schema.code,
        value: value as number * multiple,
      }]);
    })
    .setProps(props);

}
