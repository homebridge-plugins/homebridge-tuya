import { PlatformAccessory } from 'homebridge';
import TuyaDevice from '../device/TuyaDevice';
import { TuyaPlatform } from '../platform';

import BaseAccessory from './BaseAccessory';
import LightAccessory from './LightAccessory';
import DimmerAccessory from './DimmerAccessory';
import OutletAccessory from './OutletAccessory';
import SwitchAccessory from './SwitchAccessory';
import WirelessSwitchAccessory from './WirelessSwitchAccessory';
import SceneSwitchAccessory from './SceneSwitchAccessory';
import FanAccessory from './FanAccessory';
import GarageDoorAccessory from './GarageDoorAccessory';
import WindowAccessory from './WindowAccessory';
import WindowCoveringAccessory from './WindowCoveringAccessory';
import LockAccessory from './LockAccessory';
import ThermostatAccessory from './ThermostatAccessory';
import HeaterAccessory from './HeaterAccessory';
import ValveAccessory from './ValveAccessory';
import ContactSensorAccessory from './ContactSensorAccessory';
import LeakSensorAccessory from './LeakSensorAccessory';
import CarbonMonoxideSensorAccessory from './CarbonMonoxideSensorAccessory';
import CarbonDioxideSensorAccessory from './CarbonDioxideSensorAccessory';
import SmokeSensorAccessory from './SmokeSensorAccessory';
import TemperatureHumiditySensorAccessory from './TemperatureHumiditySensorAccessory';
import LightSensorAccessory from './LightSensorAccessory';
import MotionSensorAccessory from './MotionSensorAccessory';
import AirQualitySensorAccessory from './AirQualitySensorAccessory';
import HumanPresenceSensorAccessory from './HumanPresenceSensorAccessory';
import HumidifierAccessory from './HumidifierAccessory';
import DehumidifierAccessory from './DehumidifierAccessory';
import DiffuserAccessory from './DiffuserAccessory';
import AirPurifierAccessory from './AirPurifierAccessory';
import ExtractionHoodAccessory from './ExtractionHoodAccessory';
import CameraAccessory from './CameraAccessory';
import SceneAccessory from './SceneAccessory';
import AirConditionerAccessory from './AirConditionerAccessory';
import IRControlHubAccessory from './IRControlHubAccessory';
import IRGenericAccessory from './IRGenericAccessory';
import IRAirConditionerAccessory from './IRAirConditionerAccessory';
import SecuritySystemAccessory from './SecuritySystemAccessory';
import VibrationSensorAccessory from './VibrationSensorAccessory';
import WeatherStationAccessory from './WeatherStationAccessory';
import DoorbellAccessory from './DoorbellAccessory';
import PetFeederAccessory from './PetFeederAccessory';
import WhiteNoiseLightAccessory from './WhiteNoiseLightAccessory';


export default class AccessoryFactory {
  static createAccessory(
    platform: TuyaPlatform,
    accessory: PlatformAccessory,
    device: TuyaDevice,
  ): BaseAccessory {

    let handler : BaseAccessory | undefined;

    handler = resolveAccessoryByProductID(platform, accessory, device.product_id);

    if (!handler) {
      handler = resolveAccessoryByCategory(platform, accessory, device.category);
    }

    // basically use should set the handler at the switch-case
    if (!handler) {
      // IR Remote Control
      if (device.isIRRemoteControl()) {
        switch (device.remote_keys?.category_id) {
          case 5: // AC
          platform.log.warn("case IRAirConditionerAccessory");
            handler = new IRAirConditionerAccessory(platform, accessory);
            break;
          default:
          platform.log.warn("case IRGenericAccessory");
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
    handler.intialized = true;

    return handler;
  }
}
function resolveAccessoryByProductID(platform: TuyaPlatform, accessory: PlatformAccessory, product_id: string): BaseAccessory | undefined {
  switch (product_id) {
    case 'prsgoryjfdtb42r4':
      return undefined;
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
        platform.log.debug(`early product. add switch-case at function resolveAccessoryByProductID()`);
        platform.log.warn(`use plugin options and config category to another. https://github.com/0x5e/homebridge-tuya-platform/blob/develop_1.7.0/ADVANCED_OPTIONS.md https://github.com/0x5e/homebridge-tuya-platform/blob/develop_1.7.0/SUPPORTED_DEVICES.md`);
        return undefined;

      // Other
      // FIXME: I suppose 'scene' is not an official category. add switch-case at function resolveAccessoryByProductID()
      case 'scene':
        return new SceneAccessory(platform, accessory);

      default:
        return undefined;
    }
}

