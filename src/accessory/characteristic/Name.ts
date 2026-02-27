import { Service } from 'homebridge';
import BaseAccessory from '../BaseAccessory';
import { sanitizeName } from '../../util/util';

export function configureName(accessory: BaseAccessory, service: Service, name: string) {

  const fallbackName = name.replace(/[^A-Za-z0-9 '\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const safeName = sanitizeName(name) ?? (fallbackName || 'Tuya Service');

  service.setCharacteristic(accessory.Characteristic.Name, safeName);
  if (!service.testCharacteristic(accessory.Characteristic.ConfiguredName)) {
    service.addOptionalCharacteristic(accessory.Characteristic.ConfiguredName); // silence warning
  }
  // update every time so cached invalid names get corrected on restart
  service.setCharacteristic(accessory.Characteristic.ConfiguredName, safeName);

}
