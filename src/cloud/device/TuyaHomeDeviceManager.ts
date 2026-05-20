import TuyaDevice from './TuyaDevice';
import TuyaCloudDeviceManager from './TuyaCloudDeviceManager';
import { TuyaPlatformHomeConfig } from '../../config';
import TuyaOpenAPI, { LOGIN_ERROR_MESSAGES, TuyaOpenAPIResponse } from '../api/TuyaOpenAPI';

export default class TuyaHomeDeviceManager extends TuyaCloudDeviceManager {

  constructor(
    public override api: TuyaOpenAPI,
    public override config: TuyaPlatformHomeConfig,
    public override debug = false,
  ) {
    super(api, config, debug);
  }

  override async pullDevices(): Promise<TuyaDevice[]> {
    let res: TuyaOpenAPIResponse;
    const { countryCode, homeWhitelist, username, password, appSchema } = this.config;

    this.log.info('Log in to Tuya Cloud.');
    res = await this.api.homeLogin(countryCode, username, password, appSchema);
    if (!res.success) {
      this.log.error(`Login failed. code=${res.code}, msg=${res.msg}`);
      if (res.code && LOGIN_ERROR_MESSAGES[res.code]) {
        this.log.error(LOGIN_ERROR_MESSAGES[res.code]);
      }
      return [];
    }

    this.log.info('Start MQTT connection.');
    this.mq.start();

    this.log.info('Fetching home list.');
    res = await this.getHomeList();
    if (!res.success) {
      this.log.error(`Fetching home list failed. code=${res.code}, msg=${res.msg}`);
      return [];
    }

    const homeIDList: number[] = [];
    for (const { home_id, name } of res.result) {
      this.log.info(`Got home_id=${home_id}, name=${name}`);
      if (homeWhitelist) {
        if (homeWhitelist.includes(home_id)) {
          this.log.info(`Found home_id=${home_id} in whitelist; including devices from this home.`);
          homeIDList.push(home_id);
        } else {
          this.log.info(`Did not find home_id=${home_id} in whitelist; excluding devices from this home.`);
        }
      } else {
        homeIDList.push(home_id);
      }
    }

    if (homeIDList.length === 0) {
      this.log.warn('Home list is empty.');
    }

    this.log.info('Fetching device list.');
    this.ownerIDs = homeIDList.map(homeID =>homeID.toString());
    const devices = await this.updateDevices(homeIDList);

    this.log.info('Fetching scene list.');
    for (const homeID of homeIDList) {
      const scenes = await this.getSceneList(homeID);
      for (const scene of scenes) {
        this.log.info(`Got scene_id=${scene.id}, name=${scene.name}`);
      }
      devices.push(...scenes);
    }

    if (this.config.generateWeatherAccessory) {
      const targetDevice = devices.find(device => device.lat && device.lon);
      if (targetDevice) {
        devices.push(this.createWeatherDevice(targetDevice, res.result));
      }
    }

    this.log.info(`Got ${devices.length} device(s) and scene(s).`);
    return devices;
  }

  override async updateDevices(homeIDList: number[]) {

    let devices: TuyaDevice[] = [];
    for (const homeID of homeIDList) {
      const res = await this.getHomeDeviceList(homeID);
      devices = devices.concat((res.result as []).map(obj => new TuyaDevice(obj)));
    }
    if (devices.length === 0) {
      return [];
    }

    for (const device of devices) {
      this.configDevice(device);
      device.schema = await this.getDeviceSchema(device.id);
    }

    // this.log.debug('Devices updated.\n', JSON.stringify(devices, null, 2));
    this.devices = devices;
    return devices;
  }

  async getHomeList() {
    const res = await this.api.get(`/v1.0/users/${this.api.tokenInfo.uid}/homes`);
    return res;
  }

  async getHomeDeviceList(homeID: number) {
    const res = await this.api.get(`/v1.0/homes/${homeID}/devices`);
    return res;
  }

  async getSceneList(homeID: number) {
    const res = await this.api.get(`/v1.1/homes/${homeID}/scenes`);
    if (!res.success) {
      this.log.warn('Get scene list failed. homeId = %d, code = %s, msg = %s', homeID, res.code, res.msg);
      return [];
    }

    const scenes: TuyaDevice[] = [];
    for (const { scene_id, name, enabled, status } of res.result) {
      if (enabled !== true || status !== '1') {
        continue;
      }

      scenes.push(new TuyaDevice({
        id: scene_id,
        uuid: scene_id,
        name,
        owner_id: homeID.toString(),
        product_id: 'scene',
        category: 'scene',
        schema: [],
        status: [],
        online: true,
      }));
    }
    return scenes;
  }

  async executeScene(homeID: string | number, sceneID: string) {
    const res = await this.api.post(`/v1.0/homes/${homeID}/scenes/${sceneID}/trigger`);
    return res;
  }
}
