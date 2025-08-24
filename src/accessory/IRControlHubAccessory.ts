import { TuyaDeviceStatus } from '../device/TuyaDevice';
import BaseAccessory from './BaseAccessory';
import { configureCurrentAbsoluteHumidity } from './characteristic/CurrentAbsoluteHumidity';
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
//    configureCurrentAbsoluteHumidity(this.platform.api, this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    const virtualDevice = this.deviceManager.createVirtualDevice(this.device);
    virtualDevice.product_id = 'virtual-product-id-wbgt';
    virtualDevice.category = 'wsdcg';
    virtualDevice.name = 'WBGT'
    this.deviceManager.devices.push(virtualDevice);
  }

  getSubAccessories() {
    return this.platform.accessoryHandlers.filter(accessory => accessory.device.parent_id === this.device.id);
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    super.onDeviceStatusUpdate(status);

    // Trigger sub device update temperature & humidity from parent device.
    for (const subAccessory of this.getSubAccessories()) {
      await subAccessory.updateAllValues();
    }
  }
}
