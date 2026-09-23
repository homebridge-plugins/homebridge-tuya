import convert from 'color-convert';
import colorTemperaturePkg from 'color-temperature';
const { colorTemperature2rgb } = colorTemperaturePkg;

// HomeKit minimum
const KELVIN_MAX = miredToKelvin(140);
// HomeKit minimum
const KELVIN_MIN = miredToKelvin(500);

export function kelvinToHSV(kelvin: number) {
  if (kelvin < KELVIN_MIN) {
    kelvin = KELVIN_MIN;
  } else if (KELVIN_MAX < kelvin) {
    kelvin = KELVIN_MAX;
  }
  const rgb = colorTemperature2rgb(kelvin);
  const [h, s, v] = convert.rgb.hsv(rgb.red, rgb.green, rgb.blue);
  return { h, s, v };
}

// https://en.wikipedia.org/wiki/Mired
export function kelvinToMired(kelvin: number) {
  return 1e6 / kelvin;
}

export function miredToKelvin(mired: number) {
  return 1e6 / mired;
}
