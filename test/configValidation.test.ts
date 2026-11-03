/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import { describe, expect, test, jest } from '@jest/globals';

import { TuyaPlatform } from '../src/platform';

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
});
