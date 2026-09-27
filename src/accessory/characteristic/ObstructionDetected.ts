import { Service } from 'homebridge';
import { TuyaDeviceSchema } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';

export function configureObstructionDetected(accessory: BaseAccessory, service?: Service, schema?: TuyaDeviceSchema) {
  if (!schema) {
    return;
  }

  if (!service) {
    return;
  }

  service.getCharacteristic(accessory.Characteristic.OccupancyDetected)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      return status.value !== 0;
    });
}
