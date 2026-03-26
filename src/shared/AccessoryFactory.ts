import { PlatformAccessory } from 'homebridge';
import TuyaDevice from '../cloud/device/TuyaDevice';
import { TuyaPlatform } from '../platform';

import BaseAccessory from './accessories/BaseAccessory';
import LightAccessory from './accessories/LightAccessory';
import DimmerAccessory from './accessories/DimmerAccessory';
import OutletAccessory from './accessories/OutletAccessory';
import SwitchAccessory from './accessories/SwitchAccessory';
import WirelessSwitchAccessory from './accessories/WirelessSwitchAccessory';
import SceneSwitchAccessory from './accessories/SceneSwitchAccessory';
import FanAccessory from './accessories/FanAccessory';
import GarageDoorAccessory from './accessories/GarageDoorAccessory';
import WindowAccessory from './accessories/WindowAccessory';
import WindowCoveringAccessory from './accessories/WindowCoveringAccessory';
import BlindsAccessory from './accessories/BlindsAccessory';
import LockAccessory from './accessories/LockAccessory';
import ThermostatAccessory from './accessories/ThermostatAccessory';
import HeaterAccessory from './accessories/HeaterAccessory';
import ValveAccessory from './accessories/ValveAccessory';
import ContactSensorAccessory from './accessories/ContactSensorAccessory';
import LeakSensorAccessory from './accessories/LeakSensorAccessory';
import CarbonMonoxideSensorAccessory from './accessories/CarbonMonoxideSensorAccessory';
import CarbonDioxideSensorAccessory from './accessories/CarbonDioxideSensorAccessory';
import SmokeSensorAccessory from './accessories/SmokeSensorAccessory';
import TemperatureHumiditySensorAccessory from './accessories/TemperatureHumiditySensorAccessory';
import LightSensorAccessory from './accessories/LightSensorAccessory';
import MotionSensorAccessory from './accessories/MotionSensorAccessory';
import AirQualitySensorAccessory from './accessories/AirQualitySensorAccessory';
import HumanPresenceSensorAccessory from './accessories/HumanPresenceSensorAccessory';
import HumidifierAccessory from './accessories/HumidifierAccessory';
import DehumidifierAccessory from './accessories/DehumidifierAccessory';
import DiffuserAccessory from './accessories/DiffuserAccessory';
import AirPurifierAccessory from './accessories/AirPurifierAccessory';
import ExtractionHoodAccessory from './accessories/ExtractionHoodAccessory';
import CameraAccessory from './accessories/CameraAccessory';
import SceneAccessory from './accessories/SceneAccessory';
import AirConditionerAccessory from './accessories/AirConditionerAccessory';
import IRControlHubAccessory from './accessories/IRControlHubAccessory';
import IRGenericAccessory from './accessories/IRGenericAccessory';
import IRAirConditionerAccessory from './accessories/IRAirConditionerAccessory';
import SecuritySystemAccessory from './accessories/SecuritySystemAccessory';
import VibrationSensorAccessory from './accessories/VibrationSensorAccessory';
import WeatherStationAccessory from './accessories/WeatherStationAccessory';
import DoorbellAccessory from './accessories/DoorbellAccessory';
import PetFeederAccessory from './accessories/PetFeederAccessory';
import WhiteNoiseLightAccessory from './accessories/WhiteNoiseLightAccessory';
import WetBulbGlobeTemperatureAccessory from './accessories/WetBulbGlobeTemperatureAccessory';
import IRControlHubSubAccessory from './accessories/IRControlHubSubAccessory';
import LocationWeatherAccessory from './accessories/LocationWeatherAccessory';


export default class AccessoryFactory {
  static createAccessory(
    platform: TuyaPlatform,
    accessory: PlatformAccessory,
    device: TuyaDevice,
  ): BaseAccessory {

    let handler: BaseAccessory | undefined;

    handler = resolveAccessoryByProductID(platform, accessory, device.product_id)
      || resolveAccessoryByCategory(platform, accessory, device.category);

    // basically use should set the handler at the switch-case
    if (!handler) {
      // IR Remote Control
      if (device.isIRRemoteControl()) {
        switch (device.remote_keys?.category_id) {
          case 5: // AC
            platform.log.warn('case IRAirConditionerAccessory');
            handler = new IRAirConditionerAccessory(platform, accessory);
            break;
          default:
            platform.log.warn('case IRGenericAccessory');
            handler = new IRGenericAccessory(platform, accessory);
            break;
        }
      }
    }

    if (handler && !handler.checkRequirements()) {
      handler = undefined;
    }

    if (!handler) {
      platform.log.warn(`Unsupported device: ${device.name}.`);
      handler = new BaseAccessory(platform, accessory);
    }

    handler.configureServices();
    handler.configureStatusActive();
    handler.updateAllValues();
    handler.initialized = true;

    return handler;
  }

  static configAccessory(platform: TuyaPlatform, accessory: PlatformAccessory) {
    const configs = platform.options.serviceInformationOverrides;
    if (!configs) {
      return;
    }

    const sn = accessory.getService(platform.Service.AccessoryInformation)?.getCharacteristic(platform.Characteristic.SerialNumber).value;

    configs.filter(config => config.device_id === sn).forEach(config => {
      try {
        const service = accessory.services[config.index];
        if (config.manifacturer) {
          const before = service.getCharacteristic(platform.Characteristic.Manufacturer).value;
          service.getCharacteristic(platform.Characteristic.Manufacturer).updateValue(config.manifacturer);
          platform.log.info(`manifacturer updated. ${before} -> ${config.manifacturer}`);
        }
        if (config.model) {
          const before = service.getCharacteristic(platform.Characteristic.Model).value;
          service.getCharacteristic(platform.Characteristic.Model).updateValue(config.model);
          platform.log.info(`model updated. ${before} -> ${config.model}`);
        }
        if (config.firmwareRevision) {
          const before = service.getCharacteristic(platform.Characteristic.FirmwareRevision).value;
          service.getCharacteristic(platform.Characteristic.FirmwareRevision).updateValue(config.firmwareRevision);
          platform.log.info(`firmwareRevision updated. ${before} -> ${config.firmwareRevision}`);
        }
        if (config.configuredName) {
          const before = service.getCharacteristic(platform.Characteristic.ConfiguredName).value;
          service.getCharacteristic(platform.Characteristic.Name).updateValue(config.configuredName);
          service.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(config.configuredName);
          platform.log.info(`configuredName updated. ${before} -> ${config.configuredName}`);
        }
      } catch {
        platform.log.error(`index out of bound.:${config.index}`);
      }
    });
  }
}

function resolveAccessoryByProductID(platform: TuyaPlatform, accessory: PlatformAccessory, product_id: string): BaseAccessory | undefined {
  switch (product_id) {
    case 'scene': // see TuyaHomeDeviceManager#getSceneList
      return new SceneAccessory(platform, accessory);
    case 'virtual-product-id-wbgt':
      return new WetBulbGlobeTemperatureAccessory(platform, accessory);
    case 'virtual-product-id-weather':
      return new LocationWeatherAccessory(platform, accessory);
    default:
      return undefined;
  }
}

function resolveAccessoryByCategory(platform: TuyaPlatform, accessory: PlatformAccessory, category: string): BaseAccessory | undefined {
  switch (category) {
    // Lighting
    case 'dj':
    case 'dsd':
    case 'xdd':
    case 'fwd':
    case 'dc':
    case 'dd':
    case 'gyd':
    case 'tyndj':
    case 'sxd':
      return new LightAccessory(platform, accessory);
    case 'tgq':
    case 'tgkg':
      return new DimmerAccessory(platform, accessory);

    // Electrical Products
    case 'dlq':
    case 'kg':
    case 'tdq':
    case 'qjdcz':
    case 'szjqr':
      return new SwitchAccessory(platform, accessory);
    case 'cz':
    case 'pc':
    case 'wkcz':
      return new OutletAccessory(platform, accessory);
    case 'wxkg':
      return new WirelessSwitchAccessory(platform, accessory);
    case 'cjkg':
      return new SceneSwitchAccessory(platform, accessory);
    case 'bzyd':
      return new WhiteNoiseLightAccessory(platform, accessory);

    // Large Home Appliances
    case 'kt':
    case 'ktkzq':
      return new AirConditionerAccessory(platform, accessory);

    // Small Home Appliances
    case 'qn':
      return new HeaterAccessory(platform, accessory);
    case 'kj':
      return new AirPurifierAccessory(platform, accessory);
    case 'xxj':
      return new DiffuserAccessory(platform, accessory);
    case 'ckmkzq':
      return new GarageDoorAccessory(platform, accessory);
    case 'mg':
    case 'mgmt':
      return new BlindsAccessory(platform, accessory);
    case 'cl':
    case 'clkg':
      return new WindowCoveringAccessory(platform, accessory);
    case 'cwwsq':
      return new PetFeederAccessory(platform, accessory);
    case 'mc':
      return new WindowAccessory(platform, accessory);
    case 'wk':
    case 'wkf':
      return new ThermostatAccessory(platform, accessory);
    case 'ggq':
    case 'sfkzq':
      return new ValveAccessory(platform, accessory);
    case 'jsq':
      return new HumidifierAccessory(platform, accessory);
    case 'cs':
      return new DehumidifierAccessory(platform, accessory);
    case 'fs':
    case 'fsd':
    case 'fskg':
      return new FanAccessory(platform, accessory);
    case 'yyj':
      return new ExtractionHoodAccessory(platform, accessory);

    // Security & Video Surveillance
    case 'sp':
      return new CameraAccessory(platform, accessory);
    case 'ywbj':
      return new SmokeSensorAccessory(platform, accessory);
    case 'mcs':
      return new ContactSensorAccessory(platform, accessory);
    case 'zd':
      return new VibrationSensorAccessory(platform, accessory);
    case 'rqbj':
    case 'jwbj':
    case 'sj':
      return new LeakSensorAccessory(platform, accessory);
    case 'cobj':
    case 'cocgq':
      return new CarbonMonoxideSensorAccessory(platform, accessory);
    case 'co2bj':
    case 'co2cgq':
      return new CarbonDioxideSensorAccessory(platform, accessory);
    case 'wsdcg':
      return new TemperatureHumiditySensorAccessory(platform, accessory);
    case 'ldcg':
      return new LightSensorAccessory(platform, accessory);
    case 'pir':
      return new MotionSensorAccessory(platform, accessory);
    case 'pm25':
    case 'pm2.5':
    case 'pm25cgq':
    case 'hjjcy':
      return new AirQualitySensorAccessory(platform, accessory);
    case 'hps':
      return new HumanPresenceSensorAccessory(platform, accessory);
    case 'ms':
    case 'jtmspro':
      return new LockAccessory(platform, accessory);
    case 'mal':
      return new SecuritySystemAccessory(platform, accessory);
    case 'wxml':
      return new DoorbellAccessory(platform, accessory);
    case 'qxj':
      return new WeatherStationAccessory(platform, accessory);

    // IR Control
    case 'wnykq':
    case 'hwktwkq':
    case 'wsdykq':
      return new IRControlHubAccessory(platform, accessory);

    case 'qt':
      platform.log.debug('early product. add switch-case at function resolveAccessoryByProductID()');
      // eslint-disable-next-line max-len
      platform.log.warn('use plugin options and config category to another. https://github.com/homebridge-plugins/homebridge-tuya/blob/develop_1.7.0/ADVANCED_OPTIONS.md https://github.com/homebridge-plugins/homebridge-tuya/blob/develop_1.7.0/SUPPORTED_DEVICES.md');
      return undefined;

    case 'infrared_tv':
    case 'infrared_stb':
    case 'infrared_box':
    case 'infrared_ac':
    case 'infrared_fan':
    case 'infrared_light':
    case 'infrared_amplifier':
    case 'infrared_projector':
    case 'infrared_waterheater':
    case 'infrared_airpurifier':
    case 'infrared_humidifier':
      // Since it's a DIY, it might be better to handle it with resolveAccessoryByProductID.
      return new IRControlHubSubAccessory(platform, accessory);

    default:
      return undefined;
  }
}

