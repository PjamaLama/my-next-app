// Jest setup file

// Mock environment variables
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.NEXT_PUBLIC_SHEET_ID = 'test-sheet-id';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}; 