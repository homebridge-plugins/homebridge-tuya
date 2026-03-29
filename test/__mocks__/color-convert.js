module.exports = {
  rgb: {
    hsv: (r, g, b) => {
      // Simple RGB to HSV conversion mock
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      let h = 0, s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r / 255: h = (g - b) / 255 / d + (g < b ? 6 : 0); break;
          case g / 255: h = (b - r) / 255 / d + 2; break;
          case b / 255: h = (r - g) / 255 / d + 4; break;
        }
        h /= 6;
      }

      return [Math.round(h * 360), Math.round(s * 100), Math.round(max * 100)];
    },
  },
};
