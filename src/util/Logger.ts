/* eslint-disable @typescript-eslint/no-explicit-any */

import util from 'util';
import cloneDeep from 'lodash/cloneDeep';

export default interface Logger {
  info(message?: any, ...args: any[]): void;
  warn(message?: any, ...args: any[]): void;
  debug(message?: any, ...args: any[]): void;
  error(message?: any, ...args: any[]): void;
}
export interface ExLogger extends Logger {
  success(message?: any, ...args: any[]): void;
}

function isExLogger(obj: any): obj is ExLogger {
  return typeof obj.success === 'function';
}

let _logger: Logger;
export const logger = () => _logger ?? console;
export const initLogger = (logger: Logger) => _logger = logger;

export class PrefixLogger implements ExLogger {
  constructor(
    public log: Logger,
    public prefix: string = '',
    public debugMode = false,
    // Masking must NOT be tied to debugMode: debug is exactly when payloads
    // (login bodies, access tokens, smart lock ticket keys) reach the log.
    private mask = true,
  ) {
    this.debugMode = this.debugMode || process.argv.includes('-D') || process.argv.includes('--debug');
  }

  debug(message?: any, ...args: any[]) {
    message = typeof message === 'string' ? this.masking(message) : this.maskingValue(message);
    args = args?.map(arg => typeof arg === 'string' ? this.masking(arg) : arg);
    if (this.debugMode) {
      this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    } else {
      this.log.debug(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    }
  }

  info(message?: any, ...args: any[]) {
    message = typeof message === 'string' ? this.masking(message) : this.maskingValue(message);
    args = args?.map(arg => typeof arg === 'string' ? this.masking(arg) : arg);
    this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  warn(message?: any, ...args: any[]) {
    message = typeof message === 'string' ? this.masking(message) : this.maskingValue(message);
    args = args?.map(arg => typeof arg === 'string' ? this.masking(arg) : arg);
    this.log.warn(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  error(message?: any, ...args: any[]) {
    message = typeof message === 'string' ? this.masking(message) : this.maskingValue(message);
    args = args?.map(arg => typeof arg === 'string' ? this.masking(arg) : arg);
    this.log.error(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  success(message?: any, ...args: any[]) {
    message = typeof message === 'string' ? this.masking(message) : this.maskingValue(message);
    args = args?.map(arg => typeof arg === 'string' ? this.masking(arg) : this.maskingValue(arg));
    if (isExLogger(this.log)) {
      this.log.success(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    } else {
      this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    }
  }

  private masking(str: string) : string {
    if (!this.mask || typeof str !== 'string') {
      return str;
    }
    // NOTE: a /g regex carries `lastIndex` across calls, so the previous
    // `.some(s => re.test(s))` pre-check alternated true/false and let secrets
    // through. `String.replace` resets `lastIndex` itself, so just replace.
    const KEYS = 'password|token|access_?token|refresh_?token|accessKey|access_?key'
      + '|tuyaKey|api_?key|secret|ticket_key|ticket_id|sign';
    const regex_single = new RegExp(`'(${KEYS})'\\s*:\\s*'[^']*'`, 'gi');
    const regex_double = new RegExp(`"(${KEYS})"\\s*:\\s*"[^"]*"`, 'gi');
    return str
      .replace(regex_single, '\'$1\': \'********\'')
      .replace(regex_double, '"$1": "********"');
  }

  private maskingValue(obj: any) {
    if (!this.mask) {
      return obj;
    }
    const cloneObj = cloneDeep(obj);
    const regex = /(password|token|access_?token|refresh_?token|accessKey|access_?key|tuyakey|api_?key|secret|ticket_key|ticket_id|sign)/i;
    for (const key in cloneObj) {
      const value = cloneObj[key];
      if (typeof value === 'function') {
        continue;
      }
      if (typeof value === 'string') {
        if (!regex.test(key)) {
          continue;
        }
        cloneObj[key] = '*'.repeat(value.length);
      } else {
        cloneObj[key] = this.maskingValue(value);
      }
    }
    return cloneObj;
  }
}