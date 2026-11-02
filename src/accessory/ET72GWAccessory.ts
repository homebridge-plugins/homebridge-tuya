import { TuyaDeviceSchemaIntegerProperty } from '../device/TuyaDevice';
import { ET72GWMeasurements } from '../device/ET72GWMeasurements';
import { limit } from '../util/util';
import ThermostatAccessory from './ThermostatAccessory';
import { configureTempDisplayUnits } from './characteristic/TemperatureDisplayUnits';

/** Product-specific support for the field-verified HEATIT/Jiahong ET-72GW. */
export default class ET72GWAccessory extends ThermostatAccessory {
  private measurements?: ET72GWMeasurements;

  configureServices() {
    this.measurements?.stop();
    this.measurements = new ET72GWMeasurements(
      () => this.deviceManager.api.getDeviceShadow(this.device.id),
      { pollIntervalSeconds: 300, maxCacheAgeSeconds: 900, maxReportAgeSeconds: 0, maxHeatingReportAgeSeconds: 0 },
      () => this.publishMeasurements(), () => this.device.online, this.log,
    );
    this.configureCurrentState();
    this.configureTargetState();
    this.configureTargetTemp();
    configureTempDisplayUnits(this, this.mainService(), this.getSchema('temp_unit_convert', 'c_f'));
    this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({ minValue: -270, maxValue: 100, minStep: 0.1 })
      .onGet(() => {
        const sample = this.measurements?.currentFloor();
        if (!sample) {
          throw this.unavailable();
        }
        return sample.celsius;
      });
    this.publishMeasurements();
    this.measurements.start();
  }

  configureCurrentState() {
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => this.currentHeatingState());
  }

  configureTargetState() {
    const { OFF, HEAT, AUTO } = this.Characteristic.TargetHeatingCoolingState;
    this.mainService().getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: [OFF, HEAT, AUTO] })
      .onGet(() => this.targetMode())
      .onSet(async value => {
        this.checkOnlineStatus();
        if (value === OFF) {
          // Keep the established power command; do not alter the stored schedule or mode.
          await this.sendCommands([{ code: 'switch', value: false }]);
        } else if (value === HEAT || value === AUTO) {
          await this.deviceManager.api.setDeviceControlMode(this.device.id, value === HEAT ? 'Manual' : 'Smart');
        } else {
          const { HapStatusError, HAPStatus } = this.platform.api.hap;
          throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
        }
      });
    // setProps alone does not announce capability changes after a cached bridge is published.
    // Recompute/advertise the configuration once on setup; measurement polls never do this.
    this.mainService().emit('service-configurationChange');
  }

  private targetMode() {
    const sample = this.measurements?.currentMode();
    if (!sample) {
      throw this.unavailable();
    }
    const { OFF, HEAT, AUTO } = this.Characteristic.TargetHeatingCoolingState;
    return !sample.powered ? OFF : sample.mode === 'Manual' ? HEAT : AUTO;
  }

  private currentHeatingState() {
    const sample = this.measurements?.currentHeating();
    if (!sample) {
      throw this.unavailable();
    }
    const { OFF, HEAT } = this.Characteristic.CurrentHeatingCoolingState;
    return sample.heating ? HEAT : OFF;
  }

  private unavailable() {
    const { HapStatusError, HAPStatus } = this.platform.api.hap;
    return new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  private publishMeasurements() {
    const sample = this.measurements?.currentFloor();
    this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature)
      .updateValue(sample ? sample.celsius : this.unavailable());
    let state: number | Error;
    try {
      state = this.currentHeatingState();
    } catch {
      state = this.unavailable();
    }
    // updateValue notifies Home clients without invoking target/mode setters.
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState).updateValue(state);
    let target: number | Error;
    try {
      target = this.targetMode();
    } catch {
      target = this.unavailable();
    }
    this.mainService().getCharacteristic(this.Characteristic.TargetHeatingCoolingState).updateValue(target);
  }

  async onDeviceInfoUpdate(info) {
    await super.onDeviceInfoUpdate(info);
    this.publishMeasurements();
  }

  dispose() {
    this.measurements?.stop();
  }

  private fahrenheit() {
    const schema = this.getSchema('temp_unit_convert', 'c_f');
    const unit = schema && this.getStatus(schema.code)?.value;
    if (typeof unit === 'string' && ['c', 'f'].includes(unit.toLowerCase())) {
      return unit.toLowerCase() === 'f';
    }
    throw this.unavailable();
  }

  configureTargetTemp() {
    const schema = this.getSchema('temp_set');
    if (!schema) {
      return;
    }
    const property = (schema.property ?? {}) as TuyaDeviceSchemaIntegerProperty;
    const override = this.platform.getDeviceSchemaConfig(this.device, schema.code);
    const multiple = Math.pow(10, property.scale);
    const validScale = Number.isInteger(property.scale) && Number.isFinite(multiple) && multiple > 0;
    // Tuya's range metadata describes the advertised unit, which may remain Celsius
    // even while the device reports native Fahrenheit values. DP 102 itself uses tenths.
    const unit = typeof property.unit === 'string' ? property.unit.trim().toLowerCase() : '';
    const invalidUnit = property.unit !== undefined
      && (typeof property.unit !== 'string' || !['', 'c', '°c', '℃', 'f', '°f', '℉'].includes(unit));
    const schemaFahrenheit = ['f', '°f', '℉'].includes(unit);
    const toCelsius = (value: number, fahrenheit: boolean) => fahrenheit ? (value - 32) * 5 / 9 : value;
    let props = {
      minValue: Math.max(10, toCelsius(property.min / multiple, schemaFahrenheit)),
      maxValue: Math.min(38, toCelsius(property.max / multiple, schemaFahrenheit)),
      minStep: Math.max(0.1, property.step / multiple * (schemaFahrenheit ? 5 / 9 : 1)),
    };
    if (![props.minValue, props.maxValue, props.minStep].every(Number.isFinite) || props.maxValue <= props.minValue) {
      props = { minValue: 10, maxValue: 38, minStep: 0.1 };
    }
    this.mainService().getCharacteristic(this.Characteristic.TargetTemperature)
      .onGet(() => {
        const value = this.getStatus(schema.code)?.value;
        if (invalidUnit || (override?.onGet && !validScale) || typeof value !== 'number' || !Number.isFinite(value)) {
          throw this.unavailable();
        }
        // Explicit user handlers retain the unit/scale declared in their effective schema.
        const temp = override?.onGet
          ? toCelsius(value / multiple, schemaFahrenheit)
          : toCelsius(value / 10, this.fahrenheit());
        if (!Number.isFinite(temp)) {
          throw this.unavailable();
        }
        return limit(temp, props.minValue, props.maxValue);
      })
      .onSet(async value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < props.minValue || value > props.maxValue) {
          const { HapStatusError, HAPStatus } = this.platform.api.hap;
          throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
        }
        // Let BaseAccessory apply an explicit onSet exactly once. Otherwise write integer
        // native tenths, preserving Math.round(C * 9/5 * 10 + 320) for Fahrenheit.
        if (invalidUnit) {
          throw this.unavailable();
        }
        const fahrenheit = override?.onSet ? schemaFahrenheit : this.fahrenheit();
        const native = fahrenheit ? value * 9 / 5 + 32 : value;
        const raw = override?.onSet ? native * multiple : Math.round(fahrenheit ? value * 10 * 9 / 5 + 320 : value * 10);
        if (!Number.isFinite(raw) || (override?.onSet && !validScale)) {
          throw this.unavailable();
        }
        await this.sendCommands([{ code: schema.code, value: raw }]);
      })
      .setProps(props);
  }
}
