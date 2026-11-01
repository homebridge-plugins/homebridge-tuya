import { TuyaDeviceSchemaEnumProperty, TuyaDeviceSchemaIntegerProperty, TuyaDeviceStatus } from '../device/TuyaDevice';
import { limit } from '../util/util';
import { ET72GWMeasurements, et72gwOptions } from '../device/ET72GWMeasurements';
import BaseAccessory from './BaseAccessory';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { configureTempDisplayUnits } from './characteristic/TemperatureDisplayUnits';

const SCHEMA_CODE = {
  ON: ['switch'],
  CURRENT_MODE: ['work_state', 'mode'],
  TARGET_MODE: ['mode'],
  CURRENT_TEMP: ['temp_current', 'temp_set'],
  TARGET_TEMP: ['temp_set'],
  TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
};

export default class ThermostatAccessory extends BaseAccessory {

  private cloudMeasurements?: ET72GWMeasurements;

  requiredSchema() {
    return [SCHEMA_CODE.CURRENT_TEMP, SCHEMA_CODE.TARGET_TEMP];
  }

  configureServices() {
    this.configureCurrentState();
    this.configureTargetState();
    if (!this.configureCloudMeasurements()) {
      configureCurrentTemperature(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    }
    this.configureTargetTemp();
    configureTempDisplayUnits(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
  }

  private configureCloudMeasurements() {
    this.cloudMeasurements?.stop();
    this.cloudMeasurements = undefined;
    const characteristic = this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature);
    const unavailable = () => {
      const { HapStatusError, HAPStatus } = this.platform.api.hap;
      return new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    };
    let options;
    try {
      options = et72gwOptions(this.device, this.platform.options.deviceOverrides);
    } catch {
      this.log.warn('Invalid ET-72GW floor temperature configuration; measurement unavailable.');
      characteristic.onGet(() => {
        throw unavailable();
      });
      characteristic.updateValue(unavailable());
      this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
        .onGet(() => {
          throw unavailable();
        }).updateValue(unavailable());
      return true;
    }
    if (!options) {
      return false;
    }
    const publish = () => this.publishCloudMeasurements();
    this.cloudMeasurements = new ET72GWMeasurements(
      () => this.deviceManager.api.getDeviceShadow(this.device.id), options, publish, () => this.device.online, this.log,
    );
    // Set only this characteristic's standard bounds; never reuse Fahrenheit temp_set schema metadata.
    characteristic.setProps({ minValue: -270, maxValue: 100, minStep: 0.1 }).onGet(() => {
      const sample = this.cloudMeasurements?.currentFloor();
      if (!sample) {
        throw unavailable();
      }
      return sample.celsius;
    });
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => this.readCloudHeatingState());
    publish();
    this.cloudMeasurements.start();
    return true;
  }

  dispose() {
    this.cloudMeasurements?.stop();
  }

  private readCloudHeatingState() {
    const sample = this.cloudMeasurements?.currentHeating();
    if (!sample) {
      const { HapStatusError, HAPStatus } = this.platform.api.hap;
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const { OFF, HEAT } = this.Characteristic.CurrentHeatingCoolingState;
    // Use the power1 report from the same shadow response; an untimestamped legacy switch may be older.
    return sample.heating ? HEAT : OFF;
  }

  private publishCloudMeasurements() {
    const { HapStatusError, HAPStatus } = this.platform.api.hap;
    const unavailable = () => new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    const sample = this.cloudMeasurements?.currentFloor();
    this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature)
      .updateValue(sample ? sample.celsius : unavailable());
    let state: number | Error;
    try {
      state = this.readCloudHeatingState();
    } catch {
      state = unavailable();
    }
    // updateValue emits HAP change notifications; it never invokes an onSet handler or writes a mode.
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState).updateValue(state);
  }

  async onDeviceInfoUpdate(info) {
    await super.onDeviceInfoUpdate(info);
    if (this.cloudMeasurements) {
      this.publishCloudMeasurements();
    }
  }

  mainService() {
    return this.accessory.getService(this.Service.Thermostat)
      || this.accessory.addService(this.Service.Thermostat);
  }

  configureCurrentState() {

    const { OFF, HEAT, COOL } = this.Characteristic.CurrentHeatingCoolingState;
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .onGet(() => {
        const on = this.getStatus('switch');
        if (on && on.value === false) {
          return OFF;
        }

        const schema = this.getSchema(...SCHEMA_CODE.CURRENT_MODE);
        if (!schema) {
          // If don't support mode, compare current and target temp.
          const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_TEMP);
          const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
          if (!currentSchema || !targetSchema) {
            return OFF;
          }
          const current = this.getStatus(currentSchema.code)!;
          const target = this.getStatus(targetSchema.code)!;
          if (target.value > current.value) {
            return HEAT;
          } else if (target.value < current.value) {
            return COOL;
          } else {
            return OFF;
          }
        }

        const status = this.getStatus(schema.code)!;
        if (status.value === 'hot' || status.value === 'opened' || status.value === 'heating') {
          return HEAT;
        } else if (
          status.value === 'cold' ||
          status.value === 'eco' ||
          status.value === 'idle' ||
          status.value === 'window_opened'
        ) {
          return COOL;
        }
        // Don't know how to display unsupported work mode.
        return OFF;
      });

  }

  configureTargetState() {
    const { OFF, HEAT, COOL, AUTO } = this.Characteristic.TargetHeatingCoolingState;
    const validValues = [AUTO];

    // Thermostat valve may not support 'Power Off'
    if (this.getStatus('switch')) {
      validValues.push(OFF);
    }

    const schema = this.getSchema(...SCHEMA_CODE.TARGET_MODE);
    const property = schema?.property as TuyaDeviceSchemaEnumProperty;
    if (property) {
      if (property.range.includes('hot')) {
        validValues.push(HEAT);
      }
      if (property.range.includes('cold') || property.range.includes('eco')) {
        validValues.push(COOL);
      }
    }

    this.mainService().getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .onGet(() => {
        const on = this.getStatus('switch');
        if (on && on.value === false) {
          return OFF;
        }

        if (!schema) {
          // If don't support mode, display auto.
          return AUTO;
        }

        const status = this.getStatus(schema.code)!;
        if (status.value === 'hot') {
          return HEAT;
        } else if (status.value === 'cold' || status.value === 'eco') {
          return COOL;
        } else if (status.value === 'auto' || status.value === 'temp_auto') {
          return AUTO;
        }

        // Don't know how to display unsupported mode.
        return AUTO;
      })
      .onSet(async value => {
        const commands: TuyaDeviceStatus[] = [];

        // Thermostat valve may not support 'Power Off'
        const on = this.getStatus('switch');
        if (on) {
          if (value === OFF) {
            commands.push({
              code: 'switch',
              value: false,
            });
          } else if (on.value === false) {
            commands.push({
              code: 'switch',
              value: true,
            });
          }
        }

        if (schema) {
          if ((value === HEAT) && property.range.includes('hot')) {
            commands.push({ code: schema.code, value: 'hot' });
          } else if (value === COOL) {
            if (property.range.includes('eco')) {
              commands.push({ code: schema.code, value: 'eco' });
            } else if (property.range.includes('cold')) {
              commands.push({ code: schema.code, value: 'cold' });
            }
          } else if ((value === AUTO) && property.range.includes('auto')) {
            commands.push({ code: schema.code, value: 'auto' });
          }
        }

        if (commands.length !== 0) {
          await this.sendCommands(commands);
        }
      })
      .setProps({ validValues });

  }

  // FIXME: For some reason, a limit is being imposed on the target temperature.
  // Request to those who have the actual product: Please investigate whether ./characteristic/TargetTemperature can be used.
  configureTargetTemp() {
    const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
    if (!schema) {
      this.log.warn('TargetTemperature not supported.');
      return;
    }

    const property = schema.property as TuyaDeviceSchemaIntegerProperty;
    let multiple = Math.pow(10, property.scale);
    let props = {
      minValue: Math.max(10, property.min / multiple),
      maxValue: Math.min(38, property.max / multiple),
      minStep: Math.max(0.1, property.step / multiple),
    };
    if (props.maxValue <= props.minValue) {
      this.log.warn('Invalid schema: %o, props will be reset to the default value.', schema);
      multiple = 1;
      props = { minValue: 10, maxValue: 38, minStep: 1 };
    }
    this.log.debug('Set props for TargetTemperature:', props);

    this.mainService().getCharacteristic(this.Characteristic.TargetTemperature)
      .onGet(() => {
        const status = this.getStatus(schema.code)!;
        const temp = status.value as number / multiple;
        return limit(temp, props.minValue, props.maxValue);
      })
      .onSet(async value => {
        await this.sendCommands([{
          code: schema.code,
          value: value as number * multiple,
        }]);
      })
      .setProps(props);

  }

}
