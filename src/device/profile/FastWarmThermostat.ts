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
  return parseTemperatureReport(value, '105', 0, 1130);
}

export function isFastWarmSetTemperatureReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const report = value as Record<string, unknown>;
  const dpID = report.dp_id ?? report.dpId;
  return report.code === 'SetTemp' || dpID === 102 || dpID === '102'
    || Object.prototype.hasOwnProperty.call(report, '102');
}

/** Native DP102 and standardized temp_set use Celsius tenths for this product. */
export function getFastWarmSetTemperatureReport(value: unknown): FastWarmTemperatureReport | undefined {
  if (!isFastWarmSetTemperatureReport(value)) {
    return undefined;
  }
  return parseTemperatureReport(value, '102', 50, 400);
}

function parseTemperatureReport(
  report: Record<string, unknown>, numericKey: string, min: number, max: number,
): FastWarmTemperatureReport | undefined {
  const temperature = Object.prototype.hasOwnProperty.call(report, numericKey) ? report[numericKey] : report.value;
  if (typeof temperature !== 'number' || !Number.isInteger(temperature) || temperature < min || temperature > max) {
    return undefined;
  }

  const timestamp = report.time ?? report.t;
  let time: number | undefined;
  const number = typeof timestamp === 'string' && /^\d+$/.test(timestamp) ? Number(timestamp) : timestamp;
  if (typeof number === 'number' && Number.isFinite(number) && number > 0) {
    const milliseconds = Math.trunc(number < 1e12 ? number * 1000 : number);
    if (Number.isSafeInteger(milliseconds)) {
      time = milliseconds;
    }
  }
  return { value: temperature, time };
}
