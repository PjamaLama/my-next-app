module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^node-fetch$': '<rootDir>/__mocks__/node-fetch.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'pages/api/**/*.ts',
    'genkit/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}; 