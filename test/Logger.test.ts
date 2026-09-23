import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { EOL } from 'os';
import Logger, { initLogger, logger, PrefixLogger } from '../src/shared/util/Logger';

describe('Logger', () => {
  const output:string[] = [];
  let spyStdout;
  let spyStderr;
  beforeEach(() => {
    output.splice(0, output.length);
    spyStdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((value) => {
        const str = String(value);
        if (str.startsWith('  ')) {
          output.push(str.split(/\r\n|\r|\n/)[1].replace(/^    /, ''));
        }
        return true;
      });
    spyStderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((value) => {
        const str = String(value);
        if (str.startsWith('  ')) {
          output.push(str.split(/\r\n|\r|\n/)[1].replace(/^    /, ''));
        }
        return true;
      });
    jest.clearAllMocks();
  });

  describe('info log', () => {
    test('string message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info('info');
      expect(spyInfo).toHaveBeenCalledWith('[test] info');
    });

    test('number message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info(1);
      expect(spyInfo).toHaveBeenCalledWith('[test] 1');
    });

    test('object message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info({ info: 'message'});
      expect(spyInfo).toHaveBeenCalledWith('[test] { info: \'message\' }');
    });

    test('array message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info(['a', 'b', 'c']);
      expect(spyInfo).toHaveBeenCalledWith('[test] [ \'a\', \'b\', \'c\' ]');
    });

    test('message with arguments', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spyInfo).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });
  });

  describe('success log', () => {
    test('success method unavailable', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.success('successed');
      expect(spyInfo).toHaveBeenCalledWith('[test] successed');
    });

    test('success method available', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spySuccess = jest.spyOn(mockLog as any, 'success');
      instance.success('successed');
      expect(spySuccess).toHaveBeenCalledWith('[test] successed');
    });

    test('number message, success method unavailable', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.success(1);
      expect(spyInfo).toHaveBeenCalledWith('[test] 1');
    });

    test('number message. success method available', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spySuccess = jest.spyOn(mockLog as any, 'success');
      instance.success(1);
      expect(spySuccess).toHaveBeenCalledWith('[test] 1');
    });

    test('message with arguments(success method unavailable)', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.success('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spyInfo).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });

    test('message with arguments(success method available)', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spySuccess = jest.spyOn(mockLog as any, 'success');
      instance.success('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spySuccess).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });
  });

  describe('debug log', () => {
    test('debugMode disabled', () => {
      const instance = new PrefixLogger(console, 'test', false);
      const spyInfo = jest.spyOn(console, 'info');
      const spyDebug = jest.spyOn(console, 'debug');
      instance.debug('debug');
      expect(spyInfo).toHaveBeenCalledTimes(0);
      expect(spyDebug).toHaveBeenCalledWith('[test] debug');
    });

    test('debugMode enabled. (string)', () => {
      const instance = new PrefixLogger(console, 'test', true);
      const spyInfo = jest.spyOn(console, 'info');
      const spyDebug = jest.spyOn(console, 'debug');
      instance.debug('debug');
      expect(spyInfo).toHaveBeenCalledTimes(1);
      expect(spyDebug).toHaveBeenCalledTimes(0);
      expect(spyInfo).toHaveBeenCalledWith('[test] debug');
    });

    test('debugMode enabled. (non-string)', () => {
      const instance = new PrefixLogger(console, 'test', true);
      const spyInfo = jest.spyOn(console, 'info');
      const spyDebug = jest.spyOn(console, 'debug');
      instance.debug({ debug: 'enabled' });
      expect(spyInfo).toHaveBeenCalledTimes(1);
      expect(spyDebug).toHaveBeenCalledTimes(0);
      expect(spyInfo).toHaveBeenCalledWith('[test] { debug: \'enabled\' }');
    });

    test('number message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyDebug = jest.spyOn(mockLog, 'debug');
      instance.debug(1);
      expect(spyDebug).toHaveBeenCalledWith('[test] 1');
    });

    test('message with arguments', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyDebug = jest.spyOn(mockLog as any, 'debug');
      instance.debug('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spyDebug).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });
  });

  describe('warn log', () => {
    test('string message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyWarn = jest.spyOn(mockLog, 'warn');
      instance.warn('warn');
      expect(spyWarn).toHaveBeenCalledWith('[test] warn');
    });

    test('number message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyWarn = jest.spyOn(mockLog, 'warn');
      instance.warn(1);
      expect(spyWarn).toHaveBeenCalledWith('[test] 1');
    });

    test('message with arguments', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyWarn = jest.spyOn(mockLog as any, 'warn');
      instance.warn('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spyWarn).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });
  });

  describe('error log', () => {
    test('string message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyError = jest.spyOn(mockLog, 'error');
      instance.error('error');
      expect(spyError).toHaveBeenCalledWith('[test] error');
    });

    test('number message', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyError = jest.spyOn(mockLog, 'error');
      instance.error(1);
      expect(spyError).toHaveBeenCalledWith('[test] 1');
    });

    test('message with arguments', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test', false);
      const spyError = jest.spyOn(mockLog as any, 'error');
      instance.error('with arguments %s, %o', 'args', { arg: 'object' });
      expect(spyError).toHaveBeenCalledWith("[test] with arguments %s, %o", "args", {"arg": "object"});
    });
  });

  describe('init logger', () => {
    test('before initLogger', () => {
      expect(logger()).toBe(console);
    });

    test('after initLogger', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      initLogger(mockLog);
      expect(logger()).toBe(mockLog);
    });
    
    test('undefined prefix', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, undefined, false);
      const spyInfo = jest.spyOn(mockLog, 'info');
      instance.info('noprefix');
      expect(spyInfo).toHaveBeenCalledWith('[] noprefix');
    });
    
    test('undefined debugMode', () => {
      const mockLog = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      } as Logger;
      const instance = new PrefixLogger(mockLog, 'test');
      expect(instance.debugMode).toBe(false);
    });
  });
  
  describe('masking()', () => {
    test('Return as-is when masking is OFF (string)', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', true);
      const input = `'password': 'abc'`;
      expect((instance as any).masking(input)).toBe(input);
    });

    test('Return as-is when masking is OFF (object)', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', true);
      const input = { password: 'abc' };
      expect((instance as any).masking(input)).toBe(input);
    });

    test('Mask the password', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = `'password': 'abc'`;
      const output = `'password': '********'`;
      expect((instance as any).masking(input)).toBe(output);
    });

    test('Mask the token', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = `'token' : 'abcdef'`;
      const output = `'token': '********'`;
      expect((instance as any).masking(input)).toBe(output);
    });

    test('Mask the password in line', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = `abc 'password': 'abc' def`;
      const output = `abc 'password': '********' def`;
      expect((instance as any).masking(input)).toBe(output);
    });

    test('Two maskable targets within the string.', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = `'password': 'abc', 'password': 'def'`;
      const output = `'password': '********', 'password': '********'`;
      expect((instance as any).masking(input)).toBe(output);
    });

    test('Mask only the target lines in multi-line text', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = [
        `normal line`,
        `'password' : '123456'`,
        `another line`,
        `'apiKey': 'xyz'`
      ].join('\n');

      const expected = [
        `normal line`,
        `'password': '********'`,
        `another line`,
        `'apiKey': '********'`
      ].join(EOL);
      expect((instance as any).masking(input)).toBe(expected);
    });

    test('Leave unmatched strings unchanged', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = `no sensitive data here`;
      expect((instance as any).masking(input)).toBe(input);
    });

    test('Leave unmatched objects unchanged', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = { test: 'unchanged' };
      expect((instance as any).masking(input)).toBe(input);
    });
  });

  describe('maskingValue()', () => {
    test('Mask object value', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', false);
      const input = {
        id: 'testID',
        password: 'testPassword',
        token: 'testToken',
        accessToken: 'testAccessToken',
        Access_Token: 'testAccess_Token',
        aCcEsSkEy: 'testAccessKey',
        tuyakey: 'testTuyaKey',
        api_key: 'testApiKey',
        secret: 'testSecret',
        name: 'testName',
        obj: {
          password: 'test-objpassword'
        },
        func: () => 'test'
      };

      const expected = {
        id: 'testID',
        password: '************',
        token: '*********',
        accessToken: '***************',
        Access_Token: '****************',
        aCcEsSkEy: '*************',
        tuyakey: '***********',
        api_key: '**********',
        secret: '**********',
        name: 'testName',
        obj: {
          password: '****************'
        },
        func: input.func
      };
      expect((instance as any).maskingValue(input)).toEqual(expected);
    });

    test('Leave matched objects unchanged', () => {
      const instance = new PrefixLogger(console as unknown as Logger, 'test', true);
      const input = { password: 'test' };
      expect((instance as any).maskingValue(input)).toBe(input);
    });
  });
});