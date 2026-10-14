import { Service } from 'homebridge';
import { TuyaDeviceSchemaIntegerProperty } from '../device/TuyaDevice';
import { limit } from '../util/util';
import BaseAccessory from './BaseAccessory';

const SCHEMA_CODE = {
  SMOKE_STATUS: ['smoke_sensor_status', 'smoke_sensor_state'],
  CO_STATUS: ['co_status', 'co_state'],
  CO_LEVEL: ['co_value'],
  BATTERY_STATE: ['battery_state'],
  BATTERY_PERCENT: ['battery_percentage', 'residual_electricity', 'wireless_electricity', 'va_battery', 'battery'],
  FAULT: ['fault'],
};

/**
 * Smoke detector (ywbj).
 *
 * Combo smoke + CO detectors are also categorized as `ywbj` and expose
 * `co_state` / `co_status` alongside the smoke DP, so a CarbonMonoxideSensor
 * service is added when one of those DPs is present.
 */
export default class SmokeSensor extends BaseAccessory {

  requiredSchema() {
    return [SCHEMA_CODE.SMOKE_STATUS];
  }

  configureServices() {
    const sensorServices: Service[] = [];

    const smokeService = this.configureSmokeDetected();
    if (smokeService) {
      sensorServices.push(smokeService);
    }

    const coService = this.configureCarbonMonoxideDetected();
    if (coService) {
      sensorServices.push(coService);
      this.configureCarbonMonoxideLevel(coService);
    }

    for (const service of sensorServices) {
      this.configureStatusLowBattery(service);
      this.configureStatusFault(service);
    }
  }

  isAlarm(code: string) {
    const status = this.getStatus(code);
    return status !== undefined && (status.value === 'alarm' || status.value === '1');
  }

  configureSmokeDetected() {
    const schema = this.getSchema(...SCHEMA_CODE.SMOKE_STATUS);
    if (!schema) {
      return undefined;
    }

    const { SMOKE_NOT_DETECTED, SMOKE_DETECTED } = this.Characteristic.SmokeDetected;
    const service = this.accessory.getService(this.Service.SmokeSensor)
      || this.accessory.addService(this.Service.SmokeSensor);

    service.getCharacteristic(this.Characteristic.SmokeDetected)
      .onGet(() => this.isAlarm(schema.code) ? SMOKE_DETECTED : SMOKE_NOT_DETECTED);

    return service;
  }

  configureCarbonMonoxideDetected() {
    const schema = this.getSchema(...SCHEMA_CODE.CO_STATUS);
    if (!schema) {
      return undefined;
    }

    const { CO_LEVELS_ABNORMAL, CO_LEVELS_NORMAL } = this.Characteristic.CarbonMonoxideDetected;
    const service = this.accessory.getService(this.Service.CarbonMonoxideSensor)
      || this.accessory.addService(this.Service.CarbonMonoxideSensor);

    service.getCharacteristic(this.Characteristic.CarbonMonoxideDetected)
      .onGet(() => this.isAlarm(schema.code) ? CO_LEVELS_ABNORMAL : CO_LEVELS_NORMAL);

    return service;
  }

  configureCarbonMonoxideLevel(service: Service) {
    const schema = this.getSchema(...SCHEMA_CODE.CO_LEVEL);
    if (!schema) {
      return;
    }

    const property = schema.property as TuyaDeviceSchemaIntegerProperty;
    const multiple = Math.pow(10, property ? property.scale : 0);
    service.getCharacteristic(this.Characteristic.CarbonMonoxideLevel)
      .onGet(() => {
        const status = this.getStatus(schema.code)!;
        return limit(status.value as number / multiple, 0, 100);
      });
  }

  configureStatusLowBattery(service: Service) {
    // When a percentage DP exists, BaseAccessory already exposes a Battery service.
    if (this.getSchema(...SCHEMA_CODE.BATTERY_PERCENT)) {
      return;
    }

    const schema = this.getSchema(...SCHEMA_CODE.BATTERY_STATE);
    if (!schema) {
      return;
    }

    const { BATTERY_LEVEL_NORMAL, BATTERY_LEVEL_LOW } = this.Characteristic.StatusLowBattery;
    service.getCharacteristic(this.Characteristic.StatusLowBattery)
      .onGet(() => {
        const status = this.getStatus(schema.code);
        return (status?.value === 'low') ? BATTERY_LEVEL_LOW : BATTERY_LEVEL_NORMAL;
      });
  }

  configureStatusFault(service: Service) {
    const schema = this.getSchema(...SCHEMA_CODE.FAULT);
    if (!schema) {
      return;
    }

    const { NO_FAULT, GENERAL_FAULT } = this.Characteristic.StatusFault;
    service.getCharacteristic(this.Characteristic.StatusFault)
      .onGet(() => {
        // `fault` is a bitmap: any bit set means a fault is reported.
        const status = this.getStatus(schema.code);
        return (Number(status?.value ?? 0) !== 0) ? GENERAL_FAULT : NO_FAULT;
      });
  }

}
