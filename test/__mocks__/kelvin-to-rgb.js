// Simple Kelvin to RGB conversion mock
module.exports = function kelvinToRgb(kelvin) {
  let r = 255, g = 255, b = 255;

  if (kelvin < 6600) {
    r = 255;
    g = Math.round(99.4708025861 * Math.log(kelvin) - 161.1195681661);
    
    if (kelvin < 2000) {
      b = 0;
    } else {
      b = Math.round(138.5177312231 * Math.log(kelvin - 10) - 305.0447927307);
    }
  }

  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
};
