
import { genkit } from 'genkit';
import { z } from 'zod';
import { gemini15Flash, gemini15Pro, googleAI } from '@genkit-ai/googleai';
import pdf from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { executeAIWithRetry, executeAIWithModelFallback } from '../lib/aiUtils';

// Helper function to extract text from PDF
async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Try to extract text directly from PDF
    const pdfData = await pdf(buffer);
    let extractedText = pdfData.text;
    
    // If no text was extracted (likely scanned PDF), use OCR
    if (!extractedText || extractedText.trim().length < 50) {
      console.log('No text found in PDF, attempting OCR...');
      
      // For now, we'll use a simpler approach - just return the raw text
      // and let the AI model handle the analysis
      extractedText = 'PDF appears to be scanned or image-based. Text extraction limited.';
    }
    
    return extractedText || 'No text could be extracted from the PDF';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return 'Error extracting text from PDF';
  }
}

// Helper function to extract text from images using OCR
async function extractTextFromImage(base64Data: string): Promise<string> {
  try {
    // Determine the correct MIME type for the data URL
    const { data: { text } } = await Tesseract.recognize(
      `data:image/jpeg;base64,${base64Data}`,
      'eng',
      { logger: m => console.log(m) }
    );
    return text;
  } catch (error) {
    console.error('Error extracting text from image:', error);
    return 'Error extracting text from image';
  }
}

export const analyzeFileFlow = (apiKey: string) => {
  // Create multiple AI configurations with different models for fallback
  const aiConfigs = [
    {
      name: 'gemini-1.5-flash',
      config: genkit({
        plugins: [googleAI({ apiKey })],
        model: gemini15Flash,
      })
    },
    {
      name: 'gemini-1.5-pro',
      config: genkit({
        plugins: [googleAI({ apiKey })],
        model: gemini15Pro,
      })
    }
  ];

  return aiConfigs[0].config.defineFlow(
    {
      name: 'analyzeFileFlow',
      inputSchema: z.object({
        prompt: z.string(),
        files: z.array(z.object({
          data: z.string(), // base64
          mimeType: z.string(),
        })),
      }),
      outputSchema: z.object({
        extracted_rows: z.array(z.record(z.string(), z.string().or(z.number()).or(z.boolean()))).default([]),
        inferredHeaders: z.array(z.string()).optional()
      }).or(z.any()),
    },
    async ({ prompt, files }) => {
      console.log(`🔍 [ANALYZE_FILE_FLOW] Processing ${files.length} files`);
      
      // Extract text content from all files first
      const extractedContents = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`🔍 [ANALYZE_FILE_FLOW] Processing file ${i + 1}: ${file.mimeType}`);
        
        let extractedText = '';
        
        if (file.mimeType === 'application/pdf') {
          console.log(`🔍 [ANALYZE_FILE_FLOW] Extracting text from PDF...`);
          extractedText = await extractTextFromPDF(file.data);
        } else if (file.mimeType.startsWith('image/')) {
          console.log(`🔍 [ANALYZE_FILE_FLOW] Extracting text from image using OCR...`);
          extractedText = await extractTextFromImage(file.data);
        } else {
          console.log(`🔍 [ANALYZE_FILE_FLOW] Unknown file type: ${file.mimeType}`);
          extractedText = 'Unknown file type - cannot extract text';
        }
        
        extractedContents.push({
          fileIndex: i + 1,
          mimeType: file.mimeType,
          extractedText: extractedText,
          textLength: extractedText.length
        });
        
        console.log(`🔍 [ANALYZE_FILE_FLOW] Extracted ${extractedText.length} characters from file ${i + 1}`);
      }
      
      // Create a comprehensive prompt with extracted text
      const fullPrompt = `You are an expert data analyst that extracts tabular fuel/expense entries suitable for Google Sheets. A user has uploaded ${files.length} file(s) and asked the following:

"${prompt}"

EXTRACTED TEXT CONTENT:
${extractedContents.map((content, index) => `File ${index + 1} (${content.mimeType}):
${content.extractedText}
---`).join('\n\n')}

Your task is to analyze the extracted text content and return a STRICT JSON with an array of normalized row objects in a top-level field named "extracted_rows". Normalize values:
- Dates: DD/MM/YY or ISO YYYY-MM-DD
- Amounts and numbers: plain decimals without currency symbols
Return ONLY JSON, no markdown.

IMPORTANT INSTRUCTIONS:
1. Parse each file and identify entries relevant for spreadsheet rows.
2. Normalize keys to common spreadsheet headers if present: ["Date","Driver","Reg#","Vehicle","KM Start","KM End","Business Km","Prvt Km","Leave Km","Total Km","TOWN VISITED","CLIENT SEEN","CLIENT CALLED","PHONE NUMBER","DETAILS OF VISIT","KM at Filling","Fuel in liters","Fuel Cost in Rands","SALES MADE"]
3. Always infer logical headers from content if not explicit (e.g., Date, Amount, Description).
4. Return ONLY raw JSON without markdown or explanations.
5. If nothing can be extracted, return { "extracted_rows": [] }.

Example output format (RETURN EXACTLY JSON, no code fences):
{
  "extracted_rows": [
    {
      "Date": "25/07/25",
      "Reg#": "NR33581",
      "TOWN VISITED": "Glenfair Service Station & Daventry Roads",
      "Fuel in liters": "50",
      "Fuel Cost in Rands": "685.50"
    }
  ],
  "inferredHeaders": ["Date", "Reg#", "TOWN VISITED", "Fuel in liters", "Fuel Cost in Rands"]
}

Analyze the extracted text content and extract relevant data in JSON format.`;

      try {
        console.log('🔍 [ANALYZE_FILE_FLOW] Attempting to generate content with multiple models...');
        console.log('🔍 [ANALYZE_FILE_FLOW] Prompt length:', fullPrompt.length);
        console.log('🔍 [ANALYZE_FILE_FLOW] Total extracted text length:', extractedContents.reduce((sum, content) => sum + content.textLength, 0));
        
        // Create multiple AI operations for fallback
        const aiOperations = aiConfigs.map(config => 
          () => config.config.generate(fullPrompt)
        );
        
        // Use the fallback strategy with multiple models
        const { text } = await executeAIWithModelFallback(
          aiOperations,
          'File analysis with AI models'
        );
        
        console.log('🔍 [ANALYZE_FILE_FLOW] Genkit model generation successful.');
        console.log('🔍 [ANALYZE_FILE_FLOW] Response length:', text?.length || 0);
        console.log('🔍 [ANALYZE_FILE_FLOW] Response preview:', text?.substring(0, 200) || 'No response');

        if (!text) {
          throw new Error('No output from model');
        }
        
        const output = text;
        
        try {
          // Clean up the output to remove markdown formatting if present
          let cleanedOutput = output;
          
          // Remove markdown code blocks if present
          if (cleanedOutput.includes('```json')) {
            cleanedOutput = cleanedOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          }
          
          // Remove any leading/trailing whitespace
          cleanedOutput = cleanedOutput.trim();
          
          // Attempt to parse the cleaned output as JSON
          const parsedResult = typeof cleanedOutput === 'string' ? JSON.parse(cleanedOutput) : cleanedOutput;
          
          console.log('🔍 [ANALYZE_FILE_FLOW] Successfully parsed JSON result');
          const rowsCount = Array.isArray((parsedResult as any).extracted_rows) ? (parsedResult as any).extracted_rows.length : 0;
          console.log('🔍 [ANALYZE_FILE_FLOW] Extracted rows count:', rowsCount);
          
          // Enforce schema shape gently: ensure top-level extracted_rows exists
          if (!parsedResult || typeof parsedResult !== 'object' || !Array.isArray((parsedResult as any).extracted_rows)) {
            return { extracted_rows: [] };
          }
          return parsedResult as { extracted_rows: unknown[] };
        } catch (parseError) {
          console.error('🔍 [ANALYZE_FILE_FLOW] Failed to parse model output as JSON:', parseError);
          console.error('🔍 [ANALYZE_FILE_FLOW] Raw output:', output);
          
          // If parsing fails, return a structured error indicating the raw output
          return {
            error: 'Model output was not valid JSON',
            rawOutput: output,
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            extracted_data: [] // Return empty array as fallback
          };
        }
      } catch (error) {
        console.error('🔍 [ANALYZE_FILE_FLOW] All models failed:', error);
        throw error;
      }
    }
  );
};
