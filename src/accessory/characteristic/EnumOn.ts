import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaEnumProperty } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';
import { configureName } from './Name';

export function configureEnumOn(accessory: BaseAccessory, schema?: TuyaDeviceSchema) : Record<string, Service> {
  if (!schema || schema.type !== 'Enum') {
    return {};
  }
  const modes = (schema.property as TuyaDeviceSchemaEnumProperty).range;
  const switches:Record<string, Service> = {};

  for (const index in modes) {
    const mode = modes[index];
    const service = accessory.accessory.getServiceById(accessory.Service.Switch, schema.code + '_' + mode)
      || accessory.accessory.addService(accessory.Service.Switch, schema.code, schema.code + '_' + mode);

    configureName(accessory, service, service.subtype || (mode + '_' + index));
    service.getCharacteristic(accessory.Characteristic.On)
      .onSet(async (value) => {
        if (value) {
          // Mutually Exclusive Selection(radio button style)
          modes.forEach(other => {
            if (other !== mode) {
              switches[other]
                .getCharacteristic(accessory.Characteristic.On)
                .updateValue(false);
            }
          });
          accessory.log.info('value:' + value);
          await accessory.sendCommands([{
            code: schema.code,
            value: mode,
          }], true);
        }
      })
      .onGet(() => {
        accessory.checkOnlineStatus();
        const status = accessory.getStatus(schema.code)!;
        return status.value === mode;
      });

    switches[mode] = service;
  }
  return switches;
}
