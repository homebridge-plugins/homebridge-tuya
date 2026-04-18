/* eslint-disable @typescript-eslint/no-unused-vars */
import { PlatformAccessory, Service, Characteristic, Nullable, CharacteristicValue } from 'homebridge';

import { TuyaDeviceSchema, TuyaDeviceSchemaIntegerProperty, TuyaDeviceSchemaMode, TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import { TuyaPlatform } from '../../platform';
import { limit, sanitizeName } from '../util/util';
import { PrefixLogger } from '../util/Logger';
import { debounce, deepEqual } from '../util/util';

const MANUFACTURER = 'Tuya Inc.';

const SCHEMA_CODE = {
  BATTERY_STATE: ['battery_state'],
  BATTERY_PERCENT: ['battery_percentage', 'residual_electricity', 'wireless_electricity', 'va_battery', 'battery'],
  BATTERY_CHARGING: ['charge_state'],
};


/**
 * Homebridge Accessory Categories Documentation:
 *   https://developers.homebridge.io/#/categories
 * Tuya Standard Instruction Set Documentation:
 *   https://developer.tuya.com/en/docs/iot/standarddescription?id=K9i5ql6waswzq
 */
class BaseAccessory {
  public readonly Service: typeof Service = this.platform.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.platform.api.hap.Characteristic;

  private cachedLog?: PrefixLogger;

  public get deviceManager() {
    // Return whichever manager owns this device (local takes priority in hybrid mode)
    const deviceID = this.accessory.context.deviceID;
    if (deviceID && this.platform.localDeviceManager?.getDevice(deviceID)) {
      return this.platform.localDeviceManager;
    }
    return this.platform.deviceManager;
  }

  public get deviceSource(): 'local' | 'cloud' | undefined {
    // Determine which source this device comes from for override lookup
    const deviceID = this.accessory.context.deviceID;
    if (deviceID && this.platform.localDeviceManager?.getDevice(deviceID)) {
      return 'local';
    }
    if (deviceID && this.platform.deviceManager?.getDevice(deviceID)) {
      return 'cloud';
    }
    return undefined;
  }

  public get device() {
    // Try local device manager first (for local-only or hybrid modes)
    const localDevice = this.platform.localDeviceManager?.getDevice(this.accessory.context.deviceID);
    if (localDevice) {
      return localDevice;
    }
    // Fall back to cloud device manager
    return this.platform.deviceManager?.getDevice(this.accessory.context.deviceID);
  }

  public get log() {
    if (!this.cachedLog) {
      const deviceName = this.device?.name ?? this.device?.id ?? this.accessory.context.deviceID ?? 'Unknown Device';
      this.cachedLog = new PrefixLogger(
        this.platform.log,
        deviceName,
        this.platform.options.debug && ((this.platform.options.debugLevel ?? '').length > 0
          ? this.platform.options.debugLevel?.includes(this.device?.id ?? '')
          : true),
      );
    }
    return this.cachedLog;
  }

  public initialized = false;

  public adaptiveLightingController?;

  constructor(
    public readonly platform: TuyaPlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    this.addAccessoryInfoService();
    this.addBatteryService();
  }

  addAccessoryInfoService() {
    const service = this.accessory.getService(this.Service.AccessoryInformation)
      || this.accessory.addService(this.Service.AccessoryInformation);

    if (!this.device) {
      // Use fallback values if device is not available yet
      const safeName = sanitizeName(this.accessory.displayName) ?? 'Tuya Device';
      service
        .setCharacteristic(this.Characteristic.Manufacturer, MANUFACTURER)
        .setCharacteristic(this.Characteristic.Name, safeName)
        .setCharacteristic(this.Characteristic.ConfiguredName, safeName)
      ;
      return;
    }

    const safeName = sanitizeName(this.device.name) ?? (this.device.id || 'Tuya Device');
    service
      .setCharacteristic(this.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.Characteristic.Model, this.device.model || this.device.product_name || this.device.product_id)
      .setCharacteristic(this.Characteristic.Name, safeName)
      .setCharacteristic(this.Characteristic.ConfiguredName, safeName)
    ;

    const serialNumber = typeof this.device.uuid === 'string' ? this.device.uuid.trim() : '';
    if (serialNumber.length > 1) {
      service.setCharacteristic(this.Characteristic.SerialNumber, serialNumber);
    } else {
      this.log.warn(`Skipping invalid SerialNumber for accessory ${safeName}`);
    }
  }

  addBatteryService() {
    const percentSchema = this.getSchema(...SCHEMA_CODE.BATTERY_PERCENT);
    if (!percentSchema) {
      return;
    }

    const { BATTERY_LEVEL_NORMAL, BATTERY_LEVEL_LOW } = this.Characteristic.StatusLowBattery;
    const service = this.accessory.getService(this.Service.Battery)
      || this.accessory.addService(this.Service.Battery);

    const stateSchema = this.getSchema(...SCHEMA_CODE.BATTERY_STATE);
    if (stateSchema || percentSchema) {
      service.getCharacteristic(this.Characteristic.StatusLowBattery)
        .onGet(() => {
          if (stateSchema) {
            const status = this.getStatus(stateSchema.code);
            if (!status) {
              return BATTERY_LEVEL_NORMAL;
            }
            return (status.value === 'low') ? BATTERY_LEVEL_LOW : BATTERY_LEVEL_NORMAL;
          }

          // fallback
          const status = this.getStatus(percentSchema.code);
          if (!status) {
            return BATTERY_LEVEL_NORMAL;
          }
          return (status.value as number <= 20) ? BATTERY_LEVEL_LOW : BATTERY_LEVEL_NORMAL;
        });
    }

    const property = percentSchema.property as TuyaDeviceSchemaIntegerProperty;
    const multiple = Math.pow(10, property ? property.scale : 0);
    service.getCharacteristic(this.Characteristic.BatteryLevel)
      .onGet(() => {
        const status = this.getStatus(percentSchema.code);
        if (!status) {
          return 0;
        }
        return limit(status.value as number / multiple, 0, 100);
      });

    const chargingSchema = this.getSchema(...SCHEMA_CODE.BATTERY_CHARGING);
    if (chargingSchema) {
      const { NOT_CHARGING, CHARGING } = this.Characteristic.ChargingState;
      service.getCharacteristic(this.Characteristic.ChargingState)
        .onGet(() => {
          const status = this.getStatus(chargingSchema.code);
          if (!status) {
            return NOT_CHARGING;
          }
          return (status.value as boolean) ? CHARGING : NOT_CHARGING;
        });
    }
  }

  configureStatusActive() {
    for (const service of this.accessory.services) {
      if (!service.testCharacteristic(this.Characteristic.StatusActive)) { // silence warning
        service.addOptionalCharacteristic(this.Characteristic.StatusActive);
      }
      service.getCharacteristic(this.Characteristic.StatusActive)
        .onGet(() => this.device?.online ?? true);
    }
  }

  async updateAllValues() {
    for (const service of this.accessory.services) {
      for (const characteristic of service.characteristics) {
        if (characteristic.UUID === this.Characteristic.ProgrammableSwitchEvent.UUID) {
          continue;
        }

        let newValue: Nullable<CharacteristicValue> | Error = characteristic.value;
        const getHandler = characteristic['getHandler'];
        if (getHandler) {
          try {
            newValue = await getHandler();
          } catch (error) {
            // TODO: why `characteristic.updateValue(HapStatusError)` not working?
            // newValue = error as Error;
            continue;
          }
        }

        if (characteristic.value !== newValue && !(newValue instanceof Error)) {
          this.log.debug(
            '[%s/%s/%s] Update value: %o => %o',
            service.constructor.name,
            service.subtype,
            characteristic.constructor.name,
            characteristic.value,
            newValue,
          );
        }
        characteristic.updateValue(newValue);
      }
    }
  }

  checkOnlineStatus() {
    if (this.device?.online === false) {
      const { HapStatusError, HAPStatus } = this.platform.api.hap;
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  getSchema(...codes: string[]) {
    if (!this.device) {
      return undefined;
    }

    for (const code of codes) {
      const schema = this.device.schema.find(schema => {
        // ignore case
        return schema.code.toLowerCase() === code.toLowerCase();
      });

      if (schema) {
        return schema;
      }
    }
    return undefined;
  }

  getStatus(code: string) {
    if (!this.device) {
      return undefined;
    }
    return this.device.status.find(status => status.code === code);
  }

  private sendQueue = new Map<string, TuyaDeviceStatus>();
  private debounceSendCommands = debounce(async () => {
    const commands = [...this.sendQueue.values()];
    if (commands.length === 0) {
      return;
    }
    if (!this.device || !this.deviceManager) {
      this.log.warn('Device manager or device not available, cannot send commands.');
      this.sendQueue.clear();
      return;
    }

    try {
      await this.deviceManager.sendCommands(this.device.id, commands);
    } catch (error) {
      if (this.platform.deviceManager && this.deviceManager === this.platform.localDeviceManager) {
        const deviceName = this.device?.name || this.device?.id || 'Unknown Device';
        this.log.warn(`[${deviceName}] Local debounced send failed, falling back to cloud: ${error instanceof Error ? error.message : error}`);
        try {
          await this.platform.deviceManager.sendCommands(this.device.id, commands);
        } catch (cloudError) {
          this.log.warn(`[${deviceName}] Cloud fallback failed: ${cloudError instanceof Error ? cloudError.message : cloudError}`);
        }
      } else {
        this.log.warn(`Debounced send failed: ${error instanceof Error ? error.message : error}`);
      }
    } finally {
      this.sendQueue.clear();
    }
  }, 100);

  async sendCommands(commands: TuyaDeviceStatus[], debounce = false) {
    if (commands.length === 0) {
      return;
    }

    if (!this.device || !this.deviceManager) {
      this.log.warn('Device manager or device not available, cannot send commands.');
      return;
    }

    commands = commands.filter((status) => status.code && status.value !== undefined);

    if (this.device.online === false) {
      this.log.warn('Device is offline, skip send command.');
      this.updateAllValues();
      const { HapStatusError, HAPStatus } = this.platform.api.hap;
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      return;
    }

    // Update cache immediately
    for (const newStatus of commands) {
      const oldStatus = this.device.status.find(_status => _status.code === newStatus.code);
      if (oldStatus) {
        oldStatus.value = newStatus.value;
      }
    }

    if (debounce === false) {
      try {
        return await this.deviceManager.sendCommands(this.device.id, commands);
      } catch (error) {
        if (this.platform.deviceManager && this.deviceManager === this.platform.localDeviceManager) {
          const deviceName = this.device?.name || this.device?.id || 'Unknown Device';
          this.log.warn(`[${deviceName}] Local send failed, falling back to cloud: ${error instanceof Error ? error.message : error}`);
          return await this.platform.deviceManager.sendCommands(this.device.id, commands);
        }
        throw error;
      }
    }

    for (const newStatus of commands) {
      // Update send queue
      this.sendQueue.set(newStatus.code, newStatus);
    }

    this.debounceSendCommands();
  }

  checkRequirements() {
    if (!this.device) {
      return false;
    }

    let result = true;
    for (const codes of this.requiredSchema()) {
      const schema = this.getSchema(...codes);
      if (schema) {
        continue;
      }
      this.log.warn('Product Category: %s', this.device.category);
      this.log.warn('Missing one of the required schema: %s', codes);
      this.log.warn('Please switch device control mode to "DP Instruction", and set `deviceOverrides` manually.');
      this.log.warn('Detail information: https://github.com/homebridge-plugins/homebridge-tuya#faq');
      result = false;
    }

    if (!result) {
      this.log.warn('Existing schema: %o', this.device.schema);
    }

    return result;
  }

  requiredSchema(): string[][] {
    return [];
  }

  configureServices() {
    //
  }

  async onDeviceInfoUpdate(info) {
    this.updateAllValues();
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    this.updateAllValues();
  }

}

// Overriding getSchema, getStatus, sendCommands
export default class OverridedBaseAccessory extends BaseAccessory {

  private eval = (script: string, device, value) => eval(script);

  private getOverridedSchema(code: string) {
    if (!this.device) {
      return undefined;
    }
    const schemaConfig = this.platform.getDeviceSchemaConfig(this.device, code, this.deviceSource);
    if (!schemaConfig) {
      return undefined;
    }
    const oldSchema = this.device.schema.find(schema => {
      // ignore case
      return schema.code.toLowerCase() === schemaConfig.code.toLowerCase();
    });
    if (!oldSchema) {
      return undefined;
    }

    const schema = {
      code,
      mode: oldSchema.mode,
      type: schemaConfig.type || oldSchema.type,
      property: schemaConfig.property || oldSchema.property,
      _hidden: schemaConfig.hidden,
    } as TuyaDeviceSchema;

    if (!deepEqual(oldSchema, schema)) {
      this.log.debug('Override schema %o => %o', oldSchema, schema);
    }

    return schema;
  }

  getSchema(...codes: string[]) {
    for (const code of codes) {

      const schema = this.getOverridedSchema(code) || super.getSchema(code);
      if (!schema) {
        continue;
      }
      if (schema['_hidden']) {
        return undefined;
      }
      return schema;
    }
    return undefined;
  }


  private getOverridedStatus(code: string) {
    if (!this.device) {
      return undefined;
    }
    const schemaConfig = this.platform.getDeviceSchemaConfig(this.device, code, this.deviceSource);
    if (!schemaConfig) {
      return undefined;
    }

    const oldStatus = super.getStatus(schemaConfig.code);
    if (!oldStatus) {
      return undefined;
    }

    const status = { code: schemaConfig.newCode || schemaConfig.code, value: oldStatus.value } as TuyaDeviceStatus;
    if (schemaConfig.onGet) {
      status.value = this.eval(schemaConfig.onGet, this.device, oldStatus.value);
    }

    if (!deepEqual(oldStatus, status)) {
      this.log.debug('Override status %o => %o', oldStatus, status);
    }

    return status;
  }

  getStatus(code: string) {
    return this.getOverridedStatus(code) || super.getStatus(code);
  }


  async sendCommands(commands: TuyaDeviceStatus[], debounce?: boolean) {
    if (!this.device) {
      await super.sendCommands(commands, debounce);
      return;
    }

    // convert to original commands
    for (const command of commands) {
      const schemaConfig = this.platform.getDeviceSchemaConfig(this.device, command.code, this.deviceSource);
      if (!schemaConfig) {
        continue;
      }

      const oldCommand = { code: schemaConfig.code, value: command.value } as TuyaDeviceStatus;
      if (schemaConfig.onSet) {
        oldCommand.value = this.eval(schemaConfig.onSet, this.device, command.value);
      }

      if (!deepEqual(oldCommand, command)) {
        this.log.debug('Override command %o => %o', command, oldCommand);
        command.code = oldCommand.code;
        command.value = oldCommand.value;
      }
    }

    await super.sendCommands(commands, debounce);
  }
}
