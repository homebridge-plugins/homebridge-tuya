import https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import TuyaOpenAPI from '../../src/core/TuyaOpenAPI';
import TuyaDeviceManager from '../../src/device/TuyaDeviceManager';
import { initLogger } from '../../src/util/Logger';

describe('smart-lock command transport safety', () => {
  beforeEach(() => {
    initLogger({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setup = () => {
    const api = new TuyaOpenAPI('https://example.invalid', 'test-id', 'test-key');
    api.tokenInfo = { access_token: 'test-token', refresh_token: '', uid: 'test', expire: Date.now() + 600000 };
    return { api, manager: new TuyaDeviceManager(api) };
  };

  test('a command superseded during token refresh never reaches the HTTPS transport', async () => {
    const { api, manager } = setup();
    let finishRefresh!: () => void;
    jest.spyOn(api, '_refreshAccessTokenIfNeed').mockImplementation(() => new Promise<void>(resolve => {
      finishRefresh = resolve;
    }));
    const transport = jest.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('A cancelled lock command must not be dispatched');
    });
    let current = true;

    const operation = manager.sendLockCommands('lock-id', 'ticket-id', true, () => current);
    current = false;
    finishRefresh();

    const result = await operation;
    expect(result.success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  test('an ambiguous network failure never transparently repeats a door operation', async () => {
    const { manager } = setup();
    const transport = jest.spyOn(https, 'request').mockImplementation((() => {
      const request = new EventEmitter() as ClientRequest;
      request.write = jest.fn(() => true) as typeof request.write;
      request.end = (() => {
        // The server might already have acted on the first request. Retrying
        // this network failure could repeat an unlock after a later lock.
        request.emit('error', new Error('Connection reset after sending'));
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof https.request);

    await expect(manager.sendLockCommands('lock-id', 'ticket-id', true, () => true))
      .rejects.toThrow('Connection reset after sending');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('a current request preserves the intended door-operation payload', async () => {
    const { manager } = setup();
    let path: https.RequestOptions['path'];
    let body = '';
    const response = { success: true, result: true, t: 0, tid: 'test' };
    jest.spyOn(https, 'request').mockImplementation(((options: https.RequestOptions, callback) => {
      path = options.path;
      const request = new EventEmitter() as ClientRequest;
      request.write = ((chunk: string) => {
        body += chunk;
        return true;
      }) as typeof request.write;
      request.end = (() => {
        const incoming = new EventEmitter() as IncomingMessage;
        incoming.statusCode = 200;
        incoming.setEncoding = jest.fn() as typeof incoming.setEncoding;
        callback(incoming);
        incoming.emit('data', JSON.stringify(response));
        incoming.emit('end');
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof https.request);

    await expect(manager.sendLockCommands('lock-id', 'ticket-id', false, () => true)).resolves.toEqual(response);
    expect(path).toBe('/v1.0/smart-lock/devices/lock-id/password-free/door-operate');
    expect(JSON.parse(body)).toEqual({ device_id: 'lock-id', ticket_id: 'ticket-id', open: false });
  });
});
