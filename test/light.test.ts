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
});