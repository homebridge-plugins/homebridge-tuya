import { TuyaDeviceSchemaIntegerProperty } from '../../../cloud/device/TuyaDevice';
import BaseAccessory from '../BaseAccessory';

const SCHEMA_CODE = {
  CURRENT_TEMP: ['va_temperature', 'temp_value'],
  CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
};

// Custom Characteristic. Depends on TemperatureHumiditySensorAccessory or somethings like.
export function configureCurrentWetBulbGlobeTemperature(accessory: BaseAccessory) {

  const service = accessory.accessory.getService(accessory.Service.TemperatureSensor)
      || accessory.accessory.addService(accessory.Service.TemperatureSensor);

  service.getCharacteristic(accessory.Characteristic.CurrentTemperature)
    .onGet(() => {
      const rhSchema = accessory.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY);
      const rh = accessory.getStatus(rhSchema!.code)?.value as number || 1;
      const tSchema = accessory.getSchema(...SCHEMA_CODE.CURRENT_TEMP);
      const t = accessory.getStatus(tSchema!.code)?.value as number || 1;
      const rhProperty = rhSchema?.property as TuyaDeviceSchemaIntegerProperty || {};
      const rhMultiple = Math.pow(10, rhProperty['scale'] || 0);
      const tProperty = rhSchema?.property as TuyaDeviceSchemaIntegerProperty || {};
      const tMultiple = Math.pow(10, tProperty['scale'] || 0);
      return calculateWBGT(t/tMultiple, rh/rhMultiple).wbgtIndoor;
    })
    .setProps({
      unit: '℃',
      minValue: -273.15,
      maxValue: 100,
      minStep: 0.1,
    });

}

type WBGT = {
  wetBulbTemp: number;
  wbgtOutdoor: number;
  wbgtIndoor: number;
};

function calculateWBGT(temperature: number, humidity: number): WBGT {
  // 湿球温度の近似式（Stullの式）
  const tw =
    temperature * Math.atan(0.151977 * Math.sqrt(humidity + 8.313659)) +
    Math.atan(temperature + humidity) -
    Math.atan(humidity - 1.676331) +
    0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity) -
    4.686035;

  // 屋外（直射日光あり）のWBGT近似式
  const outdoor = 0.7 * tw + 0.2 * temperature + 0.1 * temperature;

  // 屋内（直射日光なし）のWBGT近似式
  const indoor = 0.7 * tw + 0.3 * temperature;

  return {
    wetBulbTemp: parseFloat(tw.toFixed(1)),
    wbgtOutdoor: parseFloat(outdoor.toFixed(1)),
    wbgtIndoor: parseFloat(indoor.toFixed(1)),
  };
}