import { TuyaDeviceSchema, TuyaDeviceSchemaType } from '../../cloud/device/TuyaDevice';
import BaseAccessory from './BaseAccessory';
import { configureName } from './characteristic/Name';
import { configureOn } from './characteristic/On';
import { configureEnergyUsage } from './characteristic/EnergyUsage';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { configureCurrentRelativeHumidity } from './characteristic/CurrentRelativeHumidity';

const SCHEMA_CODE = {
  ON: ['switch', 'switch_1'], // switch_2, switch_3, switch_4, ..., switch_usb1, switch_usb2, switch_usb3, ..., switch_backlight
  CURRENT: ['cur_current'],
  POWER: ['cur_power'],
  VOLTAGE: ['cur_voltage'],
  TOTAL_POWER: ['add_ele'],
  CURRENT_TEMP: ['va_temperature', 'temp_current'],
  CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
  INCHING: ['switch_inching'],
};

export default class SwitchAccessory extends BaseAccessory {

  override requiredSchema() {
    return [SCHEMA_CODE.ON];
  }

  override configureServices() {

    const oldService = this.accessory.getService(this.mainService());
    if (oldService && oldService?.subtype === undefined) {
      this.platform.log.warn('Remove old service:', oldService.UUID);
      this.accessory.removeService(oldService);
    }

    const schemata = this.device.schema.filter(
      (schema) => schema.code.startsWith('switch') && schema.type === TuyaDeviceSchemaType.Boolean,
    );

    this.log.info(`[SwitchAccessory] Found ${schemata.length} switch schemas: ${schemata.map(s => s.code).join(', ')}`);

    // Now configure the switches in the schema
    schemata.forEach((schema, index) => {
      // Use human-readable names instead of raw code names (which contain underscores)
      let name: string;
      if (schemata.length === 1) {
        name = this.device.name;
      } else {
        // For multiple switches, append "#1", "#2", etc. or use "Switch 1", "Switch 2"
        const switchMatch = schema.code.match(/^switch_(\d+)$/);
        const switchNum = switchMatch ? switchMatch[1] : (index + 1).toString();
        name = `${this.device.name} ${switchNum}`;
      }
      this.configureSwitch(schema, name);
    });

    // Other
    configureCurrentTemperature(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    configureCurrentRelativeHumidity(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
    this.configureInching();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async onDeviceInfoUpdate(info: unknown) {
    // Re-run service configuration so newly auto-detected switches get their handlers registered.
    this.configureServices();
    this.configureStatusActive();
    await this.updateAllValues();
  }


  mainService() {
    return this.Service.Switch;
  }

  configureSwitch(schema: TuyaDeviceSchema, name: string) {

    const service = this.accessory.getService(schema.code)
      || this.accessory.addService(this.mainService(), name, schema.code);

    configureName(this, service, name);
    configureOn(this, service, schema);

    if (schema.code === this.getSchema(...SCHEMA_CODE.ON)?.code) {
      configureEnergyUsage(
        this.platform.api,
        this,
        service,
        this.getSchema(...SCHEMA_CODE.CURRENT),
        this.getSchema(...SCHEMA_CODE.POWER),
        this.getSchema(...SCHEMA_CODE.VOLTAGE),
        this.getSchema(...SCHEMA_CODE.TOTAL_POWER),
      );
    }
  }

  configureInching() {
    const schema = this.getSchema(...SCHEMA_CODE.INCHING);
    if (!schema || schema.type !== TuyaDeviceSchemaType.String) {
      return;
    }

    const service = this.accessory.getService(schema.code)
      || this.accessory.addService(this.Service.Switch, schema.code, schema.code);

    configureName(this, service, schema.code);
    service.getCharacteristic(this.Characteristic.On)
      .onGet(() => {
        this.checkOnlineStatus();
        const status = this.getStatus(schema.code)!;
        const buffer = Buffer.from(status.value as string, 'base64');
        return (buffer.length === 3) && (buffer[0] === 1);
      })
      .onSet(async value => {
        const status = this.getStatus(schema.code)!;
        let buffer = Buffer.from(status.value as string, 'base64');
        if (buffer.length !== 3) {
          buffer = Buffer.alloc(3);
        }
        buffer[0] = (value as boolean) ? 1 : 0;
        await this.sendCommands([{
          code: schema.code,
          value: buffer.toString('base64'),
        }], true);
      });
  }

}
