/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import { describe, expect, test, jest } from '@jest/globals';

import { TuyaPlatform } from '../src/platform';
import { normalizeRawSwitchConfigs } from '../src/accessory/characteristic/ExtraCharacteristicAdapter';

const validateSchema = (deviceOverrides: any[]) => {
  const log = { error: jest.fn() };
  const result = TuyaPlatform.prototype.validateSchema.call({ options: { deviceOverrides }, log } as any);
  return { result, log };
};

describe('config validation', () => {
  test('schema entries without a code (saved blank by the settings screen) are allowed', () => {
    const { result, log } = validateSchema([
      { id: 'a', schema: [{ hidden: false }] },
      { id: 'b', schema: [{ hidden: false }, { hidden: false }, { code: 'switch_1', hidden: true }] },
    ]);
    expect(result).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });

  test('duplicate codes are still rejected', () => {
    const { result } = validateSchema([{ id: 'a', schema: [{ code: 'switch_1' }, { code: 'switch_1' }] }]);
    expect(result).toBe(false);
  });

  test('settings screen: no required fields or invalid defaults inside optional lists', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.schema.json'), 'utf8')).schema;
    const options = schema.properties.options.properties;
    const overrideSchemaItem = options.deviceOverrides.items.properties.schema.items;
    expect(schema.properties.options.required).not.toContain('weatherAPI');
    expect(overrideSchemaItem.required).toBeUndefined();
    expect(overrideSchemaItem.properties.type.default).toBeUndefined();
    expect(overrideSchemaItem.properties.extraRawSwitch.items.required).toBeUndefined();
    expect(options.serviceInformationOverrides.items.required).toBeUndefined();
    expect(schema.properties.cameras.items.required).toBeUndefined();
  });

  test('settings screen: no defaults inside list items, so blank rows stay empty and are not saved', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.schema.json'), 'utf8')).schema;
    const options = schema.properties.options.properties;
    const rawSwitch = options.deviceOverrides.items.properties.schema.items.properties.extraRawSwitch.items.properties;
    expect(rawSwitch.notation.default).toBeUndefined();
    expect(rawSwitch.byteIndex.default).toBeUndefined();
    expect(options.serviceInformationOverrides.items.properties.index.default).toBeUndefined();
  });

  test('raw switches: blank rows dropped, notation and byteIndex defaulted in code', () => {
    const result = normalizeRawSwitchConfigs([
      {} as any,
      { notation: 'base64', byteIndex: 0 } as any,
      { configuredName: 'Mode A', value: '0x01' } as any,
      { configuredName: 'Mode B', value: '02', notation: 'hex', byteIndex: 3 },
    ]);
    expect(result).toEqual([
      { configuredName: 'Mode A', value: '0x01', notation: 'base64', byteIndex: 0 },
      { configuredName: 'Mode B', value: '02', notation: 'hex', byteIndex: 3 },
    ]);
    expect(normalizeRawSwitchConfigs(undefined)).toEqual([]);
  });
});
