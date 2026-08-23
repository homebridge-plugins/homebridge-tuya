import { TuyaDeviceSchemaEnumProperty, TuyaDeviceSchemaIntegerProperty, TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import { limit } from '../util/util';
import BaseAccessory from './BaseAccessory';
import { configureCurrentRelativeHumidity } from './characteristic/CurrentRelativeHumidity';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { configureLockPhysicalControls } from './characteristic/LockPhysicalControls';
import { configureRelativeHumidityDehumidifierThreshold } from './characteristic/RelativeHumidityDehumidifierThreshold';
import { configureRotationSpeedLevel } from './characteristic/RotationSpeed';
import { configureSwingMode } from './characteristic/SwingMode';
import { configureTempDisplayUnits } from './characteristic/TemperatureDisplayUnits';

const SCHEMA_CODE = {
  // AirConditioner
  ACTIVE: ['switch', 'switch_1'],
  MODE: ['mode'],
  WORK_STATE: ['work_status', 'mode'],
  CURRENT_TEMP: ['temp_current'],
  TARGET_TEMP: ['temp_set'],
  SPEED_LEVEL: ['fan_speed_enum', 'windspeed'],
  LOCK: ['lock', 'child_lock'],
  TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
  // Vertical first: it is the axis most units expose and the one users reach for.
  // HeaterCooler carries a single SwingMode characteristic, so the remaining axes are
  // published as switches (see configureSwingSwitches).
  SWING: ['switch_vertical', 'switch_horizontal'],
  SWING_AXES: [
    { code: 'switch_vertical', name: 'Vertical Swing' },
    { code: 'switch_horizontal', name: 'Horizontal Swing' },
  ],
  // Dehumidifier
  CURRENT_HUMIDITY: ['humidity_current'],
  TARGET_HUMIDITY: ['humidity_set'],
};

// Mode values
const AC_HEAT_MODES = ['hot', 'heat'];
const AC_COOL_MODES = ['cold', 'cool'];
const AC_MODES = ['auto', ...AC_HEAT_MODES, ...AC_COOL_MODES];
// Added support for dyr, which is included because some devices return a misspelled code value.
const DEHUMIDIFIER_MODE = ['wet', 'dry', 'dyr'];
const FAN_MODE = ['wind', 'fan'];


export default class AirConditionerAccessory extends BaseAccessory {

  override requiredSchema() {
    return [SCHEMA_CODE.ACTIVE, SCHEMA_CODE.MODE, SCHEMA_CODE.WORK_STATE, SCHEMA_CODE.CURRENT_TEMP];
  }

  override configureServices() {
    this.configureAirConditioner();
    this.configureDehumidifier();
    this.configureFan();
    this.configureSwingSwitches();
    this.configureFanSpeedTile();

    // Add extra sensors for home automation use.
    configureCurrentTemperature(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    configureCurrentRelativeHumidity(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
  }

  configureAirConditioner() {
    const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE)!;
    const modeSchema = this.getSchema(...SCHEMA_CODE.MODE)!;
    const modeProperty = modeSchema.property as TuyaDeviceSchemaEnumProperty;

    const service = this.mainService();

    // Required Characteristics
    const { INACTIVE, ACTIVE } = this.Characteristic.Active;
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => {
        const activeStatus = this.getStatus(activeSchema.code)!;
        const modeStatus = this.getStatus(modeSchema.code)!;
        return (activeStatus.value === true && AC_MODES.includes(modeStatus.value as string)) ? ACTIVE : INACTIVE;
      })
      .onSet(async value => {
        const commands: TuyaDeviceStatus[] = [{
          code: activeSchema.code,
          value: (value === ACTIVE) ? true : false,
        }];

        const modeStatus = this.getStatus(modeSchema.code)!;
        if (!AC_MODES.includes(modeStatus.value as string)) {
          for (const mode of AC_MODES) {
            if (modeProperty.range.includes(mode)) {
              commands.push({ code: modeStatus.code, value: mode });
              break;
            }
          }
        }

        await this.sendCommands(commands, true);
      });

    this.configureCurrentState();
    this.configureTargetState();
    configureCurrentTemperature(this, service, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));

    // Optional Characteristics
    configureLockPhysicalControls(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
    configureRotationSpeedLevel(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
    configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
    this.configureCoolingThreshouldTemp();
    this.configureHeatingThreshouldTemp();
    configureTempDisplayUnits(this, service, this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
  }

  configureDehumidifier() {
    const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE)!;
    const modeSchema = this.getSchema(...SCHEMA_CODE.MODE)!;
    const property = modeSchema.property as TuyaDeviceSchemaEnumProperty;
    const dehumidifierCode = property.range.find(code => DEHUMIDIFIER_MODE.includes(code.toLowerCase()));
    if (!dehumidifierCode) {
      // Subtype-less only, for the same reason as the Fanv2 cleanup below.
      const staleDehumidifier = this.accessory.services
        .find(s => s.UUID === this.Service.HumidifierDehumidifier.UUID && !s.subtype);
      if (staleDehumidifier) {
        this.accessory.removeService(staleDehumidifier);
      }
      return;
    }

    const service = this.dehumidifierService();

    // Required Characteristics
    const { INACTIVE, ACTIVE } = this.Characteristic.Active;
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => {
        const activeStatus = this.getStatus(activeSchema.code)!;
        const modeStatus = this.getStatus(modeSchema.code)!;
        return (activeStatus.value === true && modeStatus.value === dehumidifierCode) ? ACTIVE : INACTIVE;
      })
      .onSet(async value => {
        await this.sendCommands([{
          code: activeSchema.code,
          value: (value === ACTIVE) ? true : false,
        }, {
          code: modeSchema.code,
          value: dehumidifierCode,
        }], true);
      });

    const { DEHUMIDIFYING } = this.Characteristic.CurrentHumidifierDehumidifierState;
    service.setCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState, DEHUMIDIFYING);

    const { DEHUMIDIFIER } = this.Characteristic.TargetHumidifierDehumidifierState;
    service.getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
      .updateValue(DEHUMIDIFIER)
      .setProps({ validValues: [DEHUMIDIFIER] });

    if (this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY)) {
      configureCurrentRelativeHumidity(this, service, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
    } else {
      service.setCharacteristic(this.Characteristic.CurrentRelativeHumidity, 0);
    }

    // Optional Characteristics
    configureLockPhysicalControls(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
    configureRotationSpeedLevel(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
    configureRelativeHumidityDehumidifierThreshold(this, service, this.getSchema(...SCHEMA_CODE.TARGET_HUMIDITY));
    // configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
  }

  configureFan() {
    const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE)!;
    const modeSchema = this.getSchema(...SCHEMA_CODE.MODE)!;
    const property = modeSchema.property as TuyaDeviceSchemaEnumProperty;
    const fanCode = property.range.find(code => FAN_MODE.includes(code.toLowerCase()));
    if (!fanCode) {
      // Drop a Fanv2 created by an earlier run: it would keep showing a slider bound
      // to the same fan-speed DP as the air conditioner, and its Active handler sends
      // a mode change, so moving that slider switches the unit into fan mode.
      // Match only the subtype-less service this method creates — getService() ignores
      // subtypes and would otherwise match the fan-speed tile added below.
      const staleFan = this.accessory.services.find(s => s.UUID === this.Service.Fanv2.UUID && !s.subtype);
      if (staleFan) {
        this.accessory.removeService(staleFan);
      }
      return;
    }

    const service = this.fanService();

    // Required Characteristics
    const { INACTIVE, ACTIVE } = this.Characteristic.Active;
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => {
        const activeStatus = this.getStatus(activeSchema.code)!;
        const modeStatus = this.getStatus(modeSchema.code)!;
        return (activeStatus.value === true && modeStatus.value === fanCode) ? ACTIVE : INACTIVE;
      })
      .onSet(async value => {
        await this.sendCommands([{
          code: activeSchema.code,
          value: (value === ACTIVE) ? true : false,
        }, {
          code: modeSchema.code,
          value: fanCode,
        }], true);
      });

    // Optional Characteristics
    configureLockPhysicalControls(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
    configureRotationSpeedLevel(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
    // configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
  }

  /**
   * Publish each swing axis the device reports as its own Switch.
   *
   * SwingMode is set on the HeaterCooler service as well, but the Home app does not
   * render that characteristic for a heater-cooler, so without these switches the
   * louvres cannot be controlled from the Home app at all — on the unit this was
   * developed against, vertical swing was running (DP reported `true`) with no
   * control for it anywhere in the app.  Switches are rendered, and other clients
   * (Eve, Controller for HomeKit) keep using SwingMode.
   *
   * A switch is removed again if the device stops reporting that axis.
   */
  configureSwingSwitches(): void {
    for (const axis of SCHEMA_CODE.SWING_AXES) {
      const schema = this.getSchema(axis.code);
      const subtype = `swing-${axis.code}`;
      const existing = this.accessory.getServiceById(this.Service.Switch, subtype);

      if (!schema) {
        if (existing) {
          this.accessory.removeService(existing);
        }
        continue;
      }

      const service = existing
        || this.accessory.addService(this.Service.Switch, axis.name, subtype);
      // Without ConfiguredName the Home app labels every extra tile with the accessory
      // name, leaving two identical switches with no way to tell them apart.
      service.setCharacteristic(this.Characteristic.ConfiguredName, axis.name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => this.getStatus(schema.code)?.value === true)
        .onSet(async value => {
          await this.sendCommands([{ code: schema.code, value: value === true }], true);
        });
    }
  }

  /**
   * Publish the blower speed as a fan tile when the device has no fan mode.
   *
   * RotationSpeed is set on the HeaterCooler service, but the Home app does not
   * render it there either, so on a unit without a fan mode the speed cannot be
   * changed from the Home app.  Devices that do have a fan mode already get a Fanv2
   * from configureFan(), so nothing is added for them.
   *
   * Active mirrors the power DP: this fan IS the air conditioner's blower, so unlike
   * configureFan() it must never send a mode change.
   */
  configureFanSpeedTile(): void {
    const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
    const modeProperty = modeSchema?.property as TuyaDeviceSchemaEnumProperty | undefined;
    const hasFanMode = modeProperty?.range.some(code => FAN_MODE.includes(code.toLowerCase()));

    const speedSchema = this.getSchema(...SCHEMA_CODE.SPEED_LEVEL);
    const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE);

    const subtype = 'fan-speed';
    const existing = this.accessory.getServiceById(this.Service.Fanv2, subtype);

    if (hasFanMode || !speedSchema || !activeSchema) {
      if (existing) {
        this.accessory.removeService(existing);
      }
      return;
    }

    const name = 'Fan Speed';
    const service = existing || this.accessory.addService(this.Service.Fanv2, name, subtype);
    service.setCharacteristic(this.Characteristic.ConfiguredName, name);

    const { INACTIVE, ACTIVE } = this.Characteristic.Active;
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => (this.getStatus(activeSchema.code)?.value === true) ? ACTIVE : INACTIVE)
      .onSet(async value => {
        await this.sendCommands([{ code: activeSchema.code, value: value === ACTIVE }], true);
      });

    configureRotationSpeedLevel(this, service, speedSchema, ['auto']);
  }

  mainService() {
    return this.accessory.getService(this.Service.HeaterCooler)
      || this.accessory.addService(this.Service.HeaterCooler);
  }

  dehumidifierService() {
    return this.accessory.getService(this.Service.HumidifierDehumidifier)
      || this.accessory.addService(this.Service.HumidifierDehumidifier, this.accessory.displayName + ' Dehumidifier');
  }

  fanService() {
    return this.accessory.getService(this.Service.Fanv2)
      || this.accessory.addService(this.Service.Fanv2, this.accessory.displayName + ' Fan');
  }

  configureCurrentState() {
    const schema = this.getSchema(...SCHEMA_CODE.WORK_STATE);
    if (!schema) {
      return;
    }

    const { INACTIVE, HEATING, COOLING } = this.Characteristic.CurrentHeaterCoolerState;
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(() => {
        // A schema entry can exist (from config or dpMapping) while the device never
        // reports that DP; reading `.value` off undefined throws inside the read
        // handler, and HomeKit then marks the WHOLE accessory "No Response" even
        // though writes keep working.
        const status = this.getStatus(schema.code);
        const workState = status?.value;
        if (workState === 'heating' || workState === 'hot') {
          return HEATING;
        } else if (workState === 'cooling' || workState === 'cold') {
          return COOLING;
        } else {
          return INACTIVE;
        }
      });
  }

  configureTargetState() {
    const schema = this.getSchema(...SCHEMA_CODE.MODE);
    if (!schema) {
      return;
    }

    const { AUTO, HEAT, COOL } = this.Characteristic.TargetHeaterCoolerState;

    const validValues: number[] = [];
    const property = schema.property as TuyaDeviceSchemaEnumProperty;
    if (property.range.includes('auto')) {
      validValues.push(AUTO);
    }
    if (property.range.some(mode => AC_HEAT_MODES.includes(mode.toLowerCase()))) {
      validValues.push(HEAT);
    }
    if (property.range.some(mode => AC_COOL_MODES.includes(mode.toLowerCase()))) {
      validValues.push(COOL);
    }

    if (validValues.length === 0) {
      this.log.warn('Invalid mode range for TargetHeaterCoolerState:', property.range);
      return;
    }

    this.mainService().getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .onGet(() => {
        const status = this.getStatus(schema.code)!;
        if (AC_HEAT_MODES.includes(String(status.value).toLowerCase())) {
          return HEAT;
        } else if (AC_COOL_MODES.includes(String(status.value).toLowerCase())) {
          return COOL;
        }

        return validValues.includes(AUTO) ? AUTO : validValues[0];
      })
      .onSet(async value => {

        let mode: string;
        if (value === HEAT) {
          mode = property.range.find(m => AC_HEAT_MODES.includes(m.toLowerCase())) || AC_HEAT_MODES[0];
        } else if (value === COOL) {
          mode = property.range.find(m => AC_COOL_MODES.includes(m.toLowerCase())) || AC_COOL_MODES[0];
        } else {
          mode = 'auto';
        }

        await this.sendCommands([{ code: schema.code, value: mode }], true);
      })
      .setProps({ validValues });
  }

  configureCoolingThreshouldTemp() {
    const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
    if (!schema) {
      return;
    }

    const property = schema.property as TuyaDeviceSchemaIntegerProperty;
    const multiple = Math.pow(10, property.scale);
    const props = {
      minValue: property.min / multiple,
      maxValue: property.max / multiple,
      minStep: Math.max(0.1, property.step / multiple),
    };
    this.log.debug('Set props for CoolingThresholdTemperature:', props);

    this.mainService().getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
      .onGet(() => {
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        if (modeSchema && this.getStatus(modeSchema.code)!.value === 'auto') {
          return props.minValue;
        }

        const status = this.getStatus(schema.code)!;
        const temp = status.value as number / multiple;
        return limit(temp, props.minValue, props.maxValue);
      })
      .onSet(async value => {
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        if (modeSchema && this.getStatus(modeSchema.code)!.value === 'auto') {
          this.mainService().getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
            .updateValue(props.minValue);
          return;
        }

        await this.sendCommands([{ code: schema.code, value: (value as number) * multiple}], true);
      })
      .setProps(props);
  }

  configureHeatingThreshouldTemp() {
    const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
    if (!schema) {
      return;
    }

    const property = schema.property as TuyaDeviceSchemaIntegerProperty;
    const multiple = Math.pow(10, property.scale);
    const props = {
      minValue: property.min / multiple,
      maxValue: property.max / multiple,
      minStep: Math.max(0.1, property.step / multiple),
    };
    this.log.debug('Set props for HeatingThresholdTemperature:', props);

    this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .onGet(() => {
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        if (modeSchema && this.getStatus(modeSchema.code)!.value === 'auto') {
          return props.maxValue;
        }

        const status = this.getStatus(schema.code)!;
        const temp = status.value as number / multiple;
        return limit(temp, props.minValue, props.maxValue);
      })
      .onSet(async value => {
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        if (modeSchema && this.getStatus(modeSchema.code)!.value === 'auto') {
          this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
            .updateValue(props.maxValue);
          return;
        }

        await this.sendCommands([{ code: schema.code, value: (value as number) * multiple}], true);
      })
      .setProps(props);
  }

}