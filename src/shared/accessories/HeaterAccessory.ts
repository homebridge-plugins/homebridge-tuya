/* eslint-disable @typescript-eslint/no-unused-vars */
import { TuyaDeviceSchemaIntegerProperty } from '../../cloud/device/TuyaDevice';
import { limit, toHapProperty } from '../util/util';
import BaseAccessory from './BaseAccessory';
import { configureActive } from './characteristic/Active';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { configureLockPhysicalControls } from './characteristic/LockPhysicalControls';
import { configureSwingMode } from './characteristic/SwingMode';
import { configureTempDisplayUnits } from './characteristic/TemperatureDisplayUnits';

const SCHEMA_CODE = {
  ACTIVE: ['switch'],
  WORK_STATE: ['work_state', 'mode'],
  CURRENT_TEMP: ['temp_current'],
  TARGET_TEMP: ['temp_set'],
  LOCK: ['lock'],
  SWING: ['shake'],
  TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
};
const STATE_CODE = {
  HEATING: ['heating', 'High'],
  IDLE: ['warming', 'Low'],
};

export default class HeaterAccessory extends BaseAccessory {

  requiredSchema() {
    return [SCHEMA_CODE.ACTIVE];
  }

  configureServices() {
    configureActive(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
    this.configureCurrentState();
    this.configureTargetState();
    configureCurrentTemperature(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    configureLockPhysicalControls(this, this.mainService(), this.getSchema(...SCHEMA_CODE.LOCK));
    configureSwingMode(this, this.mainService(), this.getSchema(...SCHEMA_CODE.SWING));
    this.configureHeatingThresholdTemp();
    configureTempDisplayUnits(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
  }


  mainService() {
    return this.accessory.getService(this.Service.HeaterCooler)
      || this.accessory.addService(this.Service.HeaterCooler);
  }

  configureCurrentState() {
    const schema = this.getSchema(...SCHEMA_CODE.WORK_STATE);
    const { ACTIVE:ON, INACTIVE:OFF } = this.Characteristic.Active;
    const { INACTIVE, IDLE, HEATING } = this.Characteristic.CurrentHeaterCoolerState;
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(() => {
        if (!schema) {
          return INACTIVE;
        }
        if (this.mainService().getCharacteristic(this.Characteristic.Active).value === OFF) {
          return INACTIVE;
        }
        const status = this.getStatus(schema.code)!;
        if (STATE_CODE.HEATING.includes(status.value as string)) {
          return HEATING;
        } else if (STATE_CODE.IDLE.includes(status.value as string)) {
          return IDLE;
        }

        return INACTIVE;
      });

  }

  configureTargetState() {
    const { AUTO, HEAT, COOL } = this.Characteristic.TargetHeaterCoolerState;
    const validValues = [ HEAT ];
    this.mainService().getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .onGet(() => {
        // Since setting the mode to AUTO prevents temperature adjustments in the iPhone Home app, the default mode will be set to HEAT.
        return HEAT;
      })
      .onSet(async value => {
        // TODO
        this.log.debug('configureTargetState set:' + value);
      })
      .setProps({ validValues });
  }

  configureHeatingThresholdTemp() {
    const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
    if (!schema) {
      return;
    }

    const property = schema.property as TuyaDeviceSchemaIntegerProperty;
    const props = toHapProperty(property);
    const multiple = Math.pow(10, property['scale'] || 0);



    this.log.debug('Set props for HeatingThresholdTemperature:', props);

    this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .onGet(() => {
        const status = this.getStatus(schema.code)!;
        const temp = status.value as number / multiple;
        return limit(temp, props['minValue'], props['maxValue']);
      })
      .onSet(async value => {
        await this.sendCommands([{ code: schema.code, value: (value as number) * multiple}]);
      })
      .setProps(props);
  }

}