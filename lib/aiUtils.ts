// AI utilities with retry logic for handling API overload issues

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 5, // Increased from 3
  baseDelay: 2000, // Increased from 1000ms
  maxDelay: 30000, // Increased from 10000ms
  backoffMultiplier: 2.5 // Increased from 2
};

// Request throttling to prevent overwhelming the API
class RequestThrottler {
  private lastRequestTime = 0;
  private minInterval = 1500; // 1.5 seconds between requests

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      console.log(`⏳ Throttling request for ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

const globalThrottler = new RequestThrottler();

// Exponential backoff retry function for AI API calls
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if this is a retryable error
      const isRetryable = isRetryableError(lastError);
      
      if (attempt === finalConfig.maxRetries || !isRetryable) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay
      );

      console.log(`AI API call failed (attempt ${attempt + 1}/${finalConfig.maxRetries + 1}), retrying in ${delay}ms...`);
      console.log(`Error: ${lastError.message}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Check if an error is retryable
function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    /503 Service Unavailable/,
    /429 Too Many Requests/,
    /500 Internal Server Error/,
    /502 Bad Gateway/,
    /503 Service Unavailable/,
    /504 Gateway Timeout/,
    /overloaded/,
    /try again later/,
    /rate limit/,
    /quota exceeded/,
    /model is overloaded/, // Add this specific pattern
    /service unavailable/,
    /temporarily unavailable/
  ];

  const errorMessage = error.message.toLowerCase();
  return retryablePatterns.some(pattern => pattern.test(errorMessage));
}

// Enhanced error message for AI API failures
export function getAIErrorMessage(error: Error): string {
  if (error.message.includes('503') || error.message.includes('overloaded')) {
    return 'The AI service is currently busy. Please try again in a few moments.';
  }
  
  if (error.message.includes('429') || error.message.includes('rate limit')) {
    return 'Too many requests to the AI service. Please wait a moment and try again.';
  }
  
  if (error.message.includes('quota exceeded')) {
    return 'AI service quota exceeded. Please check your API key limits.';
  }
  
  return `AI service error: ${error.message}`;
}

// Wrapper for AI operations with proper error handling and throttling
export async function executeAIWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'AI operation'
): Promise<T> {
  try {
    // Add throttling to prevent overwhelming the API
    await globalThrottler.throttle();
    
    return await retryWithBackoff(operation);
  } catch (error) {
    const errorMessage = getAIErrorMessage(error instanceof Error ? error : new Error(String(error)));
    console.error(`${operationName} failed after retries:`, error);
    throw new Error(`${operationName} failed: ${errorMessage}`);
  }
}

// Model fallback strategy for when one model is overloaded
export async function executeAIWithModelFallback<T>(
  operations: Array<() => Promise<T>>,
  operationName: string = 'AI operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < operations.length; i++) {
    try {
      console.log(`🔄 Trying AI operation with model ${i + 1}/${operations.length}`);
      return await executeAIWithRetry(operations[i], `${operationName} (model ${i + 1})`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`❌ Model ${i + 1} failed:`, lastError.message);
      
      if (i === operations.length - 1) {
        // This was the last model, throw the error
        throw lastError;
      }
      
      // Wait a bit before trying the next model
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw lastError!;
}

// Enhanced error logging
export function logAIError(error: Error, context: string) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] AI Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    timestamp
  });
}

// Test function to verify retry mechanism (for development)
export async function testRetryMechanism() {
  console.log('🧪 Testing retry mechanism...');
  
  let attemptCount = 0;
  const testOperation = async () => {
    attemptCount++;
    console.log(`🧪 Test attempt ${attemptCount}`);
    
    if (attemptCount < 3) {
      throw new Error('503 Service Unavailable - The model is overloaded. Please try again later.');
    }
    
    return 'Success after retries!';
  };
  
  try {
    const result = await executeAIWithRetry(testOperation, 'Test operation');
    console.log('✅ Retry test passed:', result);
    return true;
  } catch (error) {
    console.error('❌ Retry test failed:', error);
    return false;
  }
} 