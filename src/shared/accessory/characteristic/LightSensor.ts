import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaIntegerProperty } from '../../../cloud/device/TuyaDevice';
import { limit, toHapProperty } from '../../util/util';
import BaseAccessory from '../BaseAccessory';

export function configureLightSensor(accessory: BaseAccessory, service?: Service, schema?: TuyaDeviceSchema) {
  if (!schema) {
    return;
  }

  if (!service) {
    service = accessory.accessory.getService(accessory.Service.LightSensor)
      || accessory.accessory.addService(accessory.Service.LightSensor);
  }

  const property = schema.property as TuyaDeviceSchemaIntegerProperty || {};
  const props = toHapProperty(property);
  const multiple = Math.pow(10, property['scale'] || 0);
  service.getCharacteristic(accessory.Characteristic.CurrentAmbientLightLevel)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      return limit(status.value as number / multiple, props['minValue'], props['maxValue']);
    })
    .setProps(props);

}
