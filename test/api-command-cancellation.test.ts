import https from 'https';
import { ClientRequest } from 'http';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import TuyaOpenAPI from '../src/core/TuyaOpenAPI';
import { initLogger } from '../src/util/Logger';

afterEach(() => { jest.restoreAllMocks(); });

function api() {
  const record = jest.fn();
  initLogger({ info: record, warn: record, debug: record, error: record });
  return new TuyaOpenAPI('https://example.com', 'test-id', 'test-secret');
}

function failingTransport(onSend = () => {}) {
  return jest.spyOn(https, 'request').mockImplementation((() => {
    const request = new EventEmitter() as ClientRequest;
    request.write = jest.fn() as typeof request.write;
    request.end = (() => {
      onSend();
      request.emit('error', new Error('ambiguous transport failure'));
      return request;
    }) as typeof request.end;
    return request;
  }) as typeof https.request);
}

describe('physical command cancellation at HTTP dispatch', () => {
  test('a superseded command never enters refresh or transport', async () => {
    const client = api();
    const refresh = jest.spyOn(client, '_refreshAccessTokenIfNeed');
    const transport = failingTransport();
    expect(await client.post('/commands', {}, { shouldProceed: () => false })).toMatchObject({ success: false, code: -1 });
    expect(refresh).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  test('invalidation during token refresh prevents the command dispatch', async () => {
    const client = api();
    let finishRefresh!: () => void;
    let active = true;
    jest.spyOn(client, '_refreshAccessTokenIfNeed').mockImplementation(() => new Promise<void>(resolve => { finishRefresh = resolve; }));
    const transport = failingTransport();
    const command = client.post('/commands', {}, { shouldProceed: () => active, attempts: 1 });
    active = false;
    finishRefresh();
    expect(await command).toMatchObject({ success: false, code: -1 });
    expect(transport).not.toHaveBeenCalled();
  });

  test('validity is checked immediately before https.request as well as after refresh', async () => {
    const client = api();
    const transport = failingTransport();
    const shouldProceed = jest.fn<() => boolean>().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(await client.post('/commands', {}, { shouldProceed, attempts: 1 })).toMatchObject({ success: false, code: -1 });
    expect(shouldProceed).toHaveBeenCalledTimes(3);
    expect(transport).not.toHaveBeenCalled();
  });

  test('attempts:1 never retries an ambiguous mutating request failure', async () => {
    const client = api();
    const transport = failingTransport();
    await expect(client.post('/commands', {}, { shouldProceed: () => true, attempts: 1 }))
      .rejects.toThrow('ambiguous transport failure');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('an invalidated command cannot dispatch a later API transport retry', async () => {
    const client = api();
    let active = true;
    const transport = failingTransport(() => { active = false; });
    expect(await client.post('/commands', {}, { shouldProceed: () => active }))
      .toMatchObject({ success: false, code: -1 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
