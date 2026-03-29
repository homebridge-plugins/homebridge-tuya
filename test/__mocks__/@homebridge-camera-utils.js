module.exports = {
  defaultFfmpegPath: '/usr/bin/ffmpeg',
  reservePorts: async (count) => {
    const ports = [];
    for (let i = 0; i < count; i++) {
      ports.push(5000 + i);
    }
    return ports;
  },
};
