import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import Logger, { initLogger } from '../src/shared/util/Logger';
import { configureLight } from '../src/shared/accessory/characteristic/Light';
import { TuyaDeviceSchemaType } from '../src/cloud/device/TuyaDevice';

// Mock Logger
const mockLogger: Logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
} as unknown as Logger;

describe('Light Characteristic', () => {
    let accessoryMock = {
        getService: jest.fn(),
        addService: jest.fn(),
        removeService: jest.fn(),
        getStatus: jest.fn(),
        log: mockLogger,
        deviceManager: {
            getDevice: jest.fn(),
            enableAdaptiveLighting: jest.fn(),
        },
        Characteristic: {
            On: jest.fn(),
            Brightness: jest.fn(),
            ColorTemperature: jest.fn(),
            Hue: jest.fn(),
            Saturation: jest.fn(),
        },
        Service: {
            Lightbulb: jest.fn(),
            Switch: jest.fn(),
        },
    } as unknown as any;
    let serviceMock = {
        getCharacteristic: jest.fn().mockReturnValue({
            onGet: jest.fn().mockReturnThis(),
            onSet: jest.fn().mockReturnThis(),
            setProps: jest.fn(),
            updateValue: jest.fn(),
        }),
    } as unknown as any;

    beforeEach(() => {
        jest.resetModules();
        initLogger(mockLogger);
    });

    describe('ensureHSVProperty', () => {
        let spyLogDebug = jest.spyOn(mockLogger, 'debug').mockImplementation(() => {});

        beforeEach(() => {
            jest.resetModules();
            spyLogDebug.mockClear();
        });

        test('color schema with defined property', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = {
                code: 'color',
                type: TuyaDeviceSchemaType.Json,
                property: {
                    h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                    s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                    v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                },
            } as any;
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogDebug).toHaveBeenCalledWith('hsvProperty: %O', colorSchema.property);
        });

        test('color schema without defined property but mode includes colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: TuyaDeviceSchemaType.Json } as any; // No property
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogDebug).toHaveBeenCalledWith('hsvProperty: %O', {
                h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
            });
            expect(colorSchema.property).toEqual({
                h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
            });
        });

        test('color schema without defined property and mode does not include colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: TuyaDeviceSchemaType.Json } as any; // No property
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogDebug).toHaveBeenCalledWith('hsvProperty: %O', {});
            expect(colorSchema.property).toBeUndefined();
        });

        test('color schema with non JSON type but with defined property includes colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = {
                code: 'color',
                type: 'unsupported',
                property: {
                    h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                    s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                    v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                },
            } as any;
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogDebug).toHaveBeenCalledWith('hsvProperty: %O', colorSchema.property);
        });
    });

    describe('getLightType', () => {
        let spyLogInfo = jest.spyOn(mockLogger, 'info').mockImplementation(() => {});

        beforeEach(() => {
            jest.resetModules();
            spyLogInfo.mockClear();
        });

        test('Unknown light type when no schemas are provided', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            configureLight(accessoryMock, serviceMock, onSchema, undefined, tempSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'Unknown');
        });

        test('Normal light type when only on schema is provided', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;

            configureLight(accessoryMock, serviceMock, onSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'Normal');
        });

        test('CW light type when on and temp schemas are provided', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'CW');
        });

        test('RGB light type when on and color schemas are provided', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const colorSchema = {
                code: 'color',
                type: TuyaDeviceSchemaType.Json,
                property: {
                    h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                    s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                    v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                },
            } as any;

            configureLight(accessoryMock, serviceMock, onSchema, undefined, undefined, colorSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'RGB');
        });

        test('RGBC light type when on, color, and mode schemas are provided with mode including colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = {
                code: 'color',
                type: TuyaDeviceSchemaType.Json,
                property: {
                    h: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 360, scale: 0 },
                    s: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                    v: { type: TuyaDeviceSchemaType.Integer, min: 0, max: 1000, scale: 0 },
                },
            } as any;
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, undefined, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'RGBC');
        });

        test('RGBCW light type', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: TuyaDeviceSchemaType.Json, property: { h: {}, s: {}, v: {} } } as any;
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'RGBCW');
        });

        test('RGBCW light type with JSON color schema without property but mode includes colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: TuyaDeviceSchemaType.Json } as any; // No property
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'RGBCW');
        });

        test('RGBCW light type with JSON color schema without property and mode does not include colour', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: TuyaDeviceSchemaType.Json } as any; // No property
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'CW');
        });

        test('RGBCW light type with non JSON color schema', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: 'unsupported' } as any; // Unsupported type
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'CW');
        });

        test('RGBCW light type with non JSON with property color schema', () => {
            const onSchema = { code: 'on', type: TuyaDeviceSchemaType.Boolean } as any;
            const brightSchema = { code: 'bright', type: TuyaDeviceSchemaType.Integer } as any;
            const tempSchema = { code: 'temp', type: TuyaDeviceSchemaType.Integer } as any;
            const colorSchema = { code: 'color', type: 'unsupported', property: { h: {}, s: {}, v: {} } } as any; // Unsupported type but has property
            const modeSchema = { code: 'mode', type: TuyaDeviceSchemaType.Enum, property: { range: ['colour', 'white'] } } as any;

            configureLight(accessoryMock, serviceMock, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
            expect(spyLogInfo).toHaveBeenCalledWith('Light type: %s', 'RGBCW');
        });

    });

    describe('configureLight - ON handler bundles brightness', () => {
        let mockAccessory: any;
        let mockService: any;
        let handlers: Record<string, { onGet?: Function; onSet?: Function }>;

        beforeEach(() => {
            handlers = {};

            const makeCharChain = (name: string) => ({
            onGet: jest.fn(function (this: any, handler: Function) {
                handlers[name] = handlers[name] || {};
                handlers[name].onGet = handler;
                return this;
            }),
            onSet: jest.fn(function (this: any, handler: Function) {
                handlers[name] = handlers[name] || {};
                handlers[name].onSet = handler;
                return this;
            }),
            setProps: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            });

            const onChar = makeCharChain('On');
            const brightChar = makeCharChain('Brightness');

            mockService = {
            getCharacteristic: jest.fn((charType: any) => {
                if (charType === 'MockOn') return onChar;
                if (charType === 'MockBrightness') return brightChar;
                return makeCharChain('other');
            }),
            };

            mockAccessory = {
            Characteristic: { On: 'MockOn', Brightness: 'MockBrightness' },
            Service: { Lightbulb: 'MockLightbulb' },
            accessory: {
                displayName: 'Test Light',
                getService: jest.fn(() => null),
                addService: jest.fn(() => mockService),
            },
            log: { info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
            platform: { getDeviceConfig: jest.fn(() => undefined) },
            deviceManager: { enableAdaptiveLighting: jest.fn(() => false)},
            checkOnlineStatus: jest.fn(),
            getStatus: jest.fn((code: string) => {
                if (code === 'light') return { code: 'light', value: true };
                if (code === 'bright_value') return { code: 'bright_value', value: 420 };
                if (code === 'switch_led') return { code: 'switch_led', value: false };
                if (code === 'bright_value_1') return { code: 'bright_value_1', value: 100 };
                return undefined;
            }),
            sendCommands: jest.fn(),
            };
        });

        function makeSchema(code: string, type = 'Boolean', property: any = {}) {
            return { code, mode: 'rw', type, property };
        }

        function brightSchema(code = 'bright_value') {
            return makeSchema(code, 'Integer', { min: 10, max: 1000, scale: 0, step: 1 });
        }

        test('LightType.C: ON sends both on + cached brightness', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('light') as any,
            brightSchema() as any,
            );

            expect(handlers['On']?.onSet).toBeDefined();
            await handlers['On'].onSet!(true);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [
                { code: 'light', value: true },
                { code: 'bright_value', value: 420 },
            ],
            true,
            );
        });

        test('LightType.C: OFF sends only the on command (no brightness)', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('light') as any,
            brightSchema() as any,
            );

            await handlers['On'].onSet!(false);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [{ code: 'light', value: false }],
            true,
            );
        });

        test('dual-light warm channel: ON bundles warm brightness', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('light') as any,
            brightSchema('bright_value') as any,
            );

            await handlers['On'].onSet!(true);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [
                { code: 'light', value: true },
                { code: 'bright_value', value: 420 },
            ],
            true,
            );
        });

        test('dual-light white channel: ON bundles white brightness', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('switch_led') as any,
            brightSchema('bright_value_1') as any,
            );

            await handlers['On'].onSet!(true);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [
                { code: 'switch_led', value: true },
                { code: 'bright_value_1', value: 100 },
            ],
            true,
            );
        });

        test('brightness-only set does not include on command', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('light') as any,
            brightSchema() as any,
            );

            await handlers['Brightness'].onSet!(42);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [{ code: 'bright_value', value: 420 }],
            true,
            );
        });

        test('ON without brightness schema does not crash', async () => {
            configureLight(
            mockAccessory,
            mockService,
            makeSchema('light') as any,
            );

            expect(handlers['On']?.onSet).toBeDefined();
            await handlers['On'].onSet!(true);

            expect(mockAccessory.sendCommands).toHaveBeenCalledWith(
            [{ code: 'light', value: true }],
            true,
            );
        });
    });
});
