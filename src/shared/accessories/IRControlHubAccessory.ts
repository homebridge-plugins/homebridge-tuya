import { TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import BaseAccessory from './BaseAccessory';
// import { configureCurrentAbsoluteHumidity } from './characteristic/CurrentAbsoluteHumidity';
import { configureCurrentRelativeHumidity } from './characteristic/CurrentRelativeHumidity';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { configureLightSensor } from './characteristic/LightSensor';

const SCHEMA_CODE = {
  CURRENT_TEMP: ['va_temperature', 'temp_value'],
  CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
  LIGHT_SENSOR: ['bright_value'],
};

export default class IRControlHubAccessory extends BaseAccessory {

  requiredSchema() {
    return [];
  }

  configureServices() {
    configureCurrentTemperature(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    configureCurrentRelativeHumidity(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
    configureLightSensor(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_SENSOR));
    // eslint-disable-next-line max-len
    //    configureCurrentAbsoluteHumidity(this.platform.api, this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    const key = `wbgt-${this.device!.id}`;
    const uuid = this.platform.api.hap.uuid.generate(key);
    if (!this.deviceManager!.devices.some(device => device.uuid === uuid)) {
      this.log.info(`add wbgt device:${key}`);
      const virtualDevice = this.deviceManager!.createVirtualDevice(this.device!, uuid);
      virtualDevice.product_id = 'virtual-product-id-wbgt';
      virtualDevice.category = 'wsdcg';
      virtualDevice.name = 'WBGT';
      this.deviceManager!.devices.push(virtualDevice);
    }
  }

  getSubAccessories() {
    return this.platform.accessoryHandlers.filter(accessory => accessory.device!.parent_id === this.device!.id);
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    super.onDeviceStatusUpdate(status);

    // Trigger sub device update temperature & humidity from parent device.
    for (const subAccessory of this.getSubAccessories()) {
      await subAccessory.updateAllValues();
    }
  }
}
