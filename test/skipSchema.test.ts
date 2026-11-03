import { describe, expect, test } from '@jest/globals';

import TuyaOpenAPI from '../src/core/TuyaOpenAPI';
import TuyaHomeDeviceManager from '../src/device/TuyaHomeDeviceManager';

// A stand-in for the Tuya cloud: two devices in one home, and a spec for each.
function fakeApi(calls: string[]) {
  return {
    get: async (path: string) => {
      calls.push(path);
      if (path === '/v1.0/homes/1/devices') {
        return {
          success: true,
          result: [
            { id: 'light1', name: 'Light', category: 'dj', status: [] },
            { id: 'hub1', name: 'Zigbee Hub', category: 'wg2', status: [] },
          ],
        };
      }
      if (path.endsWith('/specifications')) {
        return {
          success: true,
          result: {
            status: [{ code: 'switch_led', type: 'Boolean', values: '{}' }],
            functions: [{ code: 'switch_led', type: 'Boolean', values: '{}' }],
          },
        };
      }
      return { success: false, code: 404, msg: 'unexpected' };
    },
  } as unknown as TuyaOpenAPI;
}

describe('skipSchema', () => {
  test('every device gets its specification by default', async () => {
    const calls: string[] = [];
    const manager = new TuyaHomeDeviceManager(fakeApi(calls));
    const devices = await manager.updateDevices([1]);
    expect(calls).toContain('/v1.0/devices/light1/specifications');
    expect(calls).toContain('/v1.0/devices/hub1/specifications');
    expect(devices.every(device => device.schema.length === 1)).toBe(true);
  });

  test('skipped devices are not looked up and get an empty schema', async () => {
    const calls: string[] = [];
    const manager = new TuyaHomeDeviceManager(fakeApi(calls));
    manager.skipSchema = (device) => device.id === 'hub1';
    const devices = await manager.updateDevices([1]);
    expect(calls).toContain('/v1.0/devices/light1/specifications');
    expect(calls).not.toContain('/v1.0/devices/hub1/specifications');
    expect(devices.find(device => device.id === 'light1')!.schema).toHaveLength(1);
    expect(devices.find(device => device.id === 'hub1')!.schema).toEqual([]);
  });
});
