/* eslint-disable @typescript-eslint/no-explicit-any */

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

export class PrefixLogger implements ExLogger {
  constructor(
    public log: Logger,
    public prefix: string,
    public debugMode = false,
  ) {
    this.debugMode = this.debugMode || process.argv.includes('-D') || process.argv.includes('--debug');
  }

  debug(message?: any, ...args: any[]) {
    if (this.debugMode) {
      this.log.info((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    } else {
      this.log.debug((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    }
  }

  info(message?: any, ...args: any[]) {
    this.log.info((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
  }

  warn(message?: any, ...args: any[]) {
    this.log.warn((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
  }

  error(message?: any, ...args: any[]) {
    this.log.error((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
  }

  success(message?: any, ...args: any[]) {
    if (isExLogger(this.log)) {
      this.log.success((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    } else {
      this.log.info((this.prefix ? `[${this.prefix}] ` : '') + message, ...args);
    }
  }

}
