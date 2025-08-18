// Updated genkit/analyzeFileFlow.ts - full file with improved prompt and better handling for inference without user text
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
      const fullPrompt = `Analyze the input to extract structured data for Google Sheet updates. If files are provided, extract text/content from them (use tools like search_pdf_attachment for keyword searches or browse_pdf_attachment for specific pages if needed for deeper analysis). Combine any user text with extracted file content as context.
- Infer target sheet(s) from content (e.g., 'Logbook' for KM/fuel data, 'Food Acomodation' for claims/expenses; group by sheet if multiple inferred). If no clear inference, use the selected/default sheet if provided in context.
- If no user text and only files, proactively extract all tabular/invoice-like data into rows (e.g., dates, amounts, locations from fuel/claim slips).
- Always attempt to extract structured rows even if text is limited—look for patterns like dates, numbers, names, totals.
- Generate preview tables for each sheet, proposing new rows or updates (match existing formats from sheet history if available).
- For multi-file/multi-sheet, process sequentially and group previews in one response.
- Always preview first; do not commit without confirmation.
- If unclear (e.g., no inferable sheet or data), ask for clarification in the response but still attempt best-guess extraction.

IMPORTANT: You MUST respond with valid JSON only. Do not include any explanatory text outside the JSON structure.

INPUT CONTEXT:
- User text: ${prompt}
- Extracted file content: ${extractedContents.map((content, index) => `File ${index + 1} (${content.mimeType}):
${content.extractedText}
---`).join('\n')}
- Selected/Default Sheets (use as fallback): Logbook

Respond with this exact JSON format:
{
  "extracted_rows": [
    {
      "Date": "07/25/2025",
      "Driver": "Neville Young",
      "Reg#": "CG09TYZN",
      "Vehicle": "Vehicle Name",
      "KM Start": "1000",
      "KM End": "1100",
      "Business Km": "100",
      "Prvt Km": "0",
      "Leave Km": "0",
      "Total Km": "100",
      "TOWN VISITED": "Town Name",
      "KM at Filling": "1050",
      "Fuel in liters": "50",
      "Fuel Cost in Rands": "1000.00"
    }
    // Add more rows as extracted
  ],
  "sheets": ["Logbook"],  // Inferred or selected sheets
  "message": "Confirm to commit these updates?"
}`;

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
            cleanedOutput = cleanedOutput.replace(/```json/g, '');
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