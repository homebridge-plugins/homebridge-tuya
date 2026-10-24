import BaseAccessory from './BaseAccessory';
import { configureCurrentRelativeHumidity } from './characteristic/CurrentRelativeHumidity';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';

// Standard (indoor / main unit) DPs of the qxj instruction set.
const SCHEMA_CODE = {
  CURRENT_TEMP: ['temp_current', 'va_temperature'],
  CURRENT_HUMIDITY: ['humidity_value', 'va_humidity'],
};

export default class TemperatureHumiditySensorAccessory extends BaseAccessory {
  configureServices(): void {
    const tempSchema = this.getSchema(...SCHEMA_CODE.CURRENT_TEMP);
    if (tempSchema) {
      configureCurrentTemperature(this, this.getMainService(this.Service.TemperatureSensor), tempSchema);
    }
    const humiditySchema = this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY);
    if (humiditySchema) {
      configureCurrentRelativeHumidity(this, this.getMainService(this.Service.HumiditySensor), humiditySchema);
    }

    const { temperatureSchemas, humiditySchemas } = this.getDynamicSchemaCodes();

    temperatureSchemas.forEach((schema, index) => {
      const serviceName = `Temperature Sensor ${index + 1}`;
      const serviceSubtype = `temperature_sensor_${index + 1}`;
      const service =
        this.accessory.getServiceById(this.Service.TemperatureSensor, serviceSubtype) ||
        this.accessory.addService(this.Service.TemperatureSensor, serviceName, serviceSubtype);

      service
        .getCharacteristic(this.Characteristic.CurrentTemperature)
        .onGet(() => {
          const status = this.getStatus(schema.code);
          if (status) {
            const property = this.getSchema(schema.code)?.property as { scale: number };
            const multiple = Math.pow(10, property.scale || 0);
            return Math.min(Math.max((status.value as number) / multiple, -100), 100);
          }
          return 0; // Default value if no status is found
        });
    });

    humiditySchemas.forEach((schema, index) => {
      const serviceName = `Humidity Sensor ${index + 1}`;
      const serviceSubtype = `humidity_sensor_${index + 1}`;
      const service =
        this.accessory.getServiceById(this.Service.HumiditySensor, serviceSubtype) ||
        this.accessory.addService(this.Service.HumiditySensor, serviceName, serviceSubtype);

      service
        .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
        .onGet(() => {
          const status = this.getStatus(schema.code);
          if (status) {
            return status.value as number;
          }
          return 0; // Default value if no status is found
        });
    });
  }

  // The service without subtype; getService(type) could return one of the per-channel services instead.
  private getMainService(type: typeof this.Service.TemperatureSensor | typeof this.Service.HumiditySensor) {
    return this.accessory.services.find(service => service.UUID === type.UUID && !service.subtype)
      || this.accessory.addService(type);
  }

  private getDynamicSchemaCodes() {
    const temperatureSchemas: { code: string }[] = [];
    const humiditySchemas: { code: string }[] = [];

    this.device.schema.forEach((schema) => {
      if (schema.code.includes('ToutCh')) {
        temperatureSchemas.push(schema);
      } else if (schema.code.includes('HoutCh')) {
        humiditySchemas.push(schema);
      }
    });

    return { temperatureSchemas, humiditySchemas };
  }
}
