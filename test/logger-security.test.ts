import util from 'util';
import { describe, expect, jest, test } from '@jest/globals';
import { ExLogger, PrefixLogger } from '../src/util/Logger';
import { redactSensitive, redactSensitiveText } from '../src/util/util';

const secret = 'redaction-canary-local-device-key';

function recordingLogger() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => { lines.push(util.format(...args)); };
  const sink: ExLogger = { debug: record, info: record, warn: record, error: record, success: record };
  return { lines, sink };
}

describe('credential redaction at the log sink', () => {
  test.each([false, true])('redacts first and trailing arguments at every level (debug=%s)', debug => {
    const { lines, sink } = recordingLogger();
    const log = new PrefixLogger(sink, 'security', debug);
    for (const level of ['debug', 'info', 'warn', 'error', 'success'] as const) {
      log[level]({ nested: [{ local_key: secret, localKey: secret, 'local-key': secret }], target: 20 },
        { deep: { password: secret, refreshToken: secret } },
        JSON.stringify({ local_key: secret, accessKey: secret }),
        `/v1.0/token/${secret}?grant_type=1`);
    }
    expect(lines).toHaveLength(5);
    expect(lines.join('\n')).not.toContain(secret);
    expect(lines.join('\n')).toContain('target: 20');
  });

  test('does not mutate payloads and preserves ordinary formatting', () => {
    const { lines, sink } = recordingLogger();
    const log = new PrefixLogger(sink, 'Thermostat');
    const payload = { local_key: secret, room: 'Kitchen' };
    log.info('Target = %s, state = %j', 20, payload);
    expect(lines[0]).toContain('[Thermostat] Target = 20, state =');
    expect(lines[0]).toContain('Kitchen');
    expect(lines[0]).not.toContain(secret);
    expect(payload.local_key).toBe(secret);
  });

  test('handles cycles, Error causes, buffers, depth limits and custom inspection without exposing originals', () => {
    const { lines, sink } = recordingLogger();
    const log = new PrefixLogger(sink, 'security');
    const getter = jest.fn(() => secret);
    const payload: Record<string, unknown> = { local_key: secret, binary: Buffer.from(secret) };
    payload.self = payload;
    Object.defineProperty(payload, 'computed', { get: getter, enumerable: true });
    payload[util.inspect.custom as unknown as string] = () => secret;
    const error = new Error(`Request /v1.0/token/${secret} failed`, { cause: payload });
    let deep: Record<string, unknown> = { local_key: secret };
    for (let i = 0; i < 30; i++) {
      deep = { nested: deep };
    }
    expect(() => log.error('Failure: %O', error, payload, deep)).not.toThrow();
    expect(lines[0]).not.toContain(secret);
    expect(lines[0]).toContain('[Circular]');
    expect(lines[0]).toContain('[Binary data]');
    expect(getter).not.toHaveBeenCalled();
    expect(payload.self).toBe(payload);
  });

  test.each([
    `{"local_key":"${secret}"}`,
    `{"LOCALKEY":"${secret}"}`,
    `{'local-key': '${secret}'}`,
    `{"local_key":"${secret}`,
    JSON.stringify({ message: JSON.stringify({ local_key: secret }) }),
    `https://api.example/v1.0/token/${secret}?grant_type=1`,
    `https://api.example/devices?refresh_token=${secret}&page=1`,
    `https://user:${secret}@example.com/stream`,
    `rtsp://camera/${secret}?opaque=${secret}`,
    `Authorization: Bearer ${secret}`,
    `-srtp_out_params "${secret}"`,
    JSON.stringify({ token: { unlabelled: secret } }),
    '{"local\\u005fkey":"' + secret + '"}',
  ])('redacts preformatted credential data: %s', input => {
    expect(redactSensitiveText(input)).not.toContain(secret);
  });

  test.each(['password', 'access_token', 'local_key', 'unlock_password'])('redacts Tuya code/value pairs: %s', code => {
    const { lines, sink } = recordingLogger();
    const log = new PrefixLogger(sink, 'security', true);
    const payload = { commands: [{ code, value: secret }, { code: 'temp_set', value: 200 }] };
    log.debug('Commands: %O', payload, JSON.stringify(payload));
    expect(lines.join('\n')).not.toContain(secret);
    expect(lines.join('\n')).toContain('200');
    expect(payload.commands[0].value).toBe(secret);
  });

  test('redacts sensitive non-string values and collection values', () => {
    expect(redactSensitive({ token: { unlabelled: secret }, localKey: Buffer.from(secret), target: 20 }))
      .toEqual({ token: '***', localKey: '***', target: 20 });
    expect(util.inspect(redactSensitive(new Map([['local_key', secret]])))).not.toContain(secret);
    expect(redactSensitive({ local_key: 123456 })).toEqual({ local_key: '***' });
    expect(redactSensitive(null)).toBeNull();
  });
});
