import convert from 'color-convert';
import kelvinToRgb from 'kelvin-to-rgb';

export function kelvinToHSV(kevin: number) {
  const [r, g, b] = kelvinToRgb(kevin);
  const [h, s, v] = convert.rgb.hsv(r, g, b);
  return { h, s, v };
}

// https://en.wikipedia.org/wiki/Mired
export function kelvinToMired(kelvin: number) {
  return 1e6 / kelvin;
}

export function miredToKelvin(mired: number) {
  return 1e6 / mired;
}

// Tuya colour_data (hex string) → HSV (0-360, 0-100, 0-100)
export function tuyaPackedHSVToHSV(hex: string) {
  if (hex.length !== 12) {
    return { h: 0, s: 0, v: 0 };
  }

  const h = parseInt(hex.substring(0, 4), 16);
  const s = parseInt(hex.substring(4, 8), 16);
  const v = parseInt(hex.substring(8, 12), 16);

  return { h: h, s: s, v: v };
}

// HSV (0-360, 0-100, 0-100) → Tuya colour_data (hex string)
export function hsvToTuyaPackedHSV(h: number, s: number, v: number) {
  // Tuya uses 10x scaled integers
  const h10 = Math.round(h);
  const s10 = Math.round(s);
  const v10 = Math.round(v);

  // Convert to 4-digit hex (zero-padded)
  const hHex = h10.toString(16).padStart(4, '0');
  const sHex = s10.toString(16).padStart(4, '0');
  const vHex = v10.toString(16).padStart(4, '0');

  return `${hHex}${sHex}${vHex}`;
}