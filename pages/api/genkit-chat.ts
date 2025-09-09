import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    // Accommodate base64-encoded uploads
    bodyParser: { sizeLimit: '128mb' },
  },
};

// 🚀 UNIFIED FILE PROCESSOR
// Enhanced for better Gemini Vision analysis and robust error handling
// - More comprehensive prompts for image analysis
// - Fallback data when Gemini returns empty results
// - Better error handling with graceful degradation
// - Improved logging for debugging
interface UnifiedFileProcessor {
  processFile(file: any, sheetContext: string): Promise<any>;
  extractText(file: any): Promise<string>;
  createStructuredPrompt(fileType: string, extractedText: string, sheetContext: string): string;
  parseAIResponse(response: string): any;
}

class GeminiFileProcessor implements UnifiedFileProcessor {
  private model: any;
  
  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async processFile(file: any, sheetContext: string): Promise<any> {
    console.log(`🤖 [UNIFIED PROCESSOR] Processing ${file.name} (${file.mimeType})`, {
      hasData: !!file.data,
      dataLength: file.data ? file.data.length : 0,
      hasExtractedData: !!file.extractedData,
      extractedTextLength: file.extractedData?.extractedText?.length || 0,
      extractedDataType: file.extractedData?.type
    });
    
    try {
      // Step 1: Extract text content from file
      const extractedText = await this.extractText(file);
      
      console.log(`📝 [UNIFIED PROCESSOR] Extracted text from ${file.name}:`, {
        textLength: extractedText?.length || 0,
        textSample: extractedText ? extractedText.substring(0, 100) + '...' : 'none'
      });
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.log(`⏭️ [UNIFIED PROCESSOR] No extractable text from ${file.name}`);
        return {
          success: false,
          error: 'No extractable text content'
        };
      }

      // Step 2: Create appropriate prompt based on file type
      const prompt = this.createStructuredPrompt(file.mimeType, extractedText, sheetContext);
      
      // Step 3: Send to Gemini API
      const structuredData = await this.sendToGemini(file, prompt, extractedText);
      
      return {
        success: true,
        structuredData,
        extractedText,
        textLength: extractedText.length
      };
      
    } catch (error) {
      console.error(`❌ [UNIFIED PROCESSOR] Failed to process ${file.name}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async extractText(file: any): Promise<string> {
    if (file.firebaseUrl) {
      // Fetch file from Firebase Storage
      try {
        const response = await fetch(file.firebaseUrl);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
        
        if (file.mimeType === 'application/pdf') {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const pdf = (await import('pdf-parse')).default;
          const pdfData = await pdf(buffer);
          return pdfData.text || 'No text could be extracted from the PDF';
        } else if (file.mimeType.startsWith('image/')) {
          // For images, return placeholder - Gemini Vision will handle the URL
          return `Image: ${file.name} - Ready for Gemini Vision analysis`;
        } else {
          return await response.text();
        }
      } catch (error) {
        console.error(`Failed to fetch file from Firebase: ${error}`);
        throw error;
      }
    }
    
    // Handle different file types with unified extraction logic
    if (file.mimeType === 'application/pdf') {
      // For PDFs, use already extracted text from the main processing loop
      if (file.extractedData?.extractedText && file.extractedData.extractedText.length > 0) {
        console.log(`📄 [UNIFIED PROCESSOR] Using pre-extracted PDF text for ${file.name} (${file.extractedData.extractedText.length} chars)`);
        return file.extractedData.extractedText;
      }
      // Fallback to re-extraction if needed
      return await this.extractPDFText(file);
    } else if (file.mimeType.startsWith('image/')) {
      return await this.extractImageText(file);
    } else if (file.mimeType === 'text/csv') {
      return await this.extractCSVText(file);
    } else {
      // For other text-based files, use existing extracted text
      return file.extractedData?.extractedText || '';
    }
  }

  private async extractPDFText(file: any): Promise<string> {
    try {
      console.log(`🔍 [UNIFIED PROCESSOR] Extracting text from PDF: ${file.name}`);
      const pdf = (await import('pdf-parse')).default;
      const pdfBase64Data = file.data || file.extractedData?.fileData;
      
      if (!pdfBase64Data) {
        throw new Error('No PDF data available for text extraction');
      }
      
      const buffer = Buffer.from(pdfBase64Data, 'base64');
      const pdfData = await pdf(buffer);
      return pdfData.text || 'No text could be extracted from the PDF';
    } catch (error) {
      console.error(`❌ [UNIFIED PROCESSOR] PDF extraction failed for ${file.name}:`, error);
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractImageText(file: any): Promise<string> {
    // For images, we'll use Gemini Vision to extract text
    // This is handled in the main processing flow
    return `Image: ${file.name} - Ready for Gemini Vision analysis`;
  }

  private async extractCSVText(file: any): Promise<string> {
    // For CSV files, use the already extracted structured data
    if (file.extractedData?.headers && file.extractedData?.rows) {
      const headers = file.extractedData.headers.join(', ');
      const sampleRows = file.extractedData.rows.slice(0, 3).map((row: string[]) => row.join(', '));
      return `CSV with headers: ${headers}. Sample rows: ${sampleRows.join('; ')}`;
    }
    return file.extractedData?.extractedText || '';
  }

  createStructuredPrompt(fileType: string, extractedText: string, sheetContext: string): string {
    // Enhanced base prompt for better extraction
    const basePrompt = `Analyze this ${fileType} and extract any structured data you can find. Be comprehensive and look for:

1. **Financial Data**: amounts, prices, totals, costs, payments
2. **Dates**: any dates in various formats (normalize to YYYY-MM-DD)
3. **Names/Entities**: people, companies, vendors, organizations
4. **Categories**: infer logical categories (Food, Travel, Utilities, etc.)
5. **Numbers**: quantities, measurements, IDs, codes
6. **Addresses**: locations, addresses, contact information
7. **Text Content**: important text, labels, descriptions

Output as a valid JSON array of objects. Each object should have relevant keys based on what you find.
If you find multiple different types of data, create separate objects for each logical group.
If no structured data is found, return an empty array [].

Example formats:
- [{"type": "receipt", "vendor": "Store Name", "amount": 25.99, "date": "2024-01-15"}]
- [{"type": "contact", "name": "John Doe", "phone": "555-0123"}]
- [{"type": "measurement", "width": 10, "height": 20, "unit": "inches"}]

Context from existing sheet data:
${sheetContext}

Content: ${extractedText}`;

    // More flexible image prompt
    if (fileType.startsWith('image/')) {
      return `You are an expert at analyzing images and extracting structured information. Look at this image carefully and extract any meaningful data you can find.

Focus on:
• Text content and labels
• Numbers and measurements
• Names and identifiers
• Dates and times
• Financial information
• Contact details
• Any structured or tabular data
• Charts, graphs, or visual data
• Forms, receipts, invoices, documents
• Screenshots, interfaces, or displays

Be creative but accurate - if you see something that could be structured data, extract it.
Return the data as a JSON array of objects with appropriate keys and values.

${basePrompt}`;
    }

    return basePrompt;
  }

  async sendToGemini(file: any, prompt: string, extractedText: string): Promise<any> {
    try {
      let result;

      if (file.mimeType.startsWith('image/') && file.firebaseUrl) {
        // Use Gemini Vision API with Firebase URL
        console.log(`🖼️ [UNIFIED PROCESSOR] Using Gemini Vision with Firebase URL for ${file.name}`);
        console.log(`🔗 [VISION] Firebase URL: ${file.firebaseUrl}`);

        // Download the image from Firebase and send as base64 to Gemini
        console.log(`📥 [VISION] Downloading image from Firebase for Gemini processing...`);
        const imageResponse = await fetch(file.firebaseUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');

        // Send to Gemini with base64 data
        result = await this.model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType: file.mimeType,
              data: imageBase64
            }
          }
        ]);
      } else {
        // Use Gemini Text API for text-based files
        console.log(`📝 [UNIFIED PROCESSOR] Using Gemini Text for ${file.name}`);
        result = await this.model.generateContent(prompt);
      }

      const response = result.response;
      const text = response.text();

      // 🚀 ENHANCED LOGGING: Log the AI reasoning process
      console.log('🚀 [AI REASONING] Unified Gemini Processing:', {
        fileName: file.name,
        mimeType: file.mimeType,
        usingVision: file.mimeType.startsWith('image/') && file.firebaseUrl,
        promptLength: prompt.length,
        responseLength: text.length,
        rawResponse: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        hasJson: text.includes('{') && text.includes('}'),
        timestamp: new Date().toISOString()
      });

      return this.parseAIResponse(text);

    } catch (error) {
      console.error(`❌ [UNIFIED PROCESSOR] Gemini API call failed for ${file.name}:`, error);
      // Return a basic fallback response instead of throwing
      console.log(`⚠️ [FALLBACK] Gemini failed, using fallback data for ${file.name}`);
      return {
        success: false,
        error: `Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fallbackData: [{
          type: 'processing_error',
          fileName: file.name,
          mimeType: file.mimeType,
          error: error instanceof Error ? error.message : 'Unknown error',
          processedAt: new Date().toISOString()
        }]
      };
    }
  }

  parseAIResponse(response: string): any {
    try {
      // Try to extract JSON from markdown code blocks first
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        console.log('🚀 [AI REASONING] Successfully parsed JSON from markdown block');
        return parsed;
      }
      
      // Try direct JSON parsing
      const parsed = JSON.parse(response);
      console.log('🚀 [AI REASONING] Successfully parsed direct JSON response');
      return parsed;
      
    } catch (jsonError) {
      console.error('❌ [UNIFIED PROCESSOR] Failed to parse AI response:', jsonError);
      console.error('Raw response:', response);
      return { rawText: response, parseError: jsonError instanceof Error ? jsonError.message : 'Unknown error' };
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Replace the images processing with Firebase URL processing
    const { message, context, conversationHistory, fileUrls } = req.body || {};

    if ((!message || message === '') && (!fileUrls || fileUrls.length === 0)) {
      return res.status(400).json({ error: 'Message or files are required' });
    }

    // Send headers + one sample row per sheet to provide context without duplication
    const sheetInfo: Record<string, { headers: string[], sampleRows?: string[][] }> = {};
    let sheetContextString = '';

    if (context?.sheetData) {
      console.log('🔍 [N8N] Context sheetData received:', Object.keys(context.sheetData));
      for (const [sheetName, sheetData] of Object.entries(context.sheetData)) {
        console.log(`🔍 [N8N] Processing sheet: ${sheetName}`, {
          isArray: Array.isArray(sheetData),
          length: Array.isArray(sheetData) ? sheetData.length : 'N/A',
          firstRowIsArray: Array.isArray(sheetData) && sheetData.length > 0 ? Array.isArray(sheetData[0]) : false
        });
        if (Array.isArray(sheetData) && sheetData.length > 0 && Array.isArray(sheetData[0])) {
          const headers = sheetData[0].map((h: any) => String(h ?? ''));
          
          // Filter out total rows (row 3) when processing data for N8N
          const dataRowsOnly = sheetData.filter((_, index) => index !== 0 && index !== 2); // Skip header (0) and total row (2)
          
          // Get the last 3 data rows as sample data (excluding totals)
          const sampleRows = dataRowsOnly.length > 0 ?
            dataRowsOnly.slice(-3).map((row: any) =>
              Array.isArray(row) ? row.map((cell: any) => String(cell ?? '')) : []
            ) : [];
          
          // Only include sampleRows if there are actual sample rows
          const sheetDataForN8N: any = {
            headers: headers
          };
          
          if (sampleRows.length > 0) {
            sheetDataForN8N.sampleRows = sampleRows;
          }
          
          sheetInfo[sheetName] = sheetDataForN8N;
          console.log(`✅ [N8N] Added data for ${sheetName}:`, {
            headerCount: headers.length,
            sampleRowsCount: sampleRows.length,
            hasSampleRows: sampleRows.length > 0,
            totalRowsFiltered: sheetData.length - dataRowsOnly.length - 1 // -1 for header
          });

          sheetContextString += `\nSheet Name: ${sheetName}\nHeaders: ${headers.join(', ')}`;
          if (sampleRows.length > 0) {
            sheetContextString += `\nSample Rows:\n`;
            sampleRows.forEach(row => {
              sheetContextString += `- ${row.join(', ')}\n`;
            });
          } else {
            sheetContextString += `\nNo sample rows available (sheet has only headers)`;
          }

        } else {
          console.log(`❌ [N8N] Skipped ${sheetName} - invalid data structure`);
        }
      }
    } else {
      console.log('❌ [N8N] No context.sheetData received');
    }

    // Process Firebase URLs instead of base64 data
    const extractedFileContents = [];

    if (fileUrls && fileUrls.length > 0) {
      console.log(`🔍 [BACKEND] Processing ${fileUrls.length} files from Firebase Storage`);
      
      for (const fileInfo of fileUrls) {
        console.log(`🔍 [BACKEND] Processing file: ${fileInfo.name} (${fileInfo.mimeType})`);
        
        let processedFile = {
          type: fileInfo.mimeType,
          name: fileInfo.name,
          mimeType: fileInfo.mimeType,
          // Store Firebase URL for Gemini to fetch
          firebaseUrl: fileInfo.downloadURL,
          size: fileInfo.size,
          extractedData: {
            type: 'firebase_storage',
            fileName: fileInfo.name,
            mimeType: fileInfo.mimeType,
            fileSize: fileInfo.size,
            firebaseUrl: fileInfo.downloadURL,
            extractedText: '',
            textLength: 0,
            hasTextContent: false,
            geminiStructuredData: null as any,
            geminiProcessed: false,
            geminiError: null
          }
        };

        extractedFileContents.push(processedFile);
      }
    }

    //  UNIFIED PROCESSING: Replace the fragmented Gemini processing with unified approach
    if (extractedFileContents.length > 0) {
      console.log('🤖 [UNIFIED PROCESSOR] Processing all files with unified Gemini processor...');
      
      // Check if API key is available
      if (!process.env.GOOGLE_GENAI_API_KEY) {
        console.error('Missing GOOGLE_GENAI_API_KEY environment variable');
        return res.status(500).json({ 
          error: 'Gemini API key not configured',
          details: 'Please ensure GOOGLE_GENAI_API_KEY is set in your environment variables'
        });
      }

      try {
        const processor = new GeminiFileProcessor(process.env.GOOGLE_GENAI_API_KEY);
        
        // Process all files with the unified processor
        for (const fileContent of extractedFileContents) {
          console.log(`🤖 [UNIFIED PROCESSOR] Starting processing for ${fileContent.name}`);
          
          // Skip files that already have extracted text (like PDFs that were processed above)
          if (fileContent.extractedData?.extractedText && fileContent.extractedData.extractedText.length > 0 && 
              fileContent.mimeType === 'application/pdf') {
            console.log(`⏭️ [UNIFIED PROCESSOR] Skipping ${fileContent.name} - PDF text already extracted (${fileContent.extractedData.extractedText.length} chars)`);
            
            // Still process with Gemini to get structured data
            const result = await processor.processFile(fileContent, sheetContextString);

            if (result.success) {
              fileContent.extractedData.geminiStructuredData = result.structuredData;
              fileContent.extractedData.geminiProcessed = true;
            } else {
              // Handle PDF processing errors with fallback data
              console.error(`❌ [PDF PROCESSOR] Failed to process PDF ${fileContent.name}:`, result.error);
              if (result.fallbackData) {
                fileContent.extractedData.geminiStructuredData = result.fallbackData;
              } else {
                fileContent.extractedData.geminiStructuredData = [{
                  type: 'pdf_processing_error',
                  fileName: fileContent.name,
                  mimeType: fileContent.mimeType,
                  error: result.error,
                  processedAt: new Date().toISOString()
                }];
              }
              fileContent.extractedData.geminiError = result.error;
              fileContent.extractedData.geminiProcessed = false;
            }
            continue;
          }
          
          const result = await processor.processFile(fileContent, sheetContextString);

          if (result.success) {
            // Handle empty structured data gracefully
            const structuredData = result.structuredData || [];

            // If we got empty structured data but have text content, create basic metadata
            if (Array.isArray(structuredData) && structuredData.length === 0 && result.textLength > 0) {
              // Create a basic fallback object with extracted information
              const fallbackData = [{
                type: fileContent.mimeType.startsWith('image/') ? 'image_analysis' : 'document_analysis',
                fileName: fileContent.name,
                mimeType: fileContent.mimeType,
                extractedTextLength: result.textLength,
                hasContent: true,
                analysisTimestamp: new Date().toISOString(),
                source: 'gemini_fallback'
              }];
              console.log(`⚠️ [FALLBACK] Gemini returned empty data, using fallback for ${fileContent.name}:`, fallbackData);
              fileContent.extractedData.geminiStructuredData = fallbackData;
            } else if (Array.isArray(structuredData) && structuredData.length > 0) {
              console.log(`✅ [SUCCESS] Gemini extracted real data for ${fileContent.name}:`, structuredData);
              fileContent.extractedData.geminiStructuredData = structuredData;
            } else {
              // Handle case where structuredData is not an array or is null
              const basicData = [{
                type: 'basic_analysis',
                fileName: fileContent.name,
                mimeType: fileContent.mimeType,
                extractedTextLength: result.textLength || 0,
                processedAt: new Date().toISOString(),
                source: 'basic_fallback'
              }];
              console.log(`⚠️ [FALLBACK] Using basic fallback for ${fileContent.name}:`, basicData);
              fileContent.extractedData.geminiStructuredData = basicData;
            }

            fileContent.extractedData.geminiProcessed = true;
            fileContent.extractedData.extractedText = result.extractedText;
            fileContent.extractedData.textLength = result.textLength;
            fileContent.extractedData.hasTextContent = result.textLength > 0;

            console.log(`✅ [UNIFIED PROCESSOR] Successfully processed ${fileContent.name}:`, {
              structuredDataType: Array.isArray(fileContent.extractedData.geminiStructuredData) ? 'array' : typeof fileContent.extractedData.geminiStructuredData,
              structuredDataLength: Array.isArray(fileContent.extractedData.geminiStructuredData) ? fileContent.extractedData.geminiStructuredData.length : 'N/A',
              textLength: result.textLength,
              hasFallbackData: Array.isArray(fileContent.extractedData.geminiStructuredData) && fileContent.extractedData.geminiStructuredData.length > 0 && fileContent.extractedData.geminiStructuredData[0]?.source === 'gemini_fallback'
            });
          } else {
            // Handle processing errors with fallback data
            console.error(`❌ [UNIFIED PROCESSOR] Failed to process ${fileContent.name}:`, result.error);

            // Use fallback data if available, otherwise create basic error metadata
            if (result.fallbackData) {
              console.log(`⚠️ [FALLBACK] Using fallback data for ${fileContent.name}:`, result.fallbackData);
              fileContent.extractedData.geminiStructuredData = result.fallbackData;
            } else {
              fileContent.extractedData.geminiStructuredData = [{
                type: 'processing_error',
                fileName: fileContent.name,
                mimeType: fileContent.mimeType,
                error: result.error,
                processedAt: new Date().toISOString()
              }];
            }

            fileContent.extractedData.geminiError = result.error;
            fileContent.extractedData.geminiProcessed = false;

            // Still mark as having some data for processing
            fileContent.extractedData.extractedText = result.extractedText || `Error processing ${fileContent.name}`;
            fileContent.extractedData.textLength = result.textLength || fileContent.name.length;
            fileContent.extractedData.hasTextContent = true;
          }
        }
        
        // 🚀 ENHANCED LOGGING: Log the unified processing summary
        console.log('🤖 [UNIFIED PROCESSOR] Processing Summary:', {
          totalFiles: extractedFileContents.length,
          successfulFiles: extractedFileContents.filter(f => f.extractedData?.geminiProcessed).length,
          failedFiles: extractedFileContents.filter(f => f.extractedData?.geminiError).length,
          fileResults: extractedFileContents.map(f => ({
            name: f.name,
            mimeType: f.mimeType,
            success: f.extractedData?.geminiProcessed || false,
            error: f.extractedData?.geminiError || null,
            dataType: f.extractedData?.geminiStructuredData ? 
              (Array.isArray(f.extractedData.geminiStructuredData) ? 'array' : typeof f.extractedData.geminiStructuredData) : 'none',
            dataLength: f.extractedData?.geminiStructuredData ? 
              (Array.isArray(f.extractedData.geminiStructuredData) ? f.extractedData.geminiStructuredData.length : 'N/A') : 'none'
          }))
        });
        
      } catch (error) {
        console.error('❌ [UNIFIED PROCESSOR] Failed to initialize unified processor:', error);
        return res.status(500).json({ 
          error: 'Failed to process files with unified processor',
          details: (error as Error).message
        });
      }
    }

    const initialFileSummary = {
      totalFiles: extractedFileContents.length,
      fileTypes: extractedFileContents.map((f: any) => f.type),
      hasStructuredData: extractedFileContents.some((f: any) => f.extractedData?.type === 'structured'),
      hasTextData: extractedFileContents.some((f: any) => f.extractedData?.extractedText && f.extractedData.extractedText.length > 0),
      hasMetadata: extractedFileContents.some((f: any) => f.extractedData?.type === 'metadata' || f.extractedData?.type === 'document' || f.extractedData?.type === 'image'),
      totalTextLength: extractedFileContents.reduce((sum: number, f: any) => sum + (f.extractedData?.textLength || 0), 0),
      filesWithText: extractedFileContents.filter((f: any) => f.extractedData?.extractedText && f.extractedData.extractedText.length > 0).length,
      needsBackendProcessing: extractedFileContents.some((f: any) => f.extractedData?.needsBackendProcessing === true),
      // Gemini processing information
      geminiProcessed: extractedFileContents.filter((f: any) => f.extractedData?.geminiProcessed === true).length,
      geminiErrors: extractedFileContents.filter((f: any) => f.extractedData?.geminiError).length,
      hasGeminiStructuredData: extractedFileContents.some((f: any) => f.extractedData?.geminiStructuredData)
    };

    // Debug logging to understand the data structure
    console.log('🔍 [DEBUG] Checking structuredExtracts data structure:');
    extractedFileContents.forEach((f: any, index: number) => {
      console.log(`🔍 [DEBUG] File ${index} (${f.name}):`, {
        hasExtractedData: !!f.extractedData,
        hasGeminiData: !!f.extractedData?.geminiStructuredData,
        dataType: typeof f.extractedData?.geminiStructuredData,
        isArray: Array.isArray(f.extractedData?.geminiStructuredData),
        data: f.extractedData?.geminiStructuredData
      });
    });

    const structuredExtracts = extractedFileContents
      .filter((f: any) => {
        const hasData = f.extractedData?.geminiStructuredData;
        console.log(`🔍 [FILTER] ${f.name}: hasData=${!!hasData}`);
        return !!hasData; // Include ANY file that has geminiStructuredData
      })
      .map((f: any) => ({
        fileName: f.name,
        mimeType: f.mimeType,
        structuredData: f.extractedData.geminiStructuredData,
        hasRealData: Array.isArray(f.extractedData.geminiStructuredData) ?
          f.extractedData.geminiStructuredData.some((item: any) =>
            item && item.source !== 'gemini_fallback' && item.type !== 'processing_error'
          ) : false
      }));

    console.log(`🔍 [DEBUG] Final structuredExtracts result:`, {
      count: structuredExtracts.length,
      files: structuredExtracts.map(se => ({
        fileName: se.fileName,
        dataType: Array.isArray(se.structuredData) ? 'array' : typeof se.structuredData,
        dataLength: Array.isArray(se.structuredData) ? se.structuredData.length : 'N/A',
        hasRealData: se.hasRealData,
        sampleData: se.structuredData
      }))
    });

    // 🚀 ENHANCED LOGGING: Log the final data being sent to N8N
    console.log('🚀 [AI REASONING] Final Data Summary for AI Processing:', {
      totalFiles: extractedFileContents.length,
      fileDetails: extractedFileContents.map((f: any) => ({
        name: f.name,
        mimeType: f.mimeType,
        type: f.extractedData?.type,
        hasGeminiData: !!f.extractedData?.geminiStructuredData,
        geminiDataType: f.extractedData?.geminiStructuredData ? 
          (Array.isArray(f.extractedData.geminiStructuredData) ? 'array' : typeof f.extractedData.geminiStructuredData) : 'none',
        geminiDataLength: f.extractedData?.geminiStructuredData ? 
          (Array.isArray(f.extractedData.geminiStructuredData) ? f.extractedData.geminiStructuredData.length : 'N/A') : 'none',
        sampleGeminiData: f.extractedData?.geminiStructuredData ? 
          (Array.isArray(f.extractedData.geminiStructuredData) ? 
            f.extractedData.geminiStructuredData.slice(0, 1) : 
            f.extractedData.geminiStructuredData) : 'none'
      })),
      sheetContext: {
        sheetCount: Object.keys(sheetInfo).length,
        sheetNames: Object.keys(sheetInfo),
        totalHeaders: Object.values(sheetInfo).reduce((sum: number, sheet: any) => 
          sum + (sheet.headers?.length || 0), 0),
        sampleHeaders: Object.values(sheetInfo).slice(0, 2).map((sheet: any) => 
          (sheet as any).headers?.slice(0, 5) || [])
      },
      conversationHistory: {
        message_count: conversationHistory?.length || 0,
        recentMessages: conversationHistory?.slice(-3).map((m: any) => ({
          role: m.role,
          contentLength: m.content?.length || 0,
          contentSample: m.content?.substring(0, 100) + '...'
        })) || []
      }
    });

    // Prepare the final payload for the N8N webhook with simplified data
    const webhookData = {
      message: message || '',
      // Remove raw text completely - only send structured data
      selectedSheets: context?.sheetNames || [],
      sheetInfo: sheetInfo, // Send headers + one sample row per sheet to provide context without duplication
      conversationHistory: conversationHistory ? conversationHistory.slice(-5) : [], // Max 5 recent messages
      // Enhanced file information for better AI processing
      fileSummary: {
        totalFiles: initialFileSummary.totalFiles,
        hasGeminiStructuredData: initialFileSummary.hasGeminiStructuredData,
        geminiErrors: initialFileSummary.geminiErrors,
      },
      structuredExtracts: structuredExtracts, // Add this new field with one entry per file
    };

    console.log('🚀 [N8N] Final webhook data being sent:', {
      message: webhookData.message,
      selectedSheets: webhookData.selectedSheets,
      sheetInfoKeys: Object.keys(webhookData.sheetInfo),
      sheetDataStructure: Object.fromEntries(
        Object.entries(webhookData.sheetInfo).map(([name, sheetData]) => [
          name,
          {
            headerCount: (sheetData as any).headers?.length || 0,
            sampleRowsCount: (sheetData as any).sampleRows?.length || 0,
            hasSampleRows: !!(sheetData as any).sampleRows
          }
        ])
      ),
      conversationHistoryLength: webhookData.conversationHistory.length,
      fileInfo: {
        totalFiles: webhookData.fileSummary.totalFiles,
        hasGeminiStructuredData: webhookData.fileSummary.hasGeminiStructuredData,
        geminiErrors: webhookData.fileSummary.geminiErrors,
        structuredExtractsCount: webhookData.structuredExtracts?.length || 0,
        structuredExtractsFiles: webhookData.structuredExtracts?.map((extract: any) => ({
          fileName: extract.fileName,
          hasRealData: extract.hasRealData,
          dataCount: extract.structuredData?.length || 0
        })) || []
      }
    });

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error('❌ [N8N] N8N_WEBHOOK_URL is not configured in the environment.');
      
      // Fallback: Return basic processing results without N8N
      if (extractedFileContents.length > 0) {
        console.log('🔄 [FALLBACK] N8N not available, returning basic file processing results');
        
        const basicResults = extractedFileContents.map(file => ({
          fileName: file.name,
          mimeType: file.mimeType,
          processed: file.extractedData?.geminiProcessed || false,
          hasStructuredData: !!file.extractedData?.geminiStructuredData,
          dataLength: file.extractedData?.geminiStructuredData ? 
            (Array.isArray(file.extractedData.geminiStructuredData) ? file.extractedData.geminiStructuredData.length : 'N/A') : 0
        }));
        
        return res.status(200).json({
          intent: 'extraction',
          reasoning: `Successfully processed ${extractedFileContents.length} file(s) with basic AI analysis. The advanced AI service is currently unavailable.`,
          tables: basicResults.map(result => ({
            title: `File Analysis: ${result.fileName}`,
            headers: ['Property', 'Value'],
            rows: [
              ['File Name', result.fileName],
              ['Type', result.mimeType],
              ['Processed', result.processed ? 'Yes' : 'No'],
              ['Has Structured Data', result.hasStructuredData ? 'Yes' : 'No'],
              ['Data Length', result.dataLength]
            ],
            summary: `Basic analysis completed for ${result.fileName}`,
            meta: {
              sheetName: '',
              operations: { add: 0, update: 0 },
              requiresConfirmation: false,
              isDryRun: true
            }
          })),
          clarifyQuestion: 'The advanced AI service is currently unavailable. Would you like to try again later?',
          insights: [
            'Files were processed with basic AI analysis.',
            'Advanced features like data insertion require the AI service to be available.',
            'Try again in a few minutes when the service is restored.'
          ],
        });
      }
      
      throw new Error('N8N webhook service is not configured.');
    }

    console.log('🔍 [N8N] Using webhook URL:', n8nWebhookUrl);

    // Log the action as requested
    console.log('🚀 [N8N] Using n8n for AI processing. Calling webhook...');

    // Log payload size for debugging
    const payloadString = JSON.stringify(webhookData, null, 0);
    const payloadSizeKB = Math.round(payloadString.length / 1024);
    console.log(`🔍 [N8N] Payload size: ${payloadSizeKB} KB`);

    // Track timing for performance monitoring
    const startTime = Date.now();
    console.log(`⏱️ [N8N] Starting webhook call at: ${new Date(startTime).toISOString()}`);

    // Call the N8N webhook with retry mechanism and better timeout handling
    // Note: Using 90-second timeout to match N8N configuration
    // This accounts for batch mode, queuing, and production network latency
    let n8nResponse;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`🔄 [N8N] Attempt ${retryCount + 1} of ${maxRetries + 1}`);
        
        n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(webhookData, null, 0), // Remove redundant fields and minify JSON to lighten payload
          signal: AbortSignal.timeout(90000), // 90 seconds to match N8N configuration
        });
        
        // If we get here, the request was successful
        break;
        
      } catch (fetchError) {
        retryCount++;
        console.error(`❌ [N8N] Fetch attempt ${retryCount} failed:`, fetchError);
        
        // Handle specific timeout errors
        if (fetchError instanceof Error && fetchError.name === 'TimeoutError') {
                     if (retryCount > maxRetries) {
             return res.status(200).json({
               reasoning: 'The AI service is taking longer than expected to process your request. This might be due to the complexity of the files or high server load.',
               clarifyQuestion: 'Would you like to try again with a simpler request, or wait a moment and try again?',
               insights: [
                 'Request timed out after 90 seconds on all retry attempts. This is common with complex file processing.',
                 'Try breaking down your request into smaller parts or wait a few minutes before retrying.',
                 'If the problem persists, the AI service might be experiencing high load.'
               ],
             });
           }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // Handle network errors
        if (fetchError instanceof Error && fetchError.message.includes('fetch failed')) {
          if (retryCount > maxRetries) {
            return res.status(200).json({
              reasoning: 'Unable to connect to the AI service after multiple attempts. This might be due to a temporary network issue or the service being unavailable.',
              clarifyQuestion: 'Please check your internet connection and try again. If the problem persists, the AI service might be temporarily unavailable.',
              insights: [
                'Network connection to the AI service failed on all retry attempts.',
                'This could be due to internet connectivity issues or the service being down.',
                'Try again in a few minutes or contact support if the problem continues.'
              ],
            });
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // For other errors, don't retry
        throw fetchError;
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`⏱️ [N8N] Webhook call completed in: ${duration}ms (${Math.round(duration/1000)}s)`);

    // Ensure n8nResponse is defined (should always be true after successful fetch)
    if (!n8nResponse) {
      console.error('❌ [N8N] n8nResponse is undefined after successful fetch');
      return res.status(500).json({
        error: 'Unexpected error: Response object is undefined',
        details: 'This should not happen. Please try again or contact support.'
      });
    }

    if (!n8nResponse.ok) {
      const errorBody = await n8nResponse.text();
      console.error(`❌ [N8N] Webhook call failed with status ${n8nResponse.status}:`, errorBody);
      console.error(`❌ [N8N] Error details:`, {
        status: n8nResponse.status,
        statusText: n8nResponse.statusText,
        headers: Object.fromEntries(n8nResponse.headers.entries()),
        duration: `${endTime - startTime}ms`,
        payloadSize: `${payloadSizeKB} KB`
      });

      // Provide a user-friendly error for common issues like the workflow being inactive
      if (n8nResponse.status === 404) {
        return res.status(200).json({
          reasoning: 'The AI service is currently unavailable. Please ensure the workflow is active and try again.',
          clarifyQuestion: 'The AI service seems to be offline. Would you like to try again?',
          insights: ['N8N webhook returned a 404 Not Found error.'],
        });
      }

      // Handle 504 Gateway Timeout specifically
      if (n8nResponse.status === 504) {
        return res.status(200).json({
          reasoning: 'The AI service is taking longer than expected to process your request. This might be due to the complexity of the files or high server load.',
          clarifyQuestion: 'Would you like to try again with a simpler request, or wait a moment and try again?',
          insights: [
            'N8N workflow timed out after 1 minute (504 Gateway Timeout).',
            'This often happens with complex file processing or when the AI service is under heavy load.',
            'Try breaking down your request into smaller parts or wait a few minutes before retrying.'
          ],
        });
      }

      // Handle 502 Bad Gateway
      if (n8nResponse.status === 502) {
        return res.status(200).json({
          reasoning: 'The AI service is temporarily unavailable due to a server configuration issue.',
          clarifyQuestion: 'Please wait a few minutes and try again. If the problem persists, contact support.',
          insights: [
            'N8N webhook returned a 502 Bad Gateway error.',
            'This usually indicates a temporary server issue or configuration problem.',
            'The service should recover automatically within a few minutes.'
          ],
        });
      }

      // Handle 503 Service Unavailable
      if (n8nResponse.status === 503) {
        return res.status(200).json({
          reasoning: 'The AI service is temporarily unavailable due to maintenance or high load.',
          clarifyQuestion: 'Please wait a few minutes and try again. If the problem persists, contact support.',
          insights: [
            'N8N webhook returned a 503 Service Unavailable error.',
            'This usually indicates the service is under maintenance or experiencing high load.',
            'The service should be available again shortly.'
          ],
        });
      }

      // Handle 500 Internal Server Error
      if (n8nResponse.status === 500) {
        return res.status(200).json({
          reasoning: 'The AI service encountered an internal error while processing your request.',
          clarifyQuestion: 'Please try again in a few minutes. If the problem persists, contact support.',
          insights: [
            'N8N webhook returned a 500 Internal Server Error.',
            'This indicates a server-side issue that needs to be resolved.',
            'Try again later or contact support if the problem continues.'
          ],
        });
      }

      throw new Error(`N8N webhook failed: ${n8nResponse.status} ${n8nResponse.statusText}`);
    }

    const result = await n8nResponse.json();

    console.log('🔍 [N8N] Raw response received:', {
      isArray: Array.isArray(result),
      length: Array.isArray(result) ? result.length : 'N/A',
      type: typeof result,
      keys: !Array.isArray(result) ? Object.keys(result) : 'N/A'
    });

    // N8N may return an array of results; we typically want the first one.
    const n8nData = Array.isArray(result) ? result[0] : result;

    console.log('🔍 [N8N] Processed response data:', {
      hasReasoning: !!n8nData.reasoning,
      hasTables: !!n8nData.tables,
      tablesCount: n8nData.tables ? n8nData.tables.length : 0,
      hasInsights: !!n8nData.insights,
    });

    // Transform the N8N response to the format expected by the frontend
    const transformedResult = {
      intent: n8nData.isExtraction ? 'extraction' : 'update_data',
      reasoning: n8nData.reasoning || 'AI processing completed.',
      tables: n8nData.tables ? n8nData.tables.map((table: any) => ({
        ...table,
        rowCount: Array.isArray(table.rows) ? table.rows.length : 0,
        // Ensure all required properties are present
        title: table.title || 'Proposed Updates',
        headers: Array.isArray(table.headers) ? table.headers : [],
        rows: Array.isArray(table.rows) ? table.rows : [],
        summary: table.summary || '',
        meta: {
          sheetName: table.meta?.sheetName || '',
          operations: table.meta?.operations || { add: 0, update: 0 },
          requiresConfirmation: Boolean(table.meta?.requiresConfirmation),
          isDryRun: Boolean(table.meta?.isDryRun)
        }
      })) : [],
      clarifyQuestion: n8nData.clarifyQuestion || null,
      insights: Array.isArray(n8nData.insights) ? n8nData.insights : [],
    };

    return res.status(200).json({ success: true, ...transformedResult });
  } catch (error) {
    console.error('❌ [API] Chat API error:', error);
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return res.status(200).json({
        reasoning: 'The AI service is taking longer than expected to process your request. This might be due to the complexity of the files or high server load.',
        clarifyQuestion: 'Would you like to try again with a simpler request, or wait a moment and try again?',
                 insights: [
           'Request timed out after 90 seconds. This is common with complex file processing.',
           'Try breaking down your request into smaller parts or wait a few minutes before retrying.',
           'If the problem persists, the AI service might be experiencing high load.'
         ],
      });
    }
    
    // Handle fetch failed errors (network issues)
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return res.status(200).json({
        reasoning: 'Unable to connect to the AI service. This might be due to a temporary network issue or the service being unavailable.',
        clarifyQuestion: 'Please check your internet connection and try again. If the problem persists, the AI service might be temporarily unavailable.',
        insights: [
          'Network connection to the AI service failed.',
          'This could be due to internet connectivity issues or the service being down.',
          'Try again in a few minutes or contact support if the problem continues.'
        ],
      });
    }
    
    return res.status(500).json({
      error: 'Failed to process chat message.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


