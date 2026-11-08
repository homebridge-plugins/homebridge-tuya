import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import TuyaDevice from '../src/device/TuyaDevice';
import { writeDeviceCache } from '../src/util/DeviceCache';
import { writePrivateJson } from '../src/util/PrivateFile';

describe('private diagnostic and state files', () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuya-private-')); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  test('diagnostic cache omits local keys and location without changing live device data', async () => {
    const input = { id: 'fixture-device', name: 'Fixture room', local_key: 'LOCAL_KEY_CANARY',
      ip: '192.0.2.1', lat: '10.0', lon: '20.0', access_token: 'ACCESS_TOKEN_CANARY',
      schema: [{ code: 'temp_set', property: { min: 50, max: 400 } }],
      status: [{ code: 'temp_set', value: 200 }] };
    const file = path.join(directory, 'devices.json');
    await writeDeviceCache(file, [input as unknown as TuyaDevice]);
    const text = await fs.readFile(file, 'utf8');
    const [cached] = JSON.parse(text);
    for (const key of ['local_key', 'ip', 'lat', 'lon']) {
      expect(cached).not.toHaveProperty(key);
    }
    expect(text).not.toContain('LOCAL_KEY_CANARY');
    expect(text).not.toContain('ACCESS_TOKEN_CANARY');
    expect(cached.schema).toEqual(input.schema);
    expect(cached.status).toEqual(input.status);
    expect(input.local_key).toBe('LOCAL_KEY_CANARY');
    expect(input.access_token).toBe('ACCESS_TOKEN_CANARY');
  });

  test('replaces an existing permissive file with an owner-only file', async () => {
    const file = path.join(directory, 'profiles.json');
    await fs.writeFile(file, 'old', { mode: 0o644 });
    await writePrivateJson(file, { saved: true });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ saved: true });
    if (process.platform !== 'win32') {
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    }
    expect(await fs.readdir(directory)).toEqual(['profiles.json']);
  });

  test('replaces destination symlink without overwriting its target', async () => {
    if (process.platform === 'win32') { return; }
    const target = path.join(directory, 'unrelated.txt');
    const file = path.join(directory, 'profiles.json');
    await fs.writeFile(target, 'UNRELATED_CANARY');
    await fs.symlink(target, file);
    await writePrivateJson(file, { saved: true });
    expect(await fs.readFile(target, 'utf8')).toBe('UNRELATED_CANARY');
    expect((await fs.lstat(file)).isSymbolicLink()).toBe(false);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ saved: true });
  });

  test('a legacy predictable temporary symlink is never opened', async () => {
    if (process.platform === 'win32') { return; }
    const target = path.join(directory, 'unrelated.txt');
    const file = path.join(directory, 'profiles.json');
    const trap = `${file}.${process.pid}.tmp`;
    await fs.writeFile(target, 'UNRELATED_CANARY');
    await fs.symlink(target, trap);
    await writePrivateJson(file, { saved: true });
    expect(await fs.readFile(target, 'utf8')).toBe('UNRELATED_CANARY');
    expect((await fs.lstat(trap)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(file)).isSymbolicLink()).toBe(false);
  });

  test('concurrent saves publish complete JSON and leave no temporary files', async () => {
    const file = path.join(directory, 'profiles.json');
    await Promise.all(Array.from({ length: 6 }, (_, revision) => writePrivateJson(file, { revision, payload: 'x'.repeat(2048) })));
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(saved.revision).toBeGreaterThanOrEqual(0);
    expect(saved.payload).toHaveLength(2048);
    expect(await fs.readdir(directory)).toEqual(['profiles.json']);
  });
});
