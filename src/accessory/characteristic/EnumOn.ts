import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaEnumProperty, TuyaDeviceSchemaType } from '../../device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';
import { configureName } from './Name';

export function configureEnumOn(accessory: BaseAccessory, schema: TuyaDeviceSchema) : Record<string, Service> {
  if (!schema || schema.type !== TuyaDeviceSchemaType.Enum) {
    return {};
  }
  const enumCodes = (schema.property as TuyaDeviceSchemaEnumProperty).range;
  const switches:Record<string, Service> = {};

  for (const index in enumCodes) {
    const enumCode = enumCodes[index];
    const enumDP = createEnumOnDPCode(schema, enumCode);
    const service = accessory.accessory.getServiceById(accessory.Service.Switch, enumDP)
      || accessory.accessory.addService(accessory.Service.Switch, schema.code, enumDP);

    configureName(accessory, service, service.subtype || enumDP);
    service.getCharacteristic(accessory.Characteristic.On)
      .onSet(async (value) => {
        if (value) {
          await accessory.sendCommands([{
            code: schema.code,
            value: enumCode,
          }], true);
          // Mutually Exclusive Selection(radio button style)
          Object.entries(switches).forEach(([key, service]) => {
            if (key !== createEnumOnDPCode(schema, enumCode)) {
              const characteristic = service.getCharacteristic(accessory.Characteristic.On);
              if (characteristic.value) {
                characteristic.updateValue(false);
              }
            }
          });
        }
      })
      .onGet(() => {
        accessory.checkOnlineStatus();
        const status = accessory.getStatus(schema.code)!;
        return status.value === enumCode;
      });

    switches[enumDP] = service;
  }
  return switches;
}

function createEnumOnDPCode(schema: TuyaDeviceSchema, enumCode: string) : string {
  return `${schema.code}-${enumCode}`;
}