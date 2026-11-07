import TuyaDevice from '../device/TuyaDevice';
import { redactSensitive } from './util';
import { writePrivateJson } from './PrivateFile';

/** This file is a diagnostic export, not a source of credentials for device control. */
export async function writeDeviceCache(file: string, devices: readonly TuyaDevice[]): Promise<void> {
  const omitted = /^(local_?key|ip|lat|lon|latitude|longitude)$/i;
  const diagnostics = devices.map(device => Object.fromEntries(
    Object.entries(device).filter(([key]) => !omitted.test(key)),
  ));
  await writePrivateJson(file, redactSensitive(diagnostics));
}
