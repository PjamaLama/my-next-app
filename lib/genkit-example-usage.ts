/**
 * Genkit Example Usage
 * 
 * This file demonstrates how to integrate the Genkit template with your existing
 * application. It shows practical examples of using the flows and utilities.
 */

import {
  helloFlow,
  analyzeSheetFlow,
  updateSingleSheetFlow,
  updateMultiSheetFlow,
  validateDataFlow,
  classifyEntryFlow,
  generateSummaryFlow,
  executeWithRetry,
  convertToGenkitFormat,
  testGenkitIntegration
} from './genkit-template';

/**
 * Example 1: Basic Integration Test
 * Test the Genkit setup and basic functionality
 */
export const runBasicTest = async () => {
  try {
    console.log('=== Running Basic Genkit Test ===');
    
    // Test the hello flow
    const greeting = await helloFlow('Your Name');
    console.log('Greeting:', greeting);
    
    // Run the comprehensive test
    await testGenkitIntegration();
    
    console.log('Basic test completed successfully!');
  } catch (error) {
    console.error('Basic test failed:', error);
  }
};

/**
 * Example 2: Replace Existing Gemini Function
 * Shows how to replace your current sendToGemini function with Genkit
 */
export const replaceGeminiFunction = async (
  transcript: string,
  sheetData: (string | number)[][],
  sheetName: string,
  geminiApiKey: string, // Note: Genkit handles API key differently
  images: Array<{ data: string; mimeType: string; }> = []
) => {
  try {
    // Convert your existing data format to Genkit format
    const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
    
    // Use the Genkit flow instead of direct API call
    const result = await updateSingleSheetFlow({
      transcript,
      sheetData: genkitSheetData,
      images
    });
    
    console.log('Genkit update result:', result);
    return result;
  } catch (error) {
    console.error('Error in Genkit update:', error);
    throw error;
  }
};

/**
 * Example 3: Multi-Sheet Processing
 * Shows how to handle multiple sheets with Genkit
 */
export const processMultipleSheets = async (
  transcript: string,
  sheetsData: { [sheetName: string]: (string | number)[][] },
  allSheetNames: string[],
  selectedSheetName?: string
) => {
  try {
    console.log('=== Processing Multiple Sheets with Genkit ===');
    
    const result = await updateMultiSheetFlow({
      transcript,
      sheetsData,
      allSheetNames,
      selectedSheetName
    });
    
    console.log('Multi-sheet result:', result);
    return result;
  } catch (error) {
    console.error('Error in multi-sheet processing:', error);
    throw error;
  }
};

/**
 * Example 4: Data Analysis and Validation
 * Shows how to analyze and validate your sheet data
 */
export const analyzeAndValidateData = async (sheetData: (string | number)[][], sheetName: string) => {
  try {
    console.log('=== Analyzing and Validating Data ===');
    
    const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
    
    // Analyze the data
    const analysis = await analyzeSheetFlow(genkitSheetData);
    console.log('Data Analysis:', analysis);
    
    // Validate the data
    const validation = await validateDataFlow(genkitSheetData);
    console.log('Data Validation:', validation);
    
    return { analysis, validation };
  } catch (error) {
    console.error('Error in data analysis:', error);
    throw error;
  }
};

/**
 * Example 5: Category Classification
 * Shows how to classify entries into categories
 */
export const classifyExpenseEntry = async (description: string) => {
  try {
    const availableCategories = [
      'Food', 'Transport', 'Entertainment', 'Office', 'Medical', 
      'Utilities', 'Travel', 'Personal', 'Business'
    ];
    
    const classification = await classifyEntryFlow({
      description,
      availableCategories
    });
    console.log('Classification result:', classification);
    
    return classification;
  } catch (error) {
    console.error('Error in classification:', error);
    throw error;
  }
};

/**
 * Example 6: Generate Reports
 * Shows how to generate summaries and reports
 */
export const generateMonthlyReport = async (sheetData: (string | number)[][], sheetName: string) => {
  try {
    const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
    
    const report = await generateSummaryFlow({
      sheetData: genkitSheetData,
      summaryType: 'monthly'
    });
    console.log('Monthly Report:', report);
    
    return report;
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
};

/**
 * Example 7: Error Handling with Retry
 * Shows how to use the retry utility for robust error handling
 */
export const robustDataProcessing = async (
  transcript: string,
  sheetData: (string | number)[][],
  sheetName: string
) => {
  try {
    const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
    
    // Use retry utility for robust processing
    const result = await executeWithRetry(
      (...args: unknown[]) => {
        const [transcript, sheetData] = args;
        return updateSingleSheetFlow({ transcript: transcript as string, sheetData });
      },
      [transcript, genkitSheetData],
      3, // max retries
      2000 // delay between retries
    );
    
    console.log('Robust processing result:', result);
    return result;
  } catch (error) {
    console.error('Robust processing failed after retries:', error);
    throw error;
  }
};

/**
 * Example 8: Integration with Your Existing API Routes
 * Shows how to integrate Genkit with your Next.js API routes
 */
export const createGenkitAPIHandler = async (
  req: { body: { transcript: string; sheetData: unknown; sheetName: string; images?: unknown } },
  res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }
) => {
  try {
    const { transcript, sheetData, sheetName, images } = req.body;
    
    // Validate input
    if (!transcript || !sheetData || !sheetName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Process with Genkit
    const result = await replaceGeminiFunction(transcript, sheetData as (string | number)[][], sheetName, '', images as Array<{ data: string; mimeType: string; }>);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('API handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Example 9: Batch Processing
 * Shows how to process multiple requests efficiently
 */
export const batchProcessRequests = async (
  requests: Array<{
    transcript: string;
    sheetData: (string | number)[][];
    sheetName: string;
  }>
) => {
  try {
    console.log(`Processing ${requests.length} requests in batch...`);
    
    const results = await Promise.all(
      requests.map(async (request) => {
        try {
          const result = await replaceGeminiFunction(
            request.transcript,
            request.sheetData as (string | number)[][],
            request.sheetName,
            ''
          );
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      })
    );
    
    console.log('Batch processing completed');
    return results;
  } catch (error) {
    console.error('Batch processing failed:', error);
    throw error;
  }
};

/**
 * Example 10: Configuration and Setup
 * Shows how to configure Genkit for your specific needs
 */
export const configureGenkit = () => {
  // You can extend the template with additional configuration
  console.log('Genkit is configured and ready to use!');
  
  // Example: Set up environment variables
  // process.env.GOOGLE_AI_API_KEY = 'your-api-key';
  
  // Example: Configure logging
  // console.log('Logging configured for Genkit flows');
  
  return {
    status: 'configured',
    timestamp: new Date().toISOString()
  };
};

// Export all examples for easy access
export const examples = {
  runBasicTest,
  replaceGeminiFunction,
  processMultipleSheets,
  analyzeAndValidateData,
  classifyExpenseEntry,
  generateMonthlyReport,
  robustDataProcessing,
  createGenkitAPIHandler,
  batchProcessRequests,
  configureGenkit
};

// Quick start function
export const quickStart = async () => {
  console.log('🚀 Starting Genkit Integration...');
  
  // Configure Genkit
  configureGenkit();
  
  // Run basic test
  await runBasicTest();
  
  console.log('✅ Genkit integration ready!');
}; 