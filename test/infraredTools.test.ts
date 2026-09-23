import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { internalCodeToBase64, base64ToInternalCode, decodeInternalCode } from '../src/shared/util/InfraredTool';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

// モック用のダミーロガー
const mockDebug = jest.fn();
// Mock Logger
const mockLog: ExLogger = {
    debug: mockDebug,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
} as unknown as ExLogger;

describe('infraredTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        initLogger(mockLog);
    });

    describe('internalCodeToBase64', () => {
        test('internalCode to base64', () => {
            const internalCode = '002310050c05040404040504040404050404050404040504040405040d0404040d040d04040405040d040d040404050404040d040d040404050404040d040d0404050404050404040d040d040404050404040504';
            const base64 = internalCodeToBase64(internalCode);
            expect(base64).toBe('ACMQBQwFBAQEBAUEBAQEBQQEBQQEBAUEBAQFBA0EBAQNBA0EBAQFBA0EDQQEBAUEBAQNBA0EBAQFBAQEDQQNBAQFBAQFBAQEDQQNBAQEBQQEBAUE');
        });

        test('invalid input. empty string.', () => {
            const internalCode = '';
            expect(() => internalCodeToBase64(internalCode)).toThrow(new Error('empty hex string'));
        });

        test('invalid input. odd length string.', () => {
            const internalCode = '01234';
            expect(() => internalCodeToBase64(internalCode)).toThrow(new Error('hex string length must be even'));
        });

        test('invalid input. not hex.', () => {
            const internalCode = '0123456789abcdefgh';
            expect(() => internalCodeToBase64(internalCode)).toThrow(new Error('invalid hex at 16: gh'));
        });
    });

    describe('base64ToInternalCode', () => {
        test('base64 to internalCode', () => {
            const base64 = 'ACMQBQwFBAQEBAUEBAQEBQQEBQQEBAUEBAQFBA0EBAQNBA0EBAQFBA0EDQQEBAUEBAQNBA0EBAQFBAQEDQQNBAQFBAQFBAQEDQQNBAQEBQQEBAUE';
            const internalCode = base64ToInternalCode(base64);
            expect(internalCode).toBe('002310050c05040404040504040404050404050404040504040405040d0404040d040d04040405040d040d040404050404040d040d040404050404040d040d0404050404050404040d040d040404050404040504');
        });

        test('base64 to internalCode with padding', () => {
            const base64 = 'ACMQBQwFBAQEBAUEBAQEBQQEBQQEBAUEBAQFBA0EBAQNBA0EBAQFBA0EDQQEBAUEBAQNBA0EBAQFBAQEDQQNBAQFBAQFBAQEDQQNBAQEBQQEBAUE====';
            const internalCode = base64ToInternalCode(base64);
            expect(internalCode).toBe('002310050c05040404040504040404050404050404040504040405040d0404040d040d04040405040d040d040404050404040d040d040404050404040d040d0404050404050404040d040d040404050404040504');
        });
    });

    // describe('decodeInternalCode', () => {
    //     test('decode internalCode', () => {
    //         const internalCode = '23cb260100205800c64000000000100000a3';
    //         const decoded = decodeInternalCode(internalCode);
    //         expect(decoded.protocol).toBe('NEC');
    //     });
    // });
});