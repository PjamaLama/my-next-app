import { createLogger } from '../../lib/logger';

// Mock console methods to capture output
const originalConsole = { ...console };
const mockConsole = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock environment variables
const originalEnv = { ...process.env };

describe('Logger Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Replace console methods with mocks
    Object.assign(console, mockConsole);
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original console
    Object.assign(console, originalConsole);
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createLogger', () => {
    it('should create a logger with all log levels', () => {
      const logger = createLogger('test');

      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('Log level methods', () => {
    it('should call console.log for debug level', () => {
      const logger = createLogger('test');
      logger.debug('test message', { data: 'value' });

      expect(console.log).toHaveBeenCalledWith('[test]', 'test message', { data: 'value' });
    });

    it('should call console.info for info level', () => {
      const logger = createLogger('test');
      logger.info('info message', 123);

      expect(console.info).toHaveBeenCalledWith('[test]', 'info message', 123);
    });

    it('should call console.warn for warn level', () => {
      const logger = createLogger('test');
      logger.warn('warning message');

      expect(console.warn).toHaveBeenCalledWith('[test]', 'warning message');
    });

    it('should call console.error for error level', () => {
      const logger = createLogger('test');
      logger.error('error message', new Error('test error'));

      expect(console.error).toHaveBeenCalledWith('[test]', 'error message', expect.any(Error));
    });
  });

  describe('Namespace prefixing', () => {
    it('should prefix all log messages with namespace', () => {
      const logger = createLogger('my-namespace');

      logger.info('test');
      logger.warn('another test');
      logger.error('error test');

      expect(console.info).toHaveBeenCalledWith('[my-namespace]', 'test');
      expect(console.warn).toHaveBeenCalledWith('[my-namespace]', 'another test');
      expect(console.error).toHaveBeenCalledWith('[my-namespace]', 'error test');
    });

    it('should handle empty namespace', () => {
      const logger = createLogger('');

      logger.info('test');

      expect(console.info).toHaveBeenCalledWith('[]', 'test');
    });

    it('should handle special characters in namespace', () => {
      const logger = createLogger('test/with/special-chars');

      logger.info('test');

      expect(console.info).toHaveBeenCalledWith('[test/with/special-chars]', 'test');
    });
  });

  describe('Debug level filtering', () => {
    it('should not log debug messages when debug is disabled', () => {
      // Ensure DEBUG is not set
      delete process.env.DEBUG;

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log debug messages when DEBUG=*', () => {
      process.env.DEBUG = '*';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should log debug messages when DEBUG=true', () => {
      process.env.DEBUG = 'true';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should log debug messages when namespace is included in DEBUG', () => {
      process.env.DEBUG = 'test,other';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should log debug messages when "all" is included in DEBUG', () => {
      process.env.DEBUG = 'other,all,another';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should log debug messages when "app" is included in DEBUG', () => {
      process.env.DEBUG = 'other,app,another';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should not log debug messages when namespace is not included in DEBUG', () => {
      process.env.DEBUG = 'other,another';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle comma-separated DEBUG values with spaces', () => {
      process.env.DEBUG = ' other , test , another ';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should handle empty DEBUG value', () => {
      process.env.DEBUG = '';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle undefined DEBUG value', () => {
      delete process.env.DEBUG;

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('Non-debug levels', () => {
    it('should always log info messages regardless of DEBUG setting', () => {
      // No DEBUG set
      delete process.env.DEBUG;

      const logger = createLogger('test');
      logger.info('info message');

      expect(console.info).toHaveBeenCalledWith('[test]', 'info message');
    });

    it('should always log warn messages regardless of DEBUG setting', () => {
      process.env.DEBUG = 'other';

      const logger = createLogger('test');
      logger.warn('warn message');

      expect(console.warn).toHaveBeenCalledWith('[test]', 'warn message');
    });

    it('should always log error messages regardless of DEBUG setting', () => {
      process.env.DEBUG = 'nothing';

      const logger = createLogger('test');
      logger.error('error message');

      expect(console.error).toHaveBeenCalledWith('[test]', 'error message');
    });
  });

  describe('Multiple arguments', () => {
    it('should handle multiple arguments correctly', () => {
      const logger = createLogger('test');

      logger.info('message', 123, { obj: 'value' }, [1, 2, 3]);

      expect(console.info).toHaveBeenCalledWith(
        '[test]',
        'message',
        123,
        { obj: 'value' },
        [1, 2, 3]
      );
    });

    it('should handle no arguments', () => {
      const logger = createLogger('test');

      logger.info();

      expect(console.info).toHaveBeenCalledWith('[test]');
    });
  });

  describe('Browser environment', () => {
    const originalWindow = global.window;
    const originalDocument = global.document;

    beforeEach(() => {
      // Mock browser environment
      (global as any).window = {};
      (global as any).document = {};
    });

    afterEach(() => {
      // Restore original environment
      delete (global as any).window;
      delete (global as any).document;
    });

    it('should use NEXT_PUBLIC_DEBUG in browser environment', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'test';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should use window.__DEBUG as fallback in browser environment', () => {
      delete process.env.NEXT_PUBLIC_DEBUG;
      (global as any).window.__DEBUG = 'test';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });

    it('should use server DEBUG in non-browser environment', () => {
      // Restore non-browser environment
      delete (global as any).window;
      delete (global as any).document;
      process.env.DEBUG = 'test';

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(console.log).toHaveBeenCalledWith('[test]', 'debug message');
    });
  });

  describe('Integration tests', () => {
    it('should work with typical usage patterns', () => {
      process.env.DEBUG = 'api,db';

      const apiLogger = createLogger('api');
      const dbLogger = createLogger('db');
      const otherLogger = createLogger('other');

      // These should log debug messages
      apiLogger.debug('API debug message');
      dbLogger.debug('DB debug message');

      // This should not log debug messages
      otherLogger.debug('Other debug message');

      // All should log info messages
      apiLogger.info('API info');
      dbLogger.info('DB info');
      otherLogger.info('Other info');

      expect(console.log).toHaveBeenCalledTimes(2); // Only api and db debug messages
      expect(console.info).toHaveBeenCalledTimes(3); // All info messages
    });

    it('should handle complex data structures', () => {
      const logger = createLogger('test');
      const complexData = {
        user: { id: 123, name: 'John' },
        items: [{ name: 'item1', value: 100 }, { name: 'item2', value: 200 }],
        timestamp: new Date(),
        error: new Error('test error')
      };

      logger.info('Complex data:', complexData);

      expect(console.info).toHaveBeenCalledWith('[test]', 'Complex data:', complexData);
    });
  });
});
