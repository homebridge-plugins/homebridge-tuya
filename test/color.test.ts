import { describe, expect, test } from '@jest/globals';
import { kelvinToHSV } from '../src/shared/util/color';

describe('color util test', () => {
    describe('kelvinToHSV', () => {
        test('convert kelvin to HSV (1000). less than minimum', () => {
            const kelvin = 0;
            const hsv = kelvinToHSV(kelvin);
            expect(hsv).toEqual({ h: 33, s: 100, v: 100 });
        });

        test('convert kelvin to HSV (2700)', () => {
            const kelvin = 2700;
            const hsv = kelvinToHSV(kelvin);
            expect(hsv).toEqual({ h: 30, s: 100, v: 100 });
        });

        test('convert kelvin to HSV (4000)', () => {
            const kelvin = 4000;
            const hsv = kelvinToHSV(kelvin);
            expect(hsv).toEqual({ h: 29, s: 100, v: 100 });
        });

        test('convert kelvin to HSV (6500)', () => {
            const kelvin = 6500;
            const hsv = kelvinToHSV(kelvin);
            expect(hsv).toEqual({ h: 312, s: 100, v: 100 });
        });

        test('convert kelvin to HSV (10000) more than maximum', () => {
            const kelvin = 10000;
            const hsv = kelvinToHSV(kelvin);
            expect(hsv).toEqual({ h: 240, s: 100, v: 100 });
        });
    });

    describe('kelvinToMired', () => {
        test('convert kelvin to mired', () => {
            const kelvin = 3000;
            const mired = require('../src/shared/util/color').kelvinToMired(kelvin);
            expect(mired).toBeCloseTo(333.33, 2);
        });
    });

    describe('miredToKelvin', () => {
        test('convert mired to kelvin', () => {
            const mired = 333.33;
            const kelvin = require('../src/shared/util/color').miredToKelvin(mired);
            expect(kelvin).toBeCloseTo(3000, 0);
        });
    });
});