import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaIntegerProperty } from '../../device/TuyaDevice';
import { limit } from '../../util/util';
import BaseAccessory from '../BaseAccessory';

export function configureLightSensor(accessory: BaseAccessory, service?: Service, schema?: TuyaDeviceSchema) {
  if (!schema) {
    return;
  }

  if (!service) {
    service = accessory.accessory.getService(accessory.Service.LightSensor)
      || accessory.accessory.addService(accessory.Service.LightSensor);
  }

  const property = schema.property as TuyaDeviceSchemaIntegerProperty;
  service.getCharacteristic(accessory.Characteristic.CurrentAmbientLightLevel)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      return limit(status.value as number, property.min, property.max);
    });

}
