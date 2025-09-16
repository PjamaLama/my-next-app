import {
  retryWithBackoff,
  isRetryableError,
  getAIErrorMessage,
  executeAIWithRetry,
  executeAIWithModelFallback,
  logAIError,
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

describe('AI Utils', () => {
  describe('RequestThrottler', () => {
    let throttler: RequestThrottler;

    beforeEach(() => {
      throttler = new RequestThrottler();
    });

    it('should not throttle if enough time has passed', async () => {
      const startTime = Date.now();
      await throttler.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should throttle subsequent requests', async () => {
      await throttler.throttle();

      const startTime = Date.now();
      await throttler.throttle();
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
    });

    it('should not identify non-retryable errors', () => {
      expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
      expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('Validation error'))).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isRetryableError(new Error('SERVICE UNAVAILABLE'))).toBe(true);
      expect(isRetryableError(new Error('Rate Limit'))).toBe(true);
    });
  });

  describe('getAIErrorMessage', () => {
    it('should return user-friendly messages for known errors', () => {
      expect(getAIErrorMessage(new Error('Quota exceeded')))
        .toBe('AI service quota exceeded. Please check your API key limits.');
    });

    it('should return generic message for unknown errors', () => {
      expect(getAIErrorMessage(new Error('Unknown error')))
        .toBe('AI service error: Unknown error');
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
        .mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('400 Bad Request'));

      await expect(retryWithBackoff(operation)).rejects.toThrow('400 Bad Request');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeAIWithRetry', () => {
    it('should succeed with operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await executeAIWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

  });

  describe('executeAIWithModelFallback', () => {
    it('should succeed with first model', async () => {
      const operations = [
        jest.fn().mockResolvedValue('success with model 1')
      ];

      const result = await executeAIWithModelFallback(operations);
      expect(result).toBe('success with model 1');
    });


    it('should handle empty operations array', async () => {
      await expect(executeAIWithModelFallback([]))
        .rejects.toThrow('No operations provided for model fallback');
    });
  });

  describe('logAIError', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      const context = 'Test context';

      logAIError(error, context);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('AI Error in Test context:'),
        expect.objectContaining({
          message: 'Test error',
          stack: expect.any(String)
        })
      );
    });
  });
});
