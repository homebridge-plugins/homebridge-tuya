import { jest } from '@jest/globals';
import https from 'https';
import { EventEmitter } from 'events';
import TuyaOpenAPI, { ShadowReadError } from '../src/core/TuyaOpenAPI';
import { initLogger } from '../src/util/Logger';

// Every transport is intercepted before invoking the client. This suite cannot reach Tuya.
describe('bounded current-session shadow GET', () => {
  let api: TuyaOpenAPI;
  let request: any;
  let req: any;
  let res: any;
  let reply: () => void;
  const logs = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  beforeEach(() => {
    jest.useFakeTimers({ now: 1800000000000 });
    initLogger(logs);
    api = new TuyaOpenAPI(TuyaOpenAPI.Endpoints.AMERICA, 'dummy-client', 'dummy-secret', 'en', true);
    api.tokenInfo = { access_token: 'dummy-token', refresh_token: 'dummy-refresh', uid: 'dummy-user', expire: Date.now() + 3600000 };
    req = new EventEmitter(); req.destroy = jest.fn();
    res = new EventEmitter(); res.statusCode = 200; res.headers = {}; res.destroy = jest.fn();
    reply = () => { res.emit('data', Buffer.from(JSON.stringify({ success: true, result: { properties: [] } }))); res.emit('end'); };
    request = jest.spyOn(https, 'request').mockImplementation(((_options: any, callback: any) => {
      req.end = jest.fn(() => { callback(res); reply(); });
      return req;
    }) as any);
    jest.spyOn(api, 'request').mockRejectedValue(new Error('Forbidden normal request'));
    jest.spyOn(api, 'homeLogin').mockRejectedValue(new Error('Forbidden login'));
    jest.spyOn(api, 'getToken').mockRejectedValue(new Error('Forbidden token'));
    jest.spyOn(api, '_refreshAccessTokenIfNeed').mockRejectedValue(new Error('Forbidden refresh'));
    Object.values(logs).forEach(log => log.mockClear());
  });
  afterEach(() => {
    expect(api.request).not.toHaveBeenCalled();
    expect(api.homeLogin).not.toHaveBeenCalled();
    expect(api.getToken).not.toHaveBeenCalled();
    expect(api._refreshAccessTokenIfNeed).not.toHaveBeenCalled();
    Object.values(logs).forEach(log => expect(log).not.toHaveBeenCalled());
    jest.restoreAllMocks(); jest.useRealTimers();
  });

  test('signs exactly one GET for the selected device with the existing token', async () => {
    await expect(api.getDeviceShadow('configured-device')).resolves.toEqual({ properties: [] });
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0][0];
    expect(options).toMatchObject({ method: 'GET', path: '/v2.0/cloud/thing/configured-device/shadow/properties', hostname: 'openapi.tuyaus.com' });
    const { sign, ...headers } = options.headers;
    expect(sign).toMatch(/^[A-F0-9]{64}$/);
    expect(headers.access_token).toBe('dummy-token');
    expect(api.tokenInfo.refresh_token).toBe('dummy-refresh');
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['missing', 'expired', 'near-expiry'])('rejects a %s token without any network', async mode => {
    if (mode === 'missing') { api.tokenInfo.access_token = ''; }
    else { api.tokenInfo.expire = Date.now() + (mode === 'expired' ? -1 : 60000); }
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'session' });
    expect(request).not.toHaveBeenCalled();
  });

  test('rejects path injection before network', async () => {
    await expect(api.getDeviceShadow('../token')).rejects.toBeInstanceOf(ShadowReadError);
    expect(request).not.toHaveBeenCalled();
  });

  test.each([401, 403])('treats HTTP %s as authorization failure', async code => {
    res.statusCode = code;
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'authorization' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('handles response errors during rejected-status teardown without losing the authorization result', async () => {
    res.statusCode = 403;
    res.destroy = jest.fn(() => res.emit('error', new Error('private response details')));
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'authorization' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test.each([1004, 1010, 1100, '1106', 1114, 28841101, 28841002])('treats Tuya %s as authorization failure', async code => {
    reply = () => { res.emit('data', Buffer.from(JSON.stringify({ success: false, code }))); res.emit('end'); };
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'authorization' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test.each([302, 500])('does not follow or retry HTTP %s', async code => {
    res.statusCode = code; res.headers.location = 'https://example.invalid';
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'response' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test.each(['1200', 'garbage', '99999999999999999999999', new Date(1800000000000 + 1200000).toUTCString()])(
    'bounds Retry-After %s', async retry => {
      res.statusCode = 429; res.headers['retry-after'] = retry;
      await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({
        kind: 'rate-limit', retryAfterSeconds: retry === 'garbage' ? 0 : retry.startsWith('999') ? 86400 : 1200,
      });
    });

  test.each(['malformed', 'oversized', 'api-error'])('rejects %s payload without retries', async mode => {
    reply = () => {
      res.emit('data', Buffer.from(mode === 'oversized' ? 'x'.repeat(262145) : mode === 'malformed' ? '{' : '{"success":false,"code":999}'));
      res.emit('end');
    };
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'response' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('total deadline terminates a silent request at ten seconds, without a retry', async () => {
    reply = () => {};
    const pending = expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ kind: 'transport' });
    await jest.advanceTimersByTimeAsync(9999);
    expect(req.destroy).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(req.destroy).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['request-error', 'response-error', 'aborted'])('sanitizes %s and does not retry', async mode => {
    reply = () => {
      if (mode === 'request-error') { req.emit('error', new Error('sensitive transport details')); }
      else { res.emit(mode === 'aborted' ? 'aborted' : 'error', new Error('sensitive response details')); }
    };
    await expect(api.getDeviceShadow('configured-device')).rejects.toMatchObject({ message: 'Shadow read failed: transport' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
