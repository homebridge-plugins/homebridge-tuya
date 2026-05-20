import TuyaOpenAPI, { LOGIN_ERROR_MESSAGES, TuyaOpenAPIResponse } from '../api/TuyaOpenAPI';
import TuyaDevice from './TuyaDevice';
import TuyaCloudDeviceManager from './TuyaCloudDeviceManager';
import { TuyaPlatformCustomConfig } from '../../config';

export default class TuyaCustomDeviceManager extends TuyaCloudDeviceManager {
  private readonly DEFAULT_USER = 'homebridge';
  private readonly DEFAULT_PASS = 'homebridge';

  constructor(
    public override api: TuyaOpenAPI,
    public override config: TuyaPlatformCustomConfig,
    public override debug = false,
  ) {
    super(api, config, debug);
    this.mq.version = '2.0';
  }

  override async pullDevices() : Promise<TuyaDevice[]> {
    let res: TuyaOpenAPIResponse;

    this.log.info('Get token.');
    res = await this.api.getToken();
    if (!res.success) {
      this.log.error(`Get token failed. code=${res.code}, msg=${res.msg}`);
      return [];
    }

    this.log.info(`Search default user "${this.DEFAULT_USER}"`);
    res = await this.api.customGetUserInfo(this.DEFAULT_USER);
    if (!res.success) {
      this.log.error(`Search user failed. code=${res.code}, msg=${res.msg}`);
      return [];
    }


    if (!res.result.user_name) {
      this.log.info(`Default user "${this.DEFAULT_USER}" not exist.`);
      this.log.info(`Creating default user "${this.DEFAULT_USER}".`);
      res = await this.api.customCreateUser(this.DEFAULT_USER, this.DEFAULT_PASS);
      if (!res.success) {
        this.log.error(`Create default user failed. code=${res.code}, msg=${res.msg}`);
        return [];
      }
    } else {
      this.log.info(`Default user "${this.DEFAULT_USER}" exists.`);
    }
    const uid = res.result.user_id;


    this.log.info('Fetching asset list.');
    res = await this.getAssetList();
    if (!res.success) {
      this.log.error(`Fetching asset list failed. code=${res.code}, msg=${res.msg}`);
      return [];
    }

    const assetIDList: string[] = [];
    for (const { asset_id, asset_name } of res.result.list) {
      this.log.info(`Got asset_id=${asset_id}, asset_name=${asset_name}`);
      assetIDList.push(asset_id);
    }

    if (assetIDList.length === 0) {
      this.log.warn('Asset list is empty. exit.');
      return [];
    }


    this.log.info('Authorize asset list.');
    res = await this.authorizeAssetList(uid, assetIDList, true);
    if (!res.success) {
      this.log.error(`Authorize asset list failed. code=${res.code}, msg=${res.msg}`);
      return [];
    }


    this.log.info(`Log in with user "${this.DEFAULT_USER}".`);
    res = await this.api.customLogin(this.DEFAULT_USER, this.DEFAULT_USER);
    if (!res.success) {
      this.log.error(`Login failed. code=${res.code}, msg=${res.msg}`);
      if (res.code && LOGIN_ERROR_MESSAGES[res.code]) {
        this.log.error(LOGIN_ERROR_MESSAGES[res.code]);
      }
      return [];
    }

    this.log.info('Start MQTT connection.');
    this.mq.start();

    this.log.info('Fetching device list.');
    this.ownerIDs = assetIDList;
    const devices = await this.updateDevices(assetIDList);
    this.log.info(`Got ${devices.length} device(s) and scene(s).`);
    return devices;
  }

  async getAssetList(parent_asset_id = -1) {
    // const res = await this.api.get('/v1.0/iot-03/users/assets', {
    const res = await this.api.get(`/v1.0/iot-02/assets/${parent_asset_id}/sub-assets`, {
      'page_no': 0,
      'page_size': 100,
    });
    return res;
  }

  async authorizeAssetList(uid: string, asset_ids: string[] = [], authorized_children = false) {
    const res = await this.api.post(`/v1.0/iot-03/users/${uid}/actions/batch-assets-authorized`, {
      asset_ids: asset_ids.join(','),
      authorized_children,
    });
    return res;
  }

  async getAssetDeviceIDList(assetID: string) {
    let deviceIDs: string[] = [];
    const params = {
      page_size: 50,
    };

    while (true) {
      const res = await this.api.get(`/v1.0/iot-02/assets/${assetID}/devices`, params);
      deviceIDs = deviceIDs.concat((res.result.list as []).map(item => item['device_id']));
      params['last_row_key'] = res.result.last_row_key;
      if (!res.result.has_next) {
        break;
      }
    }

    return deviceIDs;
  }

  override async updateDevices(assetIDList: string[]) {

    let deviceIDs: string[] = [];
    for (const assetID of assetIDList) {
      deviceIDs = deviceIDs.concat(await this.getAssetDeviceIDList(assetID));
    }
    if (deviceIDs.length === 0) {
      return [];
    }

    const res = await this.getDeviceListInfo(deviceIDs);
    const devices = (res.result.devices as []).map(obj => new TuyaDevice(obj));

    for (const device of devices) {
      this.configDevice(device);
      device.schema = await this.getDeviceSchema(device.id);
    }

    // this.log.debug('Devices updated.\n', JSON.stringify(devices, null, 2));
    this.devices = devices;
    return devices;
  }

}
