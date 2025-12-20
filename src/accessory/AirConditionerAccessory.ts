"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const RelativeHumidityDehumidifierThreshold_1 = require("./characteristic/RelativeHumidityDehumidifierThreshold");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
// import { configureSwingMode } from './characteristic/SwingMode';
const TemperatureDisplayUnits_1 = require("./characteristic/TemperatureDisplayUnits");
const SCHEMA_CODE = {
    // AirConditioner
    ACTIVE: ['switch'],
    MODE: ['mode'],
    WORK_STATE: ['work_status', 'mode'],
    CURRENT_TEMP: ['temp_current'],
    TARGET_TEMP: ['temp_set'],
    SPEED_LEVEL: ['fan_speed_enum', 'windspeed'],
    LOCK: ['lock', 'child_lock'],
    TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
    SWING: ['switch_horizontal', 'switch_vertical'],
    // Dehumidifier
    CURRENT_HUMIDITY: ['humidity_current'],
    TARGET_HUMIDITY: ['humidity_set'],
};
const AC_MODES = ['auto', 'cold', 'hot'];
const DEHUMIDIFIER_MODE = 'wet';
const FAN_MODE = 'wind';
class AirConditionerAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE, SCHEMA_CODE.MODE, SCHEMA_CODE.WORK_STATE, SCHEMA_CODE.CURRENT_TEMP];
    }
    configureServices() {
        this.configureAirConditioner();
        this.configureDehumidifier();
        this.configureFan();
        // Add extra sensors for home automation use.
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
    }
    configureAirConditioner() {
        const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        const modeProperty = modeSchema.property;
        const service = this.mainService();
        // Required Characteristics
        const { INACTIVE, ACTIVE } = this.Characteristic.Active;
        service.getCharacteristic(this.Characteristic.Active)
            .onGet(() => {
            const activeStatus = this.getStatus(activeSchema.code);
            const modeStatus = this.getStatus(modeSchema.code);
            return (activeStatus.value === true && AC_MODES.includes(modeStatus.value)) ? ACTIVE : INACTIVE;
        })
            .onSet(async (value) => {
            const commands = [{
                    code: activeSchema.code,
                    value: (value === ACTIVE) ? true : false,
                }];
            const modeStatus = this.getStatus(modeSchema.code);
            if (!AC_MODES.includes(modeStatus.value)) {
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
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, service, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        // Optional Characteristics
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
        (0, RotationSpeed_1.configureRotationSpeedLevel)(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
        // configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
        this.configureCoolingThreshouldTemp();
        this.configureHeatingThreshouldTemp();
        (0, TemperatureDisplayUnits_1.configureTempDisplayUnits)(this, service, this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
    }
    configureDehumidifier() {
        const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        const property = modeSchema.property;
        if (!property.range.includes(DEHUMIDIFIER_MODE)) {
            return;
        }
        const service = this.dehumidifierService();
        // Required Characteristics
        const { INACTIVE, ACTIVE } = this.Characteristic.Active;
        service.getCharacteristic(this.Characteristic.Active)
            .onGet(() => {
            const activeStatus = this.getStatus(activeSchema.code);
            const modeStatus = this.getStatus(modeSchema.code);
            return (activeStatus.value === true && modeStatus.value === DEHUMIDIFIER_MODE) ? ACTIVE : INACTIVE;
        })
            .onSet(async (value) => {
            await this.sendCommands([{
                    code: activeSchema.code,
                    value: (value === ACTIVE) ? true : false,
                }, {
                    code: modeSchema.code,
                    value: DEHUMIDIFIER_MODE,
                }], true);
        });
        const { DEHUMIDIFYING } = this.Characteristic.CurrentHumidifierDehumidifierState;
        service.setCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState, DEHUMIDIFYING);
        const { DEHUMIDIFIER } = this.Characteristic.TargetHumidifierDehumidifierState;
        service.getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
            .updateValue(DEHUMIDIFIER)
            .setProps({ validValues: [DEHUMIDIFIER] });
        if (this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY)) {
            (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, service, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
        }
        else {
            service.setCharacteristic(this.Characteristic.CurrentRelativeHumidity, 0);
        }
        // Optional Characteristics
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
        (0, RotationSpeed_1.configureRotationSpeedLevel)(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
        (0, RelativeHumidityDehumidifierThreshold_1.configureRelativeHumidityDehumidifierThreshold)(this, service, this.getSchema(...SCHEMA_CODE.TARGET_HUMIDITY));
        // configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
    }
    configureFan() {
        const activeSchema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
        const property = modeSchema.property;
        if (!property.range.includes(FAN_MODE)) {
            return;
        }
        const service = this.fanService();
        // Required Characteristics
        const { INACTIVE, ACTIVE } = this.Characteristic.Active;
        service.getCharacteristic(this.Characteristic.Active)
            .onGet(() => {
            const activeStatus = this.getStatus(activeSchema.code);
            return (activeStatus.value === true) ? ACTIVE : INACTIVE;
	})
	   .onSet(async (value) => {
	   const commands = [{
	     code: activeSchema.code,
	     value: (value === ACTIVE) ? true : false,
	   }];
	   if (value === ACTIVE) {
		const modeStatus = this.getStatus(modeSchema.code);
		if (!modeStatus || !property.range.includes(modeStatus.value)) {
			const fallback = property.range.includes('cold') ? 'cold' : property.range[0];
			commands.push({ code: modeSchema.code, value: fallback });
		}
	}
	await this.sendCommands(commands, true);
	});
        // Optional Characteristics
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, service, this.getSchema(...SCHEMA_CODE.LOCK));
        (0, RotationSpeed_1.configureRotationSpeedLevel)(this, service, this.getSchema(...SCHEMA_CODE.SPEED_LEVEL), ['auto']);
        // configureSwingMode(this, service, this.getSchema(...SCHEMA_CODE.SWING));
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
            const status = this.getStatus(schema.code);
            if (status.value === 'heating' || status.value === 'hot') {
                return HEATING;
            }
            else if (status.value === 'cooling' || status.value === 'cold') {
                return COOLING;
            }
            else {
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
        const validValues = [];
        const property = schema.property;
        if (property.range.includes('auto')) {
            validValues.push(AUTO);
        }
        if (property.range.includes('hot')) {
            validValues.push(HEAT);
        }
        if (property.range.includes('cold')) {
            validValues.push(COOL);
        }
        if (validValues.length === 0) {
            this.log.warn('Invalid mode range for TargetHeaterCoolerState:', property.range);
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            if (status.value === 'hot') {
                return HEAT;
            }
            else if (status.value === 'cold') {
                return COOL;
            }
            return validValues.includes(AUTO) ? AUTO : validValues[0];
        })
            .onSet(async (value) => {
            let mode;
            if (value === HEAT) {
                mode = 'hot';
            }
            else if (value === COOL) {
                mode = 'cold';
            }
            else {
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
        const property = schema.property;
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
            if (modeSchema && this.getStatus(modeSchema.code).value === 'auto') {
                return props.minValue;
            }
            const status = this.getStatus(schema.code);
            const temp = status.value / multiple;
            return (0, util_1.limit)(temp, props.minValue, props.maxValue);
        })
            .onSet(async (value) => {
            const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
            if (modeSchema && this.getStatus(modeSchema.code).value === 'auto') {
                this.mainService().getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
                    .updateValue(props.minValue);
                return;
            }
            await this.sendCommands([{ code: schema.code, value: value * multiple }], true);
        })
            .setProps(props);
    }
    configureHeatingThreshouldTemp() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
        if (!schema) {
            return;
        }
        const property = schema.property;
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
            if (modeSchema && this.getStatus(modeSchema.code).value === 'auto') {
                return props.maxValue;
            }
            const status = this.getStatus(schema.code);
            const temp = status.value / multiple;
            return (0, util_1.limit)(temp, props.minValue, props.maxValue);
        })
            .onSet(async (value) => {
            const modeSchema = this.getSchema(...SCHEMA_CODE.MODE);
            if (modeSchema && this.getStatus(modeSchema.code).value === 'auto') {
                this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
                    .updateValue(props.maxValue);
                return;
            }
            await this.sendCommands([{ code: schema.code, value: value * multiple }], true);
        })
            .setProps(props);
    }
}
exports.default = AirConditionerAccessory;
//# sourceMappingURL=AirConditionerAccessory.js.map
