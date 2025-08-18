// Context utilities for debugging and logging in the chat system

import { Context } from './types';

// Debug logging levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Global log level configuration
let currentLogLevel = LogLevel.INFO;

function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function getLogLevel(): LogLevel {
  return currentLogLevel;
}

// Context logging utilities
function logContext(context: Context, message: string, level: LogLevel = LogLevel.INFO): void {
  if (level < currentLogLevel) return;
  
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [CONTEXT]`;
  
  switch (level) {
    case LogLevel.DEBUG:
      console.debug(`${prefix} ${message}`, context);
      break;
    case LogLevel.INFO:
      console.info(`${prefix} ${message}`, context);
      break;
    case LogLevel.WARN:
      console.warn(`${prefix} ${message}`, context);
      break;
    case LogLevel.ERROR:
      console.error(`${prefix} ${message}`, context);
      break;
  }
}

// Context validation and debugging
function validateContext(context: Context): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  try {
    // Check required fields
    if (!context.spreadsheetId) {
      issues.push('Missing spreadsheetId');
    }
    
    if (!context.sheetName && (!context.sheetNames || context.sheetNames.length === 0)) {
      issues.push('Missing sheetName or sheetNames');
    }
    
    // Check data consistency
    const ctxAny = context as any;
    if (ctxAny.sheetData && typeof ctxAny.sheetData === 'object') {
      const sheetNames = Object.keys(ctxAny.sheetData);
      if (sheetNames.length > 0) {
        for (const sheetName of sheetNames) {
          const data = ctxAny.sheetData[sheetName];
          if (!Array.isArray(data)) {
            issues.push(`Invalid sheetData format for ${sheetName}`);
          } else if (data.length > 0 && !Array.isArray(data[0])) {
            issues.push(`Invalid headers format for ${sheetName}`);
          }
        }
      }
    }
    
    // Check hydration status
    if (ctxAny._sheetHydratedAt && typeof ctxAny._sheetHydratedAt !== 'number') {
      issues.push('Invalid _sheetHydratedAt timestamp');
    }
    
    // Check flag consistency
    if (ctxAny.flag && !['extraction', 'mapped'].includes(ctxAny.flag)) {
      issues.push(`Invalid flag value: ${ctxAny.flag}`);
    }
    
  } catch (error) {
    issues.push(`Context validation error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

// Context debugging with detailed information
function debugContext(context: Context, operation: string): void {
  if (currentLogLevel > LogLevel.DEBUG) return;
  
  const ctxAny = context as any;
  const debugInfo = {
    operation,
    timestamp: new Date().toISOString(),
    spreadsheetId: context.spreadsheetId,
    sheetName: context.sheetName,
    sheetNames: ctxAny?.sheetNames,
    flag: ctxAny?.flag,
    hasSheetData: !!ctxAny?.sheetData,
    sheetDataKeys: ctxAny?.sheetData ? Object.keys(ctxAny.sheetData) : [],
    sheetHeaders: ctxAny?.sheetHeaders,
    hydrationStatus: {
      hydratedAt: ctxAny?._sheetHydratedAt,
      hydrationSource: ctxAny?._hydrationSource,
      hydrationWarning: ctxAny?._hydrationWarning
    },
    error: ctxAny?.error,
    userId: ctxAny?.userId,
    sessionId: ctxAny?.sessionId
  };
  
  console.debug('[CONTEXT_DEBUG]', debugInfo);
}

// Context hydration status logging
function logHydrationStatus(context: Context, operation: string, success: boolean, details?: any): void {
  const ctxAny = context as any;
  const status = {
    operation,
    success,
    timestamp: new Date().toISOString(),
    spreadsheetId: context.spreadsheetId,
    sheetName: ctxAny?.sheetName || ctxAny?.sheetNames?.[0],
    hydrationSource: ctxAny?._hydrationSource,
    hydrationWarning: ctxAny?._hydrationWarning,
    sheetDataKeys: ctxAny?.sheetData ? Object.keys(ctxAny.sheetData) : [],
    details
  };
  
  if (success) {
    logContext(context, `Hydration successful for ${operation}`, LogLevel.INFO);
  } else {
    logContext(context, `Hydration failed for ${operation}`, LogLevel.ERROR);
  }
  
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.debug('[HYDRATION_STATUS]', status);
  }
}

// Context state change logging
function logContextChange(context: Context, change: string, oldValue?: any, newValue?: any): void {
  if (currentLogLevel > LogLevel.DEBUG) return;
  
  const changeInfo = {
    change,
    timestamp: new Date().toISOString(),
    spreadsheetId: context.spreadsheetId,
    sheetName: (context as any)?.sheetName,
    oldValue,
    newValue
  };
  
  console.debug('[CONTEXT_CHANGE]', changeInfo);
}

// Context performance monitoring
function createContextTimer(operation: string): () => void {
  const startTime = Date.now();
  
  return () => {
    const duration = Date.now() - startTime;
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(`[CONTEXT_PERF] ${operation} completed in ${duration}ms`);
    }
  };
}

// Context error logging with context information
function logContextError(context: Context, error: Error, operation: string): void {
  const errorInfo = {
    operation,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context: {
      spreadsheetId: context.spreadsheetId,
      sheetName: (context as any)?.sheetName,
      flag: (context as any)?.flag
    }
  };
  
  console.error('[CONTEXT_ERROR]', errorInfo);
}

// Context summary for debugging
function getContextSummary(context: Context): string {
  const ctxAny = context as any;
  
  const summary = {
    spreadsheetId: context.spreadsheetId || 'none',
    sheetName: ctxAny?.sheetName || 'none',
    sheetNames: ctxAny?.sheetNames?.length || 0,
    flag: ctxAny?.flag || 'none',
    hasSheetData: !!ctxAny?.sheetData,
    sheetDataSheets: ctxAny?.sheetData ? Object.keys(ctxAny.sheetData).length : 0,
    hasHeaders: !!ctxAny?.sheetHeaders,
    headerCount: ctxAny?.sheetHeaders?.length || 0,
    hydrationStatus: ctxAny?._sheetHydratedAt ? 'hydrated' : 'not hydrated',
    error: ctxAny?.error || 'none'
  };
  
  return JSON.stringify(summary, null, 2);
}

// Export all utilities
export {
  LogLevel,
  setLogLevel,
  getLogLevel,
  logContext,
  validateContext,
  debugContext,
  logHydrationStatus,
  logContextChange,
  createContextTimer,
  logContextError,
  getContextSummary
};