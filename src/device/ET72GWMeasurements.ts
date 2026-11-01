import type { ET72GWMeasurementsConfig, TuyaPlatformDeviceConfig } from '../config';
import type Logger from '../util/Logger';
import type TuyaDevice from './TuyaDevice';
import { ShadowReadError } from '../core/TuyaOpenAPI';

export interface FloorSample {
  celsius: number;
  measuredAt: number;
}

export interface HeatingSample {
  heating: boolean;
  relayActive: boolean;
  powered: boolean;
  measuredAt: number;
  powerMeasuredAt: number;
}

interface BooleanReport {
  value: boolean;
  time: number;
}

interface ParsedSample extends FloorSample {
  fahrenheit: boolean;
  raw: number;
  unitTime: number;
}

export interface ET72GWMeasurementOptions {
  pollIntervalSeconds: number;
  maxCacheAgeSeconds: number;
  maxReportAgeSeconds: number;
  maxHeatingReportAgeSeconds?: number;
}

export function et72gwOptions(device: Pick<TuyaDevice, 'id' | 'product_id'>, configs?: TuyaPlatformDeviceConfig[]) {
  // Deliberately do not inherit product/global/UUID overrides: activation needs the actual device ID.
  const config = configs?.find(item => item.id === device.id)?.et72gwCloudMeasurements;
  if (device.product_id !== 'm2dkohai78cwr3yd' || config?.enabled !== true) {
    return undefined;
  }
  return validateOptions(config);
}

function validateOptions(config: ET72GWMeasurementsConfig): ET72GWMeasurementOptions {
  const options = {
    pollIntervalSeconds: config.pollIntervalSeconds ?? 300,
    maxCacheAgeSeconds: config.maxCacheAgeSeconds ?? 900,
    maxReportAgeSeconds: config.maxReportAgeSeconds ?? 0,
    maxHeatingReportAgeSeconds: config.maxHeatingReportAgeSeconds ?? 0,
  };
  for (const [key, min, max] of [
    ['pollIntervalSeconds', 60, 3600],
    ['maxCacheAgeSeconds', 60, 86400],
    ['maxReportAgeSeconds', 0, 604800],
    ['maxHeatingReportAgeSeconds', 0, 604800],
  ] as const) {
    if (!Number.isInteger(options[key]) || options[key] < min || options[key] > max) {
      throw new Error(`Invalid ET-72GW ${key}`);
    }
  }
  return options;
}

type UnitReport = { unitTime: number; fahrenheit: boolean };

function propertyReader(result: unknown, now: number) {
  const properties = (result as { properties?: unknown })?.properties;
  if (!Array.isArray(properties)) {
    throw new Error('Missing shadow properties');
  }
  return (code: string, id: number) => {
    // Reject conflicting IDs/codes as well as duplicates, without depending on array order.
    const matches = properties.filter(p => p && (p.code === code || p.dpId === id || p.dp_id === id));
    const p = matches[0];
    if (matches.length !== 1 || p.code !== code || (p.dpId ?? p.dp_id) !== id
      || (p.dpId !== undefined && p.dpId !== id) || (p.dp_id !== undefined && p.dp_id !== id)
      || !Number.isSafeInteger(p.time) || p.time <= 0 || p.time > now + 60000) {
      throw new Error('Invalid shadow property');
    }
    return p;
  };
}

function parseSample(result: unknown, now: number, observeUnit: (unit: UnitReport) => void): ParsedSample {
  const property = propertyReader(result, now);
  const unit = property('TemperUnitChange', 107);
  if (typeof unit.value !== 'boolean') {
    throw new Error('Invalid unit');
  }
  // Remember a validated unit switch even when the floor report is missing, invalid, or predates it.
  observeUnit({ unitTime: unit.time, fahrenheit: unit.value });
  const floor = property('FloorTemper', 106);
  if (!Number.isSafeInteger(floor.value) || unit.time > floor.time) {
    throw new Error('Invalid floor temperature or ambiguous unit');
  }
  const celsius = unit.value ? (floor.value / 10 - 32) * 5 / 9 : floor.value / 10;
  // HomeKit CurrentTemperature's standard range. Never clamp a sensor error to a plausible number.
  if (celsius < -270 || celsius > 100) {
    throw new Error('Floor temperature outside HomeKit range');
  }
  return { celsius, measuredAt: floor.time, fahrenheit: unit.value, raw: floor.value, unitTime: unit.time };
}

function parseHeating(
  result: unknown, now: number, observeRelay: (report: BooleanReport) => void, observePower: (report: BooleanReport) => void,
): HeatingSample {
  const property = propertyReader(result, now);
  const readBoolean = (code: string, id: number, observe: (report: BooleanReport) => void) => {
    const p = property(code, id);
    if (typeof p.value !== 'boolean') {
      throw new Error('Invalid heating boolean');
    }
    observe({ value: p.value, time: p.time });
    return p as { value: boolean; time: number };
  };
  // Remember independently valid reports even when the other property is missing or malformed.
  let relay: BooleanReport | undefined;
  let power: BooleanReport | undefined;
  try {
    relay = readBoolean('work_status', 118, observeRelay);
  } catch { /* Power history must still advance if its report is valid. */ }
  try {
    power = readBoolean('power1', 101, observePower);
  } catch { /* Relay history is retained even with an invalid power report. */ }
  if (!relay || !power || (power.value && power.time > relay.time)) {
    throw new Error('Unavailable or temporally ambiguous heating state');
  }
  return {
    heating: power.value && relay.value, relayActive: relay.value, powered: power.value,
    measuredAt: relay.time, powerMeasuredAt: power.time,
  };
}

/** Separate read-only cache: never mutates Tuya schemas, status, commands, or overrides. */
export class ET72GWMeasurements {
  private sample?: ParsedSample;
  private highWater?: ParsedSample;
  private unitHighWater?: UnitReport;
  private relayHighWater?: BooleanReport;
  private powerHighWater?: BooleanReport;
  private heatingSample?: HeatingSample;
  private heatingRetrievedAt = -Infinity;
  private retrievedAt = -Infinity;
  private nextAttempt = -Infinity;
  private inFlight?: Promise<void>;
  private pollTimer?: NodeJS.Timeout;
  private expiryTimer?: NodeJS.Timeout;
  private stopped = false;
  private authorizationFailed = false;
  private running = false;
  private failure?: ShadowReadError['kind'] | 'data';

  constructor(
    private readonly read: () => Promise<unknown>,
    readonly options: ET72GWMeasurementOptions,
    private readonly changed: () => void,
    private readonly online: () => boolean,
    private readonly log?: Pick<Logger, 'warn' | 'info'>,
  ) {}

  currentFloor(): FloorSample | undefined {
    if (!this.online() || !this.sample || performance.now() - this.retrievedAt >= this.options.maxCacheAgeSeconds * 1000
      || (this.options.maxReportAgeSeconds > 0 && Date.now() - this.sample.measuredAt >= this.options.maxReportAgeSeconds * 1000)) {
      return undefined;
    }
    return { celsius: this.sample.celsius, measuredAt: this.sample.measuredAt };
  }

  currentHeating(): HeatingSample | undefined {
    const maxAge = this.options.maxHeatingReportAgeSeconds ?? 0;
    if (!this.online() || !this.heatingSample
      || performance.now() - this.heatingRetrievedAt >= this.options.maxCacheAgeSeconds * 1000
      || (maxAge > 0 && Date.now() - this.heatingSample.measuredAt >= maxAge * 1000)) {
      return undefined;
    }
    return { ...this.heatingSample };
  }

  start() {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    void this.refresh();
  }

  private schedulePoll(minimumDelay = 0) {
    clearTimeout(this.pollTimer);
    if (!this.running || this.stopped || this.authorizationFailed) {
      return;
    }
    // One-shot scheduling rechecks the monotonic cooldown if Node fires a timer early.
    // A delayed timer produces a single request, never a catch-up burst.
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.refresh();
    }, Math.max(1, minimumDelay, Math.ceil(this.nextAttempt - performance.now())));
    this.pollTimer.unref();
  }

  stop() {
    this.stopped = true;
    this.running = false;
    clearTimeout(this.pollTimer);
    clearTimeout(this.expiryTimer);
  }

  refresh(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.stopped || this.authorizationFailed) {
      return Promise.resolve();
    }
    if (performance.now() < this.nextAttempt) {
      this.schedulePoll();
      return Promise.resolve();
    }
    if (!this.online()) {
      this.schedulePoll(this.options.pollIntervalSeconds * 1000);
      return Promise.resolve();
    }
    this.nextAttempt = performance.now() + this.options.pollIntervalSeconds * 1000;
    this.inFlight = this.retrieve().finally(() => {
      this.inFlight = undefined;
      this.schedulePoll();
    });
    return this.inFlight;
  }

  private async retrieve() {
    let failure: ShadowReadError['kind'] | 'data' | undefined;
    try {
      const result = await this.read();
      if (this.stopped) {
        return;
      }
      // A successful but malformed response invalidates the old measurement immediately.
      let sample: ParsedSample | undefined;
      try {
        sample = parseSample(result, Date.now(), unit => {
          if (this.unitHighWater && (unit.unitTime < this.unitHighWater.unitTime
            || (unit.unitTime === this.unitHighWater.unitTime && unit.fahrenheit !== this.unitHighWater.fahrenheit))) {
            throw new Error('Regressing or conflicting unit report');
          }
          this.unitHighWater = unit;
        });
        if (this.highWater && (sample.unitTime < this.highWater.unitTime
          || (sample.unitTime === this.highWater.unitTime && sample.fahrenheit !== this.highWater.fahrenheit)
          || sample.measuredAt < this.highWater.measuredAt
          || (sample.measuredAt === this.highWater.measuredAt
            && (sample.raw !== this.highWater.raw || sample.fahrenheit !== this.highWater.fahrenheit)))) {
          throw new Error('Regressing or conflicting floor sample');
        }
      } catch {
        sample = undefined;
      }
      this.sample = sample;
      if (sample) {
        this.highWater = sample;
        this.retrievedAt = performance.now();
      }
      try {
        this.heatingSample = parseHeating(result, Date.now(), report => {
          this.relayHighWater = this.acceptBoolean(report, this.relayHighWater);
        }, report => {
          this.powerHighWater = this.acceptBoolean(report, this.powerHighWater);
        });
        this.heatingRetrievedAt = performance.now();
      } catch {
        this.heatingSample = undefined;
      }
      if (!this.sample || !this.heatingSample) {
        failure = 'data';
      }
    } catch (error) {
      failure = error instanceof ShadowReadError ? error.kind : 'transport';
      if (error instanceof ShadowReadError) {
        if (error.kind === 'authorization') {
          this.authorizationFailed = true;
          this.sample = undefined;
          this.heatingSample = undefined;
          clearTimeout(this.pollTimer);
        } else if (error.kind === 'rate-limit') {
          this.nextAttempt = Math.max(this.nextAttempt, performance.now() + error.retryAfterSeconds * 1000);
        }
      }
      // Transport/session failures keep a last validated sample only until its configured expiry.
    } finally {
      if (!this.stopped) {
        this.reportFailure(failure);
        this.scheduleExpiry();
        this.changed();
      }
    }
  }

  private reportFailure(failure?: ShadowReadError['kind'] | 'data') {
    if (failure === this.failure) {
      return;
    }
    if (failure) {
      // Log only a fixed category, never the exception, response body or authentication material.
      this.log?.warn('ET-72GW cloud measurement refresh failed (%s).', failure);
    } else if (this.failure) {
      this.log?.info('ET-72GW cloud measurement refresh recovered.');
    }
    this.failure = failure;
  }

  private acceptBoolean(report: BooleanReport, previous?: BooleanReport) {
    if (previous && (report.time < previous.time || (report.time === previous.time && report.value !== previous.value))) {
      throw new Error('Regressing or conflicting boolean report');
    }
    return report;
  }

  private scheduleExpiry() {
    clearTimeout(this.expiryTimer);
    const remaining: number[] = [];
    if (this.currentFloor() && this.sample) {
      remaining.push(this.options.maxCacheAgeSeconds * 1000 - (performance.now() - this.retrievedAt));
      if (this.options.maxReportAgeSeconds > 0) {
        remaining.push(this.options.maxReportAgeSeconds * 1000 - (Date.now() - this.sample.measuredAt));
      }
    }
    if (this.currentHeating() && this.heatingSample) {
      remaining.push(this.options.maxCacheAgeSeconds * 1000 - (performance.now() - this.heatingRetrievedAt));
      if ((this.options.maxHeatingReportAgeSeconds ?? 0) > 0) {
        remaining.push(this.options.maxHeatingReportAgeSeconds! * 1000 - (Date.now() - this.heatingSample.measuredAt));
      }
    }
    if (remaining.length === 0) {
      return;
    }
    this.expiryTimer = setTimeout(() => {
      this.changed();
      this.scheduleExpiry();
    }, Math.max(1, Math.ceil(Math.min(...remaining))));
    this.expiryTimer.unref();
  }
}
