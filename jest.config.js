/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/)*package\\.json$': '<rootDir>/package.json',
    '^color-convert$': '<rootDir>/test/__mocks__/color-convert.js',
    '^kelvin-to-rgb$': '<rootDir>/test/__mocks__/kelvin-to-rgb.js',
    '^@homebridge/camera-utils$': '<rootDir>/test/__mocks__/@homebridge-camera-utils.js',
  },
};
