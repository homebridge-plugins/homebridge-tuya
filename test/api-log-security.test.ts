import https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import { EventEmitter } from 'events';
import util from 'util';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { initLogger } from '../src/util/Logger';
import TuyaOpenAPI from '../src/core/TuyaOpenAPI';

const canaries = {
  refresh: 'api-refresh-path-canary',
  access: 'api-access-token-canary',
  password: 'api-password-canary',
  local: 'api-local-key-canary',
  query: 'api-query-secret-canary',
};

afterEach(() => { jest.restoreAllMocks(); });

function mockResponse(rawData: string, statusCode: number) {
  let options: https.RequestOptions;
  let sentBody = '';
  jest.spyOn(https, 'request').mockImplementation(((requestOptions: https.RequestOptions, callback) => {
    options = requestOptions;
    const request = new EventEmitter() as ClientRequest;
    request.write = ((chunk: string) => { sentBody += chunk; return true; }) as typeof request.write;
    request.end = (() => {
      const response = new EventEmitter() as IncomingMessage;
      response.statusCode = statusCode;
      response.statusMessage = statusCode === 200 ? 'OK' : 'Unauthorized';
      response.setEncoding = jest.fn() as typeof response.setEncoding;
      callback(response);
      response.emit('data', rawData);
      response.emit('end');
      return request;
    }) as typeof request.end;
    return request;
  }) as typeof https.request);
  return { get options() { return options; }, get sentBody() { return sentBody; } };
}

describe('Tuya API log redaction', () => {
  test.each([false, true])('redacts requests, responses and non-200 warnings (debug=%s)', async debug => {
    for (const status of [200, 401]) {
      const lines: string[] = [];
      const record = (...args: unknown[]) => { lines.push(util.format(...args)); };
      initLogger({ debug: record, info: record, warn: record, error: record });
      const response = { success: false, result: { local_key: canaries.local, nested: { localKey: canaries.local }, status: [{ code: 'password', value: canaries.password }] },
        code: status, msg: 'test', t: 0, tid: 'test' };
      const wire = mockResponse(JSON.stringify(response), status);
      const api = new TuyaOpenAPI('https://example.com', 'test-id', 'test-secret', 'en', debug);
      api.tokenInfo = { access_token: canaries.access, refresh_token: canaries.refresh, uid: 'test', expire: Date.now() + 600000 };
      const path = `/v1.0/token/${canaries.refresh}`;
      const body = { password: canaries.password, nested: { local_key: canaries.local }, target: 20 };
      expect(await api.request('post', path, { localKey: canaries.query }, body)).toEqual(response);
      for (const secret of Object.values(canaries)) {
        expect(lines.join('\n')).not.toContain(secret);
      }
      expect(lines.join('\n')).toContain('target');
      expect(wire.options.path).toContain(path);
      expect(wire.options.path).toContain(canaries.query);
      expect(wire.options.headers?.['access_token']).toBe(canaries.access);
      expect(wire.sentBody).toBe(JSON.stringify(body));
      if (status !== 200) {
        expect(lines.join('\n')).toContain('Status: 401 Unauthorized');
      }
      jest.restoreAllMocks();
    }
  });

  test('sanitizes invalid/long error bodies before truncation in warnings and debug output', async () => {
    const lines: string[] = [];
    const record = (...args: unknown[]) => { lines.push(util.format(...args)); };
    initLogger({ debug: record, info: record, warn: record, error: record });
    mockResponse(`invalid body {"local_key":"${canaries.local}${'x'.repeat(1000)}`, 502);
    const api = new TuyaOpenAPI('https://example.com', 'test-id', 'test-secret', 'en', true);
    const result = await api.get(`/v1.0/token/${canaries.refresh}`);
    expect(result.success).toBe(false);
    expect(lines.join('\n')).not.toContain(canaries.local);
    expect(lines.join('\n')).not.toContain(canaries.refresh);
    expect(lines.join('\n')).toContain('Status: 502 Unauthorized');
  });
});
