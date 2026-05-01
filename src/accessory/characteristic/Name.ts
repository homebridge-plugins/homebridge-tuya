import { Service } from 'homebridge';
import BaseAccessory from '../BaseAccessory';
import { sanitizeName } from '../../util/util';

export function configureName(accessory: BaseAccessory, service: Service, name: string) {
  const fallbackName = name.replace(/[^A-Za-z0-9 '\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const safeName = sanitizeName(name) ?? (fallbackName || 'Tuya Service');

  service.setCharacteristic(accessory.Characteristic.Name, safeName);
  if (!service.testCharacteristic(accessory.Characteristic.ConfiguredName)) {
    service.addOptionalCharacteristic(accessory.Characteristic.ConfiguredName); // silence warning
    // update every time so cached invalid names get corrected on restart
    service.setCharacteristic(accessory.Characteristic.ConfiguredName, safeName);
  } else {
    // cached Name
    const currentName = service.getCharacteristic(accessory.Characteristic.ConfiguredName).value;
    // Since unnecessary value updates were overwriting the name set in the Home app, it will now be updated only once—the first time.
    if (!currentName) {
      service.setCharacteristic(accessory.Characteristic.ConfiguredName, safeName);
    }
  }
}
