// Jest setup file

// Mock environment variables
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@example.com';
process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GOOGLE_GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY || 'test-genai-key';
process.env.NEXT_PUBLIC_SHEET_ID = 'test-sheet-id';

// Mock console methods to reduce noise in tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep errors visible during tests to diagnose failures
  error: originalConsole.error.bind(originalConsole),
};