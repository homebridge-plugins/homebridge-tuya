import TuyaDevice, { TuyaDeviceSchema, TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../TuyaDevice';

const PRODUCT_ID = 'lmtejj3f4kafi2k1';

export const FASTWARM_CURRENT_TEMPERATURE_SCHEMA: TuyaDeviceSchema = {
  code: 'temp_current',
  mode: TuyaDeviceSchemaMode.READ_ONLY,
  type: TuyaDeviceSchemaType.Integer,
  property: { min: 0, max: 1130, scale: 1, step: 1, unit: '' },
};

export function isFastWarmThermostat(device: TuyaDevice) {
  return device.product_id === PRODUCT_ID;
}

export interface FastWarmTemperatureReport {
  value: number;
  time?: number;
}

export function isFastWarmTemperatureReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const report = value as Record<string, unknown>;
  const dpID = report.dp_id ?? report.dpId;
  return report.code === 'RoomTemper' || dpID === 105 || dpID === '105'
    || Object.prototype.hasOwnProperty.call(report, '105');
}

/** Accept the raw shadow property and the raw DP forms used in cloud MQTT reports. */
export function getFastWarmTemperatureReport(value: unknown): FastWarmTemperatureReport | undefined {
  if (!isFastWarmTemperatureReport(value)) {
    return undefined;
  }

  const report = value;
  const hasNumericKey = Object.prototype.hasOwnProperty.call(report, '105');
  const temperature = hasNumericKey ? report['105'] : report.value;
  if (typeof temperature !== 'number' || !Number.isInteger(temperature) || temperature < 0 || temperature > 1130) {
    return undefined;
  }

  const timestamp = report.time ?? report.t;
  let time: number | undefined;
  if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
    time = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  }
  return { value: temperature, time };
}
