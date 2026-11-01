import { ProtocolV31V32 } from '../src/local/protocol/ProtocolV31V32';
import { encryptECB, unpackMessage55AA, packMessage55AA } from '../src/local/protocol/ProtocolUtilities';

const key = Buffer.from('0123456789abcdef', 'latin1');

describe('ProtocolV31V32 (v3.1)', () => {
  const protocol = new ProtocolV31V32('3.1');

  test('CONTROL payload uses the encrypted, signed v3.1 envelope (matches TinyTuya)', () => {
    const json = Buffer.from(JSON.stringify({ devId: 'x', uid: '', t: '1', dps: { '1': false } }));
    const frame = protocol.encodeFrame(7, json, 1, undefined, key);
    const msg = unpackMessage55AA(frame, undefined, true)!;
    // Reference value computed with TinyTuya's v3.1 algorithm
    expect(msg.payload.toString('latin1')).toBe(
      '3.19fa105d096506df3Ufn2BX2LjweFEg8dJrZ21FkbjSc9mILJgHonoF1Pb357UP5xeWOgG2UyoPpuBW23N3Ii4GGpJMWRzZwn6hY+1A==',
    );
  });

  test('DP_QUERY payload stays plaintext', () => {
    const json = Buffer.from('{"gwId":"x","devId":"x"}');
    const frame = protocol.encodeFrame(10, json, 2, undefined, key);
    expect(unpackMessage55AA(frame, undefined, true)!.payload.toString()).toBe(json.toString());
  });

  test('decodes encrypted v3.1 status pushes', () => {
    const b64 = encryptECB(Buffer.from('{"dps":{"1":true}}'), key).toString('base64');
    const payload = Buffer.from(`3.1${'0'.repeat(16)}${b64}`, 'latin1');
    const decoded = protocol.decodeFrame(packMessage55AA(3, 8, payload), key)!;
    expect(decoded.payload.toString()).toBe('{"dps":{"1":true}}');
  });

  test('strips a 4-byte return code when present', () => {
    const payload = Buffer.concat([Buffer.alloc(4), Buffer.from('{"dps":{"1":true}}')]);
    const decoded = protocol.decodeFrame(packMessage55AA(5, 10, payload), key)!;
    expect(decoded.payload.toString()).toBe('{"dps":{"1":true}}');
  });

  test('passes through plaintext responses', () => {
    const decoded = protocol.decodeFrame(packMessage55AA(4, 10, Buffer.from('{"dps":{"1":true}}')), key)!;
    expect(decoded.payload.toString()).toBe('{"dps":{"1":true}}');
  });
});
