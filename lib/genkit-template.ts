/**
 * Genkit Integration Template
 * 
 * This template provides a foundation for integrating Genkit with your existing
 * Gemini functionality. It includes:
 * - Basic Genkit configuration with Google AI plugin
 * - Firebase telemetry for monitoring and analytics
 * - Template flows for common use cases
 * - Integration with existing sheet data processing
 * - Error handling and logging
 * - Type definitions for better development experience
 */

import { gemini15Flash, googleAI } from '@genkit-ai/googleai';
import { genkit } from 'genkit';
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';

// Type definitions for better development experience
interface SheetData {
  headers: string[];
  rows: (string | number)[][];
  sheetName: string;
}

interface ProcessedUpdate {
  sheetName: string;
  row: number;
  column: string;
  cell: string;
  value: string | number;
  confidence: 'high' | 'medium' | 'low';
}

interface MultiSheetUpdate {
  reasoning: string;
  sheetsToUpdate: string[];
  updates: ProcessedUpdate[];
}

// Enable Firebase telemetry for monitoring and analytics
enableFirebaseTelemetry();

// Configure Genkit instance with Google AI plugin
const ai = genkit({
  plugins: [googleAI()],
  model: gemini15Flash, // Set default model
});

/**
 * Basic Hello World Flow
 * Simple example to test Genkit integration
 */
export const helloFlow = ai.defineFlow('helloFlow', async (name: string) => {
  try {
    const { text } = await ai.generate(`Hello Gemini, my name is ${name}. Please respond with a friendly greeting.`);
    console.log('Genkit Hello Flow Response:', text);
    return text;
  } catch (error) {
    console.error('Error in helloFlow:', error);
    throw error;
  }
});

/**
 * Sheet Data Analysis Flow
 * Analyzes sheet data and provides insights
 */
export const analyzeSheetFlow = ai.defineFlow('analyzeSheetFlow', async (sheetData: SheetData) => {
  try {
    const prompt = `Analyze this Google Sheet data and provide insights:

Sheet Name: ${sheetData.sheetName}
Headers: ${sheetData.headers.join(', ')}
Number of rows: ${sheetData.rows.length}

Data Preview (first 5 rows):
${sheetData.rows.slice(0, 5).map(row => row.join(', ')).join('\n')}

Please provide:
1. Data type analysis for each column
2. Pattern recognition
3. Potential data quality issues
4. Suggestions for data organization
5. Recommended next steps

Respond in a structured format.`;

    const { text } = await ai.generate(prompt);
    console.log('Sheet Analysis Response:', text);
    return text;
  } catch (error) {
    console.error('Error in analyzeSheetFlow:', error);
    throw error;
  }
});

/**
 * Single Sheet Update Flow
 * Processes user transcript and updates a single sheet
 */
export const updateSingleSheetFlow = ai.defineFlow('updateSingleSheetFlow', async (params: {
  transcript: string;
  sheetData: SheetData;
  images?: Array<{ data: string; mimeType: string; }>;
}) => {
  try {
    const { transcript, sheetData } = params;
    const nextRow = sheetData.rows.length + 1;
    
    // Build pattern analysis similar to your existing logic
    let patternAnalysis = "";
    if (sheetData.rows.length > 0) {
      patternAnalysis = `\n\nDATA PATTERN ANALYSIS:`;
      
      sheetData.headers.forEach((header: string, colIndex: number) => {
        const columnValues = sheetData.rows.map((row: (string | number)[]) => row[colIndex]).filter((val: string | number) => val !== "" && val !== null && val !== undefined);
        
        if (columnValues.length > 0) {
          const recentValues = columnValues.slice(-3);
          patternAnalysis += `\n- "${header}": Recent values: [${recentValues.join(', ')}]`;
        }
      });
    }

    const prompt = `You are helping update a Google Sheet named "${sheetData.sheetName}".

User's request: ${transcript}

Current sheet data:
Headers: ${sheetData.headers.join(', ')}
${sheetData.rows.map((row) => row.join(',')).join('\n')}${patternAnalysis}

Your task:
1. Determine the next available row (${nextRow})
2. Based on the user's request and existing data patterns, suggest values for each column
3. Output your response in this EXACT JSON format:

{
  "row_to_update": ${nextRow},
  "cells_to_update": [
    { "column": "ColumnName1", "cell": "A${nextRow}", "value": "suggested value", "confidence": "high|medium|low" }
  ]
}

Rules:
- Use "high" confidence for user-provided data
- Use "medium" confidence for strong pattern matches
- Use "low" confidence for best guesses from historical patterns
- Return ONLY the JSON object, no explanations or markdown`;

    const { text } = await ai.generate(prompt);
    console.log('Single Sheet Update Response:', text);
    
    // Parse the response
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed?.cells_to_update || [];
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', parseError);
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Error in updateSingleSheetFlow:', error);
    throw error;
  }
});

/**
 * Multi-Sheet Update Flow
 * Processes user transcript and updates multiple sheets
 */
export const updateMultiSheetFlow = ai.defineFlow('updateMultiSheetFlow', async (params: {
  transcript: string;
  sheetsData: { [sheetName: string]: (string | number)[][] };
  allSheetNames: string[];
  selectedSheetName?: string;
  images?: Array<{ data: string; mimeType: string; }>;
}) => {
  try {
    const { transcript, sheetsData, allSheetNames, selectedSheetName } = params;
    
    // Build comprehensive sheets info
    const sheetsInfo = Object.entries(sheetsData).map(([sheetName, data]) => {
      const headers = data.length > 0 ? data[0] : [];
      const rowCount = data.length - 1;
      const nextRow = Math.max(2, data.length + 1);
      
      return `Sheet: "${sheetName}"
Headers: ${headers.join(', ')}
Current rows: ${rowCount}
Next available row: ${nextRow}`;
    }).join('\n\n');

    const prompt = `You are an intelligent assistant helping to update Google Sheets based on user requests.

Available sheets: ${allSheetNames.join(', ')}
${selectedSheetName ? `User's preferred sheet: "${selectedSheetName}"` : 'No specific sheet preference'}

Sheet details:
${sheetsInfo}

User's request: "${transcript}"

Your task:
1. Analyze which sheets should be updated based on the user's request
2. Determine appropriate row numbers for each sheet
3. Suggest values for each column based on patterns and user input
4. Output your response in this EXACT JSON format:

{
  "reasoning": "Explanation of sheet selection and pattern analysis",
  "sheetsToUpdate": ["Sheet1", "Sheet2"],
  "updates": [
    {
      "sheetName": "SheetName",
      "row": 5,
      "column": "ColumnName",
      "cell": "A5",
      "value": "suggested value",
      "confidence": "high|medium|low"
    }
  ]
}

Rules:
- Match content to the most appropriate sheet based on semantic relevance
- Use pattern analysis to suggest intelligent defaults
- Include confidence levels for each field
- Return ONLY the JSON object, no explanations or markdown`;

    const { text } = await ai.generate(prompt);
    console.log('Multi-Sheet Update Response:', text);
    
    // Parse the response
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return {
        reasoning: parsed.reasoning || "AI analysis complete",
        sheetsToUpdate: parsed.sheetsToUpdate || [],
        updates: parsed.updates || []
      } as MultiSheetUpdate;
    } catch (parseError) {
      console.error('Failed to parse multi-sheet response as JSON:', parseError);
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Error in updateMultiSheetFlow:', error);
    throw error;
  }
});

/**
 * Data Validation Flow
 * Validates and cleans sheet data
 */
export const validateDataFlow = ai.defineFlow('validateDataFlow', async (sheetData: SheetData) => {
  try {
    const prompt = `Validate this Google Sheet data for potential issues:

Sheet Name: ${sheetData.sheetName}
Headers: ${sheetData.headers.join(', ')}
Data rows: ${sheetData.rows.length}

Data:
${sheetData.rows.map((row) => row.join(',')).join('\n')}

Please identify:
1. Data type inconsistencies
2. Missing required fields
3. Duplicate entries
4. Format issues (dates, numbers, etc.)
5. Outliers or suspicious values
6. Recommendations for data cleaning

Respond in a structured format with specific examples.`;

    const { text } = await ai.generate(prompt);
    console.log('Data Validation Response:', text);
    return text;
  } catch (error) {
    console.error('Error in validateDataFlow:', error);
    throw error;
  }
});

/**
 * Category Classification Flow
 * Classifies entries into appropriate categories
 */
export const classifyEntryFlow = ai.defineFlow('classifyEntryFlow', async (params: {
  description: string;
  availableCategories: string[];
}) => {
  try {
    const { description, availableCategories } = params;
    
    const prompt = `Classify this entry into the most appropriate category:

Entry description: "${description}"
Available categories: ${availableCategories.join(', ')}

Please:
1. Select the most appropriate category
2. Provide a confidence level (high/medium/low)
3. Suggest any additional subcategories if relevant
4. Explain your reasoning

Respond in JSON format:
{
  "category": "selected_category",
  "confidence": "high|medium|low",
  "subcategory": "optional_subcategory",
  "reasoning": "explanation"
}`;

    const { text } = await ai.generate(prompt);
    console.log('Classification Response:', text);
    
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse classification response:', parseError);
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Error in classifyEntryFlow:', error);
    throw error;
  }
});

/**
 * Summary Generation Flow
 * Generates summaries and reports from sheet data
 */
export const generateSummaryFlow = ai.defineFlow('generateSummaryFlow', async (params: {
  sheetData: SheetData;
  summaryType: 'daily' | 'weekly' | 'monthly' | 'custom';
}) => {
  try {
    const { sheetData, summaryType } = params;
    
    const prompt = `Generate a ${summaryType} summary report for this Google Sheet:

Sheet Name: ${sheetData.sheetName}
Headers: ${sheetData.headers.join(', ')}
Data rows: ${sheetData.rows.length}

Data:
${sheetData.rows.map((row) => row.join(',')).join('\n')}

Please provide:
1. Key metrics and totals
2. Notable trends or patterns
3. Significant changes from previous periods
4. Recommendations or insights
5. Any anomalies or concerns

Format the response as a professional summary report.`;

    const { text } = await ai.generate(prompt);
    console.log('Summary Generation Response:', text);
    return text;
  } catch (error) {
    console.error('Error in generateSummaryFlow:', error);
    throw error;
  }
});

/**
 * Error Handling and Retry Utility
 * Provides robust error handling for AI flows
 */
export const executeWithRetry = async <T>(
  flow: (...args: unknown[]) => Promise<T>,
  args: unknown[],
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await flow(...args);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  throw lastError!;
};

/**
 * Utility function to convert existing sheet data to Genkit format
 */
export const convertToGenkitFormat = (sheetData: (string | number)[][], sheetName: string): SheetData => {
  const headers = sheetData.length > 0 ? sheetData[0].map(String) : [];
  const rows = sheetData.slice(1);
  
  return {
    headers,
    rows,
    sheetName
  };
};

/**
 * Example usage and testing functions
 */
export const testGenkitIntegration = async () => {
  try {
    console.log('Testing Genkit integration...');
    
    // Test basic hello flow
    const helloResult = await helloFlow('Test User');
    console.log('Hello flow result:', helloResult);
    
    // Test with sample data
    const sampleData: SheetData = {
      headers: ['Date', 'Category', 'Amount', 'Description'],
      rows: [
        ['2024-01-01', 'Food', '25.50', 'Lunch'],
        ['2024-01-02', 'Transport', '15.00', 'Fuel'],
        ['2024-01-03', 'Food', '30.00', 'Dinner']
      ],
      sheetName: 'Expenses'
    };
    
    // Test sheet analysis
    const analysisResult = await analyzeSheetFlow(sampleData);
    console.log('Analysis result:', analysisResult);
    
    // Test single sheet update
    const updateResult = await updateSingleSheetFlow({
      transcript: 'Add a coffee expense of $5.50',
      sheetData: sampleData
    });
    console.log('Update result:', updateResult);
    
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Export the AI instance for direct use
export { ai };

// Export types for use in other files
export type {
  SheetData,
  ProcessedUpdate,
  MultiSheetUpdate
}; 