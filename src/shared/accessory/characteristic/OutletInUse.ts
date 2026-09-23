import { Service } from 'homebridge';
import { TuyaDeviceSchema } from '../../../cloud/device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';

export function configureOutletInUse(accessory: BaseAccessory, service?: Service, schema?: TuyaDeviceSchema) {
  if (!schema) {
    return;
  }

  const test = accessory.getStatus(schema.code)?.value;

  service?.getCharacteristic(accessory.Characteristic.OutletInUse)
    .onGet(() => {
      return test ? true : false;
    });
}
