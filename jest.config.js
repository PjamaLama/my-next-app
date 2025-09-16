module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
      }
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^next/(.*)$': '<rootDir>/node_modules/next/$1',
    '^node-fetch$': '<rootDir>/__mocks__/node-fetch.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'pages/api/**/*.ts',
    'lib/**/*.ts',
    'app/**/*.{ts,tsx}',
    'functions/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!jest.setup.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70
    }
  },
  // Support for different test environments
  projects: [
    {
      displayName: 'API & Lib Tests',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/api/**/*.test.ts', '**/__tests__/lib/**/*.test.ts', '**/__tests__/utils/**/*.test.ts'],
    },
    {
      displayName: 'Component Tests',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/components/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '@testing-library/jest-dom'],
    }
  ]
}; 