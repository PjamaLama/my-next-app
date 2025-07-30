// AI utilities with retry logic for handling API overload issues

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

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
    /quota exceeded/
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

// Wrapper for AI operations with proper error handling
export async function executeAIWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'AI operation'
): Promise<T> {
  try {
    return await retryWithBackoff(operation);
  } catch (error) {
    const errorMessage = getAIErrorMessage(error instanceof Error ? error : new Error(String(error)));
    console.error(`${operationName} failed after retries:`, error);
    throw new Error(`${operationName} failed: ${errorMessage}`);
  }
} 