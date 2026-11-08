import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import TuyaOpenAPI from '../../src/core/TuyaOpenAPI';
import TuyaDevice, { TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../../src/device/TuyaDevice';
import TuyaDeviceManager from '../../src/device/TuyaDeviceManager';
import { getFastWarmSetTemperatureReport } from '../../src/device/profile/FastWarmThermostat';
import { initLogger } from '../../src/util/Logger';

const NOW = 1794025076403;
const createDevice = () => new TuyaDevice({
  id: 'thermostat-1', name: 'Room', product_id: 'lmtejj3f4kafi2k1', online: true,
  schema: [{
    code: 'temp_set', mode: TuyaDeviceSchemaMode.READ_WRITE, type: TuyaDeviceSchemaType.Integer,
    property: { min: 41, max: 1040, scale: 1, step: 1, unit: '' },
  }],
  status: [{ code: 'temp_set', value: 200 }, { code: 'temp_unit_convert', value: 'c' }],
});
const shadow = (value = 220, time = NOW) => ({
  success: true as const, t: NOW, tid: 'test',
  result: { properties: [
    { code: 'RoomTemper', dp_id: 105, value: 195, time },
    { code: 'SetTemp', dp_id: 102, value, time },
  ] },
});

describe('FastWarm native target reports', () => {
  let api: TuyaOpenAPI;
  let manager: TuyaDeviceManager;
  let device: TuyaDevice;
  let get: jest.SpiedFunction<TuyaOpenAPI['get']>;
  const target = () => device.status.find(item => item.code === 'temp_set')?.value;

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

  test('hydrates the active native target through the existing read-only room-temperature request', async () => {
    const post = jest.spyOn(api, 'post');
    const listener = jest.fn();
    manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, listener);
    await manager.enrichDeviceStatus(device);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/v2.0/cloud/thing/thermostat-1/shadow/properties', { codes: 'RoomTemper,SetTemp' });
    expect(target()).toBe(220);
    expect(listener).toHaveBeenCalledWith(device, [{ code: 'temp_set', value: 220, t: NOW }]);
    expect(device.status.find(item => item.code === 'temp_current')?.value).toBe(195);
    expect(post).not.toHaveBeenCalled();
  });

  test.each([
    { dpId: 102, value: 230, t: NOW + 1000 },
    { dp_id: '102', value: 230, time: NOW + 1000 },
    { code: 'SetTemp', value: 230, t: NOW + 1000 },
    { '102': 230, t: NOW + 1000 },
  ])('mirrors a native target to canonical temp_set without changing the measured room temperature: %o', async report => {
    await manager.enrichDeviceStatus(device);
    const measurement = device.status.find(item => item.code === 'temp_current')?.value;
    const listener = jest.fn();
    manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, listener);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [report] });
    expect(target()).toBe(230);
    expect(listener).toHaveBeenCalledWith(device, [{ code: 'temp_set', value: 230, t: NOW + 1000 }]);
    expect(device.status.find(item => item.code === 'temp_current')?.value).toBe(measurement);
    expect(get).toHaveBeenCalledTimes(1);
  });

  test('orders native and standard target reports together, independently of newer room observations', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [
      { dpId: 105, value: 200, t: NOW + 3000 }, { code: 'temp_set', value: 240, t: NOW + 1000 },
    ] });
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 200, t: NOW }] });
    expect(target()).toBe(240);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230, t: NOW + 2000 }] });
    expect(target()).toBe(230);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ code: 'temp_set', value: 200, t: NOW + 1000 }] });
    expect(target()).toBe(230);
    expect(device.status.find(item => item.code === 'temp_current')?.value).toBe(200);
  });

  test('does not let stale or invalid canonical-coded native reports bypass ordering and validation', async () => {
    await manager.enrichDeviceStatus(device);
    for (const report of [
      { value: 200, t: NOW - 1000 }, { value: '230', t: NOW + 1000 },
      { value: 230.5, t: NOW + 1000 }, { value: 230, t: NOW + 3600000 },
    ]) {
      await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ code: 'temp_set', dpId: 102, ...report }] });
    }
    expect(target()).toBe(220);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230, t: NOW + 1000 }] });
    expect(target()).toBe(230);
  });

  test('does not overwrite the last accepted target when one MQTT batch includes both report forms', async () => {
    await manager.enrichDeviceStatus(device);
    const listener = jest.fn();
    manager.on(TuyaDeviceManager.Events.DEVICE_STATUS_UPDATE, listener);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [
      { dpId: 102, value: 230, t: NOW + 1000 }, { code: 'temp_set', value: 240, t: NOW + 2000 },
    ] });
    expect(target()).toBe(240);
    expect(listener).toHaveBeenCalledWith(device, [{ code: 'temp_set', value: 240, t: NOW + 2000 }]);
  });

  test('a late initial shadow cannot replace a newer native target report', async () => {
    let resolve: (value: ReturnType<typeof shadow>) => void = () => undefined;
    get.mockReturnValue(new Promise(done => { resolve = done; }));
    const request = manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230, t: NOW + 1000 }] });
    resolve(shadow(200, NOW));
    await request;
    expect(target()).toBe(230);
  });

  test('rediscovery preserves a newer accepted target on a replacement device object', async () => {
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230, t: NOW + 1000 }] });
    const replacement = createDevice();
    jest.spyOn(manager, 'getDeviceInfo').mockResolvedValue({ success: true, result: replacement, t: NOW, tid: 'test' });
    jest.spyOn(manager, 'getDeviceSchema').mockResolvedValue(replacement.schema);
    const result = await manager.updateDevice(device.id);
    expect(result?.status.find(item => item.code === 'temp_set')?.value).toBe(230);
  });

  test.each(['f', 'unknown'])('does not interpret raw native targets when the standard unit is %s', async unit => {
    device.status.find(item => item.code === 'temp_unit_convert')!.value = unit;
    await manager.enrichDeviceStatus(device);
    expect(get).toHaveBeenCalledWith('/v2.0/cloud/thing/thermostat-1/shadow/properties', { codes: 'RoomTemper' });
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230, t: NOW + 1000 }] });
    expect(target()).toBe(200);
  });

  test('does not normalize raw targets for another product', async () => {
    device.product_id = 'other-product';
    await manager.enrichDeviceStatus(device);
    await manager.onMQTTMessage('test', 4, { devId: device.id, status: [{ dpId: 102, value: 230 }] });
    expect(target()).toBe(200);
    expect(get).not.toHaveBeenCalled();
  });

  test('validates native targets and retains quoted source timestamps', () => {
    expect(getFastWarmSetTemperatureReport({ code: 'SetTemp', value: 205, time: String(NOW) })).toEqual({ value: 205, time: NOW });
    for (const value of ['205', NaN, 205.5, 49, 401]) {
      expect(getFastWarmSetTemperatureReport({ dpId: 102, value })).toBeUndefined();
    }
    expect(getFastWarmSetTemperatureReport({ code: 'RoomTemper', value: 205 })).toBeUndefined();
  });
});
