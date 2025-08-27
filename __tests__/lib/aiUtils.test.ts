import {
  retryWithBackoff,
  isRetryableError,
  getAIErrorMessage,
  executeAIWithRetry,
  executeAIWithModelFallback,
  logAIError,
  testRetryMechanism,
  RequestThrottler
} from '../../lib/aiUtils';

// Mock console methods to avoid noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Note: Using real timers to avoid hanging issues in tests

describe('AI Utils', () => {
  describe('RequestThrottler', () => {
    let throttler: RequestThrottler;

    beforeEach(() => {
      throttler = new RequestThrottler();
      jest.clearAllTimers();
    });

    it('should not throttle if enough time has passed', async () => {
      const startTime = Date.now();
      await throttler.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should throttle subsequent requests', async () => {
      // First request
      await throttler.throttle();

      // Second request immediately after - should be throttled
      const throttlePromise = throttler.throttle();

      // Wait for throttling to complete
      await throttlePromise;

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Throttling request for')
      );
    });

    it('should throttle for correct duration', async () => {
      // First request
      await throttler.throttle();

      // Second request immediately after - should be throttled
      const throttlePromise = throttler.throttle();

      // Wait for throttling to complete
      await throttlePromise;

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Throttling request for')
      );
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        '503 Service Unavailable',
        '429 Too Many Requests',
        '500 Internal Server Error',
        '502 Bad Gateway',
        '504 Gateway Timeout',
        'The model is overloaded',
        'Please try again later',
        'Rate limit exceeded',
        'Quota exceeded',
        'Service unavailable',
        'Temporarily unavailable'
      ];

      retryableErrors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not identify non-retryable errors', () => {
      const nonRetryableErrors = [
        '400 Bad Request',
        '401 Unauthorized',
        '403 Forbidden',
        '404 Not Found',
        'Invalid input',
        'Syntax error'
      ];

      nonRetryableErrors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(isRetryableError(new Error('SERVICE UNAVAILABLE'))).toBe(true);
      expect(isRetryableError(new Error('Rate Limit'))).toBe(true);
    });
  });

  describe('getAIErrorMessage', () => {
    it('should return user-friendly messages for known errors', () => {
      expect(getAIErrorMessage(new Error('503 Service Unavailable')))
        .toBe('The AI service is currently busy. Please try again in a few moments.');

      expect(getAIErrorMessage(new Error('429 Too Many Requests')))
        .toBe('Too many requests to the AI service. Please wait a moment and try again.');

      expect(getAIErrorMessage(new Error('Quota exceeded')))
        .toBe('AI service quota exceeded. Please check your API key limits.');
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Unknown error occurred');
      expect(getAIErrorMessage(error))
        .toBe('AI service error: Unknown error occurred');
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should retry with exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(operation, {
        baseDelay: 10, // Very short delay for tests
        backoffMultiplier: 2,
        maxDelay: 50,
        maxRetries: 3
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('400 Bad Request'));

      await expect(retryWithBackoff(operation)).rejects.toThrow('400 Bad Request');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries limit', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(retryWithBackoff(operation, { maxRetries: 2 })).rejects.toThrow('503 Service Unavailable');
      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should respect maxDelay', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(operation, {
        baseDelay: 10, // Short delay for tests
        backoffMultiplier: 2,
        maxDelay: 50,
        maxRetries: 3
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeAIWithRetry', () => {
    it('should throttle and retry operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await executeAIWithRetry(operation, 'Test operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation failure with user-friendly error', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(executeAIWithRetry(operation, 'Test operation'))
        .rejects.toThrow('Test operation failed: The AI service is currently busy. Please try again in a few moments.');
    });
  });

  describe('executeAIWithModelFallback', () => {
    it('should succeed with first model', async () => {
      const operations = [
        jest.fn().mockResolvedValue('success with model 1'),
        jest.fn().mockResolvedValue('success with model 2'),
      ];

      const result = await executeAIWithModelFallback(operations, 'Test operation');

      expect(result).toBe('success with model 1');
      expect(operations[0]).toHaveBeenCalledTimes(1);
      expect(operations[1]).not.toHaveBeenCalled();
    });

    it('should fallback to second model on first model failure', async () => {
      const operations = [
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
        jest.fn().mockResolvedValue('success with model 2'),
      ];

      const result = await executeAIWithModelFallback(operations, 'Test operation');

      expect(result).toBe('success with model 2');
      expect(operations[0]).toHaveBeenCalledTimes(1);
      expect(operations[1]).toHaveBeenCalledTimes(1);
    });

    it('should wait between model attempts', async () => {
      const operations = [
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
        jest.fn().mockResolvedValue('success with model 2'),
      ];

      const result = await executeAIWithModelFallback(operations);

      expect(result).toBe('success with model 2');
      expect(operations[0]).toHaveBeenCalledTimes(1);
      expect(operations[1]).toHaveBeenCalledTimes(1);
    });

    it('should fail if all models fail', async () => {
      const operations = [
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
        jest.fn().mockRejectedValue(new Error('429 Too Many Requests')),
      ];

      await expect(executeAIWithModelFallback(operations, 'Test operation'))
        .rejects.toThrow('429 Too Many Requests');
    });

    it('should handle empty operations array', async () => {
      await expect(executeAIWithModelFallback([], 'Test operation'))
        .rejects.toThrow();
    });
  });

  describe('logAIError', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      const context = 'Test context';

      logAIError(error, context);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[20'),
        expect.stringContaining('AI Error in Test context:'),
        expect.objectContaining({
          message: 'Test error',
          stack: error.stack,
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('testRetryMechanism', () => {
    it('should test retry mechanism successfully', async () => {
      const result = await testRetryMechanism();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith('✅ Retry test passed:', 'Success after retries!');
    });

    it('should handle retry mechanism test failure', async () => {
      // Mock retryWithBackoff to always fail
      const originalRetryWithBackoff = require('../../lib/aiUtils').retryWithBackoff;
      require('../../lib/aiUtils').retryWithBackoff = jest.fn().mockRejectedValue(new Error('Test failure'));

      const result = await testRetryMechanism();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('❌ Retry test failed:', expect.any(Error));

      // Restore original function
      require('../../lib/aiUtils').retryWithBackoff = originalRetryWithBackoff;
    });
  });

  describe('Integration tests', () => {
    it('should handle complete flow with throttling and retries', async () => {
      let callCount = 0;
      const operation = jest.fn(() => {
        callCount++;
        if (callCount < 2) {
          throw new Error('503 Service Unavailable');
        }
        return Promise.resolve('success');
      });

      const result = await executeAIWithRetry(operation, 'Integration test');

      expect(result).toBe('success');
      expect(callCount).toBe(2); // One failure, one success
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Throttling request for')
      );
    });

    it('should handle model fallback with throttling', async () => {
      const operations = [
        jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
        jest.fn().mockResolvedValue('fallback success'),
      ];

      const result = await executeAIWithModelFallback(operations, 'Fallback test');

      expect(result).toBe('fallback success');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Throttling request for')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Trying AI operation with model 1/2')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Trying AI operation with model 2/2')
      );
    });
  });
});
