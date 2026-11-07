/* eslint-disable @typescript-eslint/no-explicit-any */

import util from 'util';
import { redactSensitive } from './util';

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
    message = this.maskingValue(message);
    args = args.map(arg => this.maskingValue(arg));
    if (this.debugMode) {
      this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    } else {
      this.log.debug(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    }
  }

  info(message?: any, ...args: any[]) {
    message = this.maskingValue(message);
    args = args.map(arg => this.maskingValue(arg));
    this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  warn(message?: any, ...args: any[]) {
    message = this.maskingValue(message);
    args = args.map(arg => this.maskingValue(arg));
    this.log.warn(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  error(message?: any, ...args: any[]) {
    message = this.maskingValue(message);
    args = args.map(arg => this.maskingValue(arg));
    this.log.error(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
  }

  success(message?: any, ...args: any[]) {
    message = this.maskingValue(message);
    args = args.map(arg => this.maskingValue(arg));
    if (isExLogger(this.log)) {
      this.log.success(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    } else {
      this.log.info(util.format(`[%s] ${typeof message === 'string' ? '%s' : '%O'}`, this.prefix, message), ...args);
    }
  }

  private maskingValue(value: any) {
    return this.mask ? redactSensitive(value) : value;
  }
}
