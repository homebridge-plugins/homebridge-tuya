import BaseAccessory from './BaseAccessory';
import TemperatureHumiditySensorAccessory from './TemperatureHumiditySensorAccessory';
import { configureCurrentWetBulbGlobeTemperature } from './characteristic/CurrentWetBulbGlobeTemperature';

const SCHEMA_CODE = {
  CURRENT_TEMP: ['va_temperature', 'temp_value'],
  CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
};

export default class WetBulbGlobeTemperatureAccessory extends BaseAccessory {

  requiredSchema() {
    return [SCHEMA_CODE.CURRENT_TEMP, SCHEMA_CODE.CURRENT_HUMIDITY];
  }

  configureServices(): void {
    const helperAcessory = new TemperatureHumiditySensorAccessory(this.platform, this.accessory);
    configureCurrentWetBulbGlobeTemperature(helperAcessory);
  }

}
