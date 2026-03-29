import { PlatformAccessory } from 'homebridge';
import TuyaDevice from '../../cloud/device/TuyaDevice';
import { TuyaPlatform } from '../../platform';

import BaseAccessory from './BaseAccessory';
import { sanitizeName } from '../util/util';
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
import HeaterAccessory_old from './HeaterAccessory_old';
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
import WetBulbGlobeTemperatureAccessory from './WetBulbGlobeTemperatureAccessory';
import IRControlHubSubAccessory from './IRControlHubSubAccessory';
import LocationWeatherAccessory from './LocationWeatherAccessory';
import TowelRackAccessory from './TowerRackAccessory';


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

    // Always sanitize existing Name/ConfiguredName loaded from persist
    try {
      const info = accessory.getService(platform.Service.AccessoryInformation);
      if (info) {
        const currentConfigured = info.getCharacteristic(platform.Characteristic.ConfiguredName).value as unknown as string;
        const currentName = info.getCharacteristic(platform.Characteristic.Name).value as unknown as string;
        const safeConfigured = sanitizeName(currentConfigured) ?? undefined;
        const safeName = sanitizeName(currentName) ?? undefined;
        if (safeName && safeName !== currentName) {
          info.getCharacteristic(platform.Characteristic.Name).updateValue(safeName);
          platform.log.info(`Sanitized Name: ${currentName} -> ${safeName}`);
        }
        if (safeConfigured && safeConfigured !== currentConfigured) {
          info.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(safeConfigured);
          platform.log.info(`Sanitized ConfiguredName: ${currentConfigured} -> ${safeConfigured}`);
        }
      }
    } catch (e) {
      platform.log.debug('Failed to sanitize accessory name:', e);
    }

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
          const safe = sanitizeName(config.configuredName)
            ?? config.configuredName
              .replace(/[^A-Za-z0-9 '\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          const before = service.getCharacteristic(platform.Characteristic.ConfiguredName).value;
          service.getCharacteristic(platform.Characteristic.Name).updateValue(safe);
          service.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(safe);
          platform.log.info(`configuredName updated. ${before} -> ${safe}`);
        }
      } catch (_e) {
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
    case 'qn_old':
      return new HeaterAccessory_old(platform, accessory);
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
    case 'mjj':
      return new TowelRackAccessory(platform, accessory);
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

