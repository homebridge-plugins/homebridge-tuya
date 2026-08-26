import { Service } from 'homebridge';
import { TuyaDeviceSchema, TuyaDeviceSchemaType } from '../../../cloud/device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';
import { configureName } from './Name';
import { TuyaPlatformExtraRawSwitchConfig } from '../../../config';
import { updateBase64, updateHex } from '../../util/util';

export function configureRawOn(
  accessory: BaseAccessory,
  schema: TuyaDeviceSchema,
  rawSwitchConfigs: Array<TuyaPlatformExtraRawSwitchConfig>,
): Record<string, Service> {
  if (!schema || schema.type !== TuyaDeviceSchemaType.Raw) {
    return {};
  }
  const switches: Record<string, Service> = {};

  for (const index in rawSwitchConfigs) {
    const rawSwitchConfig = rawSwitchConfigs[index];
    const dp = createRawOnDPCode(schema, index);
    const service = accessory.accessory.getServiceById(accessory.Service.Switch, dp)
      || accessory.accessory.addService(accessory.Service.Switch, rawSwitchConfig.configuredName, dp);
    configureName(accessory, service, rawSwitchConfig.configuredName);
    service.getCharacteristic(accessory.Characteristic.On)
      .onSet(async (value) => {
        if (value === true) {
          const status = accessory.getStatus(schema.code)!;
          let after: string;
          if (status.value) {
            accessory.log.debug(`before:${Buffer.from(status.value as string, 'base64').toString('hex')}`);
            after = createRawData(status.value as string, rawSwitchConfig);
            accessory.log.debug(`after :${Buffer.from(after, 'base64').toString('hex')}`);
            await accessory.sendCommands([{
              code: schema.code,
              value: after,
            }], true);
          } else {
            accessory.log.warn(`${rawSwitchConfig.configuredName} status is undefined.`);
            // create dummy bytes
            const dummy = Buffer.alloc(rawSwitchConfig.byteIndex + 1).toString('base64');
            accessory.log.debug(`before:${Buffer.from(dummy, 'base64').toString('hex')}`);
            after = createRawData(dummy, rawSwitchConfig);
            accessory.log.debug(`after :${Buffer.from(after, 'base64').toString('hex')}`);
            await accessory.sendCommands([{
              code: schema.code,
              value: after,
            }], true);
          }

          // Turn off the conflicting switch.
          Object.values(switches).forEach((service, i) => {
            const conf = rawSwitchConfigs[i];
            const tempAfter = createRawData(after, conf);
            if (tempAfter !== after) {
              const characteristic = service.getCharacteristic(accessory.Characteristic.On);
              if (characteristic.value) {
                characteristic.updateValue(false);
              }
            }
          });
        } else {
          // RawOn switch can only be turned on.
          service.updateCharacteristic(accessory.Characteristic.On, true);
        }
      })
      .onGet(() => {
        accessory.checkOnlineStatus();
        const status = accessory.getStatus(schema.code)!;
        if (status.value) {
          const after = createRawData(status.value as string, rawSwitchConfig);
          return status.value === after;
        } else {
          return false;
        }
      });

    switches[dp] = service;
  }
  return switches;
}

function createRawOnDPCode(schema: TuyaDeviceSchema, index: string): string {
  return `${schema.code}-${index}`;
}

function createRawData(src: string, rawSwitchConfig: TuyaPlatformExtraRawSwitchConfig): string {
  let dst: string;
  switch (rawSwitchConfig.notation) {
    case 'base64':
      dst = updateBase64(
        src,
        rawSwitchConfig.byteIndex,
        Buffer.from(rawSwitchConfig.value.replace(/^0x/, ''), 'hex'),
      );
      break;
    case 'hex':
      dst = updateHex(
        src,
        rawSwitchConfig.byteIndex,
        Buffer.from(rawSwitchConfig.value.replace(/^0x/, ''), 'hex'),
      );
      break;
    default:
      throw new Error(`unsupported notation:${rawSwitchConfig.notation}`);
  }
  return dst;
}