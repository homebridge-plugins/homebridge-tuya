import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { ChildProcessWithoutNullStreams } from 'child_process';
import childProcess from 'child_process';
import util from 'util';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { FfmpegStreamingProcess } from '../src/util/FfmpegStreamingProcess';
import { PrefixLogger } from '../src/util/Logger';
import { formatRedactedCommand } from '../src/util/util';
import { TuyaStreamingDelegate } from '../src/util/TuyaStreamDelegate';

const rtsp = 'rtsp://camera-user:rtsp-password-canary@camera.example/private-path-canary?opaque=opaque-canary';
const srtp = 'srtp-encryption-key-canary';

afterEach(() => { jest.restoreAllMocks(); });

describe('camera diagnostic redaction', () => {
  test.each([false, true])('sanitizes stream command logs while executing original arguments (debug=%s)', debug => {
    const process = new EventEmitter() as ChildProcessWithoutNullStreams;
    process.stdin = new PassThrough();
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();
    const spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(process);
    const lines: string[] = [];
    const record = (...args: unknown[]) => { lines.push(util.format(...args)); };
    const log = new PrefixLogger({ debug: record, info: record, warn: record, error: record }, 'camera', debug);
    const args = ['-i', rtsp, '-srtp_out_params', srtp, '-f', 'rtp', 'srtp://controller:1234'];
    new FfmpegStreamingProcess('test', 'ffmpeg', args, log, { stopStream: jest.fn(), forceStopStream: jest.fn() });
    expect(spawn).toHaveBeenCalledWith('ffmpeg', args, { env: global.process.env });
    expect(lines.join('\n')).not.toContain('rtsp-password-canary');
    expect(lines.join('\n')).not.toContain('private-path-canary');
    expect(lines.join('\n')).not.toContain('opaque-canary');
    expect(lines.join('\n')).not.toContain(srtp);
    expect(lines.join('\n')).toContain('-srtp_out_params');
    expect(args[1]).toBe(rtsp);
    expect(args[3]).toBe(srtp);
    (process.stderr as PassThrough).write(`[error] option failed: ${srtp} ${rtsp}\n`);
    expect(lines.join('\n')).not.toContain(srtp);
    expect(lines.join('\n')).not.toContain('rtsp-password-canary');
    (process.stderr as PassThrough).end();
  });

  test('snapshot command logging uses the same protected formatter', async () => {
    const process = new EventEmitter() as ChildProcessWithoutNullStreams;
    process.stdin = new PassThrough();
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();
    const spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(process);
    const lines: string[] = [];
    const record = (...args: unknown[]) => { lines.push(util.format(...args)); };
    const delegate = Object.assign(Object.create(TuyaStreamingDelegate.prototype), {
      log: new PrefixLogger({ debug: record, info: record, warn: record, error: record }, 'camera', true),
      camera: { device: { online: true }, deviceManager: { retrieveDeviceRTSP: async () => rtsp } },
    }) as { fetchSnapshot(width: number, height: number): Promise<Buffer> };
    const snapshot = delegate.fetchSnapshot(640, 480);
    await Promise.resolve();
    expect(spawn).toHaveBeenCalled();
    (process.stdout as PassThrough).write(Buffer.from('image'));
    process.emit('close');
    expect(await snapshot).toEqual(Buffer.from('image'));
    expect(lines.join('\n')).toContain('Running Snapshot command');
    expect(lines.join('\n')).not.toContain('canary');
    expect(spawn.mock.calls[0][1]).toContain(rtsp);
  });

  test('the same formatter protects snapshot URLs and inline SRTP parameters', () => {
    const args = ['-i', rtsp, `-srtp_in_params=${srtp}`, '-vframes:v', '1'];
    const output = formatRedactedCommand('ffmpeg', args);
    expect(output).not.toContain(srtp);
    expect(output).not.toContain('canary');
    expect(output).toContain('-vframes:v');
    expect(output).toContain('"1"');
  });
});
