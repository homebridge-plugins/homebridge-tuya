import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import TuyaOpenAPI from '../../src/core/TuyaOpenAPI';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import TuyaDeviceManager from '../../src/device/TuyaDeviceManager';
import TuyaHomeDeviceManager from '../../src/device/TuyaHomeDeviceManager';
import TuyaCustomDeviceManager from '../../src/device/TuyaCustomDeviceManager';
import { getFastWarmTemperatureReport } from '../../src/device/profile/FastWarmThermostat';
import { initLogger } from '../../src/util/Logger';

const NOW = 1794025076403;
const createDevice = (productID = 'lmtejj3f4kafi2k1') => new TuyaDevice({
  id: 'thermostat-1', name: 'Room', product_id: productID, online: true,
  schema: [{
    code: 'temp_set', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Integer,
    property: { min: 41, max: 1040, scale: 1, step: 1, unit: '' },
  }],
  status: [{ code: 'temp_set', value: 200 }, { code: 'switch', value: true }, { code: 'temp_unit_convert', value: 'c' }],
});
const shadow = (value = 195, time = NOW) => ({
  success: true as const,
  result: { properties: [{ code: 'RoomTemper', custom_name: '', dp_id: 105, time, type: 'value', value }] },
  t: NOW, tid: 'test',
});

describe('FastWarm raw temperature support', () => {
  let api: TuyaOpenAPI;
  let manager: TuyaDeviceManager;
  let device: TuyaDevice;
  let get: jest.SpiedFunction<TuyaOpenAPI['get']>;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    initLogger({ info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() });
    api = new TuyaOpenAPI(TuyaOpenAPI.Endpoints.EUROPE, 'test-access-id', 'test-key');
    get = jest.spyOn(api, 'get').mockResolvedValue(shadow());
    manager = new TuyaDeviceManager(api);
    device = createDevice();
    manager.devices = [device];
  });

  afterEach(() => { jest.restoreAllMocks(); });

  test('hydrates DP105, preserving the standard controls and their API', async () => {
    const originalStatus = device.status.map(status => ({ ...status }));
    const post = jest.spyOn(api, 'post').mockResolvedValue({ success: true, result: true, t: NOW, tid: 'test' });
    await manager.enrichDeviceStatus(device);

    expect(get).toHaveBeenCalledWith('/v2.0/cloud/thing/thermostat-1/shadow/properties', { codes: 'RoomTemper,SetTemp' });
    expect(device.schema.find(schema => schema.code === 'temp_current')).toMatchObject({
      mode: 'ro', type: 'Integer', property: { scale: 1 },
    });
    expect(device.status).toEqual(expect.arrayContaining(originalStatus));
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(195);
    await manager.sendCommands(device.id, [{ code: 'temp_set', value: 210 }, { code: 'switch', value: false }]);
    expect(post).toHaveBeenCalledWith('/v1.0/devices/thermostat-1/commands', {
      commands: [{ code: 'temp_set', value: 210 }, { code: 'switch', value: false }],
    });
  });

  test('does not fetch or normalize raw values for an unrelated product', async () => {
    device.product_id = 'other-thermostat';
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 195 }] });
    expect(get).not.toHaveBeenCalled();
    expect(device.status.find(status => status.code === 'temp_current')).toBeUndefined();
  });

  test('preserves a genuine standard current-temperature schema and value', async () => {
    device.schema.push({ ...device.schema[0], code: 'temp_current' });
    device.status.push({ code: 'temp_current', value: 180 });
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 195 }] });
    expect(get).not.toHaveBeenCalled();
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(180);
  });

  test('enrichment is idempotent and keeps raw MQTT ownership', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.enrichDeviceStatus(device);
    expect(device.schema.filter(schema => schema.code === 'temp_current')).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 210, t: NOW + 1 }] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(210);
  });

  test.each([
    { dpId: 105, value: 205, t: NOW + 1 },
    { dp_id: 105, value: 205, time: NOW + 1 },
    { code: 'RoomTemper', value: 205, t: NOW + 1 },
    { '105': 205, t: NOW + 1 },
  ])('normalizes a raw MQTT report before emitting the status update: %o', async report => {
    await manager.enrichDeviceStatus(device);
    const listener = jest.fn();
    manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, listener);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [report] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(205);
    expect(listener).toHaveBeenCalledWith(device, expect.arrayContaining([{ code: 'temp_current', value: 205 }]));
  });

  test('recovers through MQTT when startup shadow retrieval is unauthorized', async () => {
    get.mockResolvedValue({ success: false, result: {}, code: 28841101, msg: 'not authorized', t: NOW, tid: 'test' });
    await manager.enrichDeviceStatus(device);
    expect(device.status.find(status => status.code === 'temp_current')).toBeUndefined();
    expect(device.status.find(status => status.code === 'temp_set')?.value).toBe(200);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 180, t: NOW }] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(180);
  });

  test('coalesces concurrent requests and does not let a delayed shadow overwrite newer MQTT', async () => {
    let resolve: (value: ReturnType<typeof shadow>) => void = () => undefined;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const first = manager.enrichDeviceStatus(device);
    const second = manager.refreshSupplementalTemperature(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 210, t: NOW + 1000 }] });
    resolve(shadow(195, NOW));
    await Promise.all([first, second]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(210);
  });

  test('does not let stale raw reports with a canonical code bypass normalization', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, {
      devId: device.id, status: [{ code: 'temp_current', dpId: 105, value: 180, t: NOW - 1000 }],
    });
    await manager.onMQTTMessage('test', 4, {
      devId: device.id, status: [{ code: 'temp_current', dpId: 105, value: 'broken', t: NOW + 1000 }],
    });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(195);
  });

  test('preserves the latest raw reading when rediscovery returns a replacement device object', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 210, t: NOW + 1000 }] });
    const replacement = createDevice();
    jest.spyOn(manager, 'getDeviceInfo').mockResolvedValue({ success: true, result: replacement, t: NOW, tid: 'test' });
    jest.spyOn(manager, 'getDeviceSchema').mockResolvedValue(replacement.schema);
    const result = await manager.updateDevice(device.id);
    expect(result).not.toBe(device);
    expect(result?.status.find(status => status.code === 'temp_current')?.value).toBe(210);
    expect(get).toHaveBeenCalledTimes(1);
  });

  test('throttles successful reads to five minutes without scheduling background polling', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(1);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * 60 * 1000);
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('backs off failed reads and retries successfully on a later HomeKit read', async () => {
    get.mockRejectedValue(new Error('network unavailable'));
    await manager.enrichDeviceStatus(device);
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(1);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 60 * 1000);
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(2);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 2 * 60 * 1000);
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(2);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 3 * 60 * 1000);
    get.mockResolvedValue(shadow());
    await manager.refreshSupplementalTemperature(device);
    expect(get).toHaveBeenCalledTimes(3);
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(195);
  });

  test('does not fetch while the device is offline', async () => {
    device.online = false;
    await manager.enrichDeviceStatus(device);
    expect(get).not.toHaveBeenCalled();
  });

  test.each([undefined, {}, { code: 'FloorTemper', value: 195 }, { dpId: 105, value: '195' },
    { dpId: 105, value: NaN }, { dpId: 105, value: 195.5 }, { dpId: 105, value: -1 }, { dpId: 105, value: 1131 }])(
    'rejects an unrelated or malformed raw reading: %o', report => {
      expect(getFastWarmTemperatureReport(report)).toBeUndefined();
    },
  );

  test('normalizes second-based timestamps', () => {
    expect(getFastWarmTemperatureReport({ dpId: 105, value: 195, t: 1794025076 })?.time).toBe(1794025076000);
  });

  test('retains quoted source timestamps rather than treating a late shadow as a new report', async () => {
    let resolve: (value: ReturnType<typeof shadow>) => void = () => undefined;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const request = manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, {
      devId: device.id, status: [{ dpId: 105, value: 210, t: String(NOW + 1000) }],
    });
    resolve(shadow(195, NOW));
    await request;
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(210);
    expect(getFastWarmTemperatureReport({ dpId: 105, value: 195, t: String(NOW) })?.time).toBe(NOW);
  });

  test('ignores far-future room reports without blocking the next valid update', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 230, t: NOW + 3600000 }] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(195);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 105, value: 205, t: NOW + 1000 }] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(205);
  });

  test('keeps only the latest accepted room reading in a batch with duplicate raw report forms', async () => {
    await manager.enrichDeviceStatus(device);
    const listener = jest.fn();
    manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, listener);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [
      { dpId: 105, value: 200, t: NOW + 1000 },
      { code: 'RoomTemper', value: 210, t: NOW + 2000 },
      { '105': 205, t: NOW + 1500 },
    ] });
    expect(device.status.find(status => status.code === 'temp_current')?.value).toBe(210);
    expect(listener).toHaveBeenCalledWith(device, [{ code: 'temp_current', value: 210 }]);
  });

  test.each(['home', 'custom', 'single'])('hydrates before returning a device from %s discovery', async kind => {
    if (kind === 'home') {
      const home = new TuyaHomeDeviceManager(api);
      jest.spyOn(home, 'getHomeDeviceList').mockResolvedValue({ success: true, result: [device], t: NOW, tid: 'test' });
      jest.spyOn(home, 'getDeviceSchema').mockResolvedValue(device.schema);
      const devices = await home.updateDevices([1]);
      expect(devices[0].status.find(status => status.code === 'temp_current')?.value).toBe(195);
    } else if (kind === 'custom') {
      const custom = new TuyaCustomDeviceManager(api);
      jest.spyOn(custom, 'getAssetDeviceIDList').mockResolvedValue([device.id]);
      jest.spyOn(custom, 'getDeviceListInfo').mockResolvedValue({ success: true, result: { devices: [device] }, t: NOW, tid: 'test' });
      jest.spyOn(custom, 'getDeviceSchema').mockResolvedValue(device.schema);
      const devices = await custom.updateDevices(['asset']);
      expect(devices[0].status.find(status => status.code === 'temp_current')?.value).toBe(195);
    } else {
      jest.spyOn(manager, 'getDeviceInfo').mockResolvedValue({ success: true, result: device, t: NOW, tid: 'test' });
      jest.spyOn(manager, 'getDeviceSchema').mockResolvedValue(device.schema);
      const result = await manager.updateDevice(device.id);
      expect(result?.status.find(status => status.code === 'temp_current')?.value).toBe(195);
    }
  });
});
