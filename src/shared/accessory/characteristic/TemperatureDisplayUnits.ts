import { Service } from 'homebridge';
import { TuyaDeviceSchema } from '../../../cloud/device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';

export function configureTempDisplayUnits(accessory: BaseAccessory, service: Service, schema?: TuyaDeviceSchema) {
  if (!schema) {
    return;
  }

  const { CELSIUS, FAHRENHEIT } = accessory.Characteristic.TemperatureDisplayUnits;
  service.getCharacteristic(accessory.Characteristic.TemperatureDisplayUnits)
    .onGet(() => {
      const status = accessory.getStatus(schema.code)!;
      // Fall back to Celsius when the device never reports the unit DP, rather than
      // throwing and taking the whole accessory offline.
      const unitValue = status?.value;
      if (typeof unitValue !== 'string') {
        return CELSIUS;
      }
      return (unitValue.toLowerCase() === 'c') ? CELSIUS : FAHRENHEIT;
    })
    .onSet(async value => {
      const status = accessory.getStatus(schema.code)!;
      const current = typeof status?.value === 'string' ? status.value : 'c';
      const isLowerCase = current.toLowerCase() === current;

      let unit = (value === CELSIUS) ? 'c' : 'f';
      unit = isLowerCase ? unit.toLowerCase() : unit.toUpperCase();
      await accessory.sendCommands([{
        code: schema.code,
        value: unit,
      }]);
    });
}
