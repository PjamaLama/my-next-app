import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    // Accommodate base64-encoded uploads
    bodyParser: { sizeLimit: '128mb' },
  },
};

// 🚀 UNIFIED FILE PROCESSOR
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
    const basePrompt = `Extract structured data from this ${fileType} content. Output as a valid JSON array of objects with keys like date, vendor, amount, category, details. Infer categories (e.g., Food, Fuel, Accommodation). Normalize dates to YYYY-MM-DD and amounts to numbers. Do not include any text outside of the JSON response.

Consider the following existing sheet data for context when extracting information. Prioritize extracting data that aligns with these structures:
${sheetContext}

Content: ${extractedText}`;

    // Customize prompt based on file type
    if (fileType.startsWith('image/')) {
      return `Analyze this image and extract structured data. Look for:
- Receipts: date, vendor, total amount, items, tax
- Invoices: invoice number, date, vendor, amounts, line items
- Forms: form fields, dates, names, amounts
- Any other structured information

${basePrompt}`;
    }
    
    return basePrompt;
  }

  async sendToGemini(file: any, prompt: string, extractedText: string): Promise<any> {
    try {
      let result;
      
      if (file.mimeType.startsWith('image/') && file.data) {
        // Use Gemini Vision API for images
        console.log(`🖼️ [UNIFIED PROCESSOR] Using Gemini Vision for ${file.name}`);
        
        const imagePart = {
          inlineData: {
            data: file.data,
            mimeType: file.mimeType,
          },
        };
        
        result = await this.model.generateContent([prompt, imagePart]);
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
        prompt: prompt,
        responseLength: text.length,
        rawResponse: text,
        hasJson: text.includes('{') && text.includes('}'),
        timestamp: new Date().toISOString()
      });

      return this.parseAIResponse(text);
      
    } catch (error) {
      console.error(`❌ [UNIFIED PROCESSOR] Gemini API call failed for ${file.name}:`, error);
      throw new Error(`Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const { message, context, conversationHistory, images } = req.body || {};

    if ((!message || message === '') && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message or images are required' });
    }

    // Send headers + one sample row per sheet to provide context without duplication
    const sheetInfo: Record<string, { headers: string[], sampleRows: string[][] }> = {};
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
          // Get the last 3 rows as sample data
          const sampleRows = sheetData.length > 1 ?
            sheetData.slice(Math.max(1, sheetData.length - 3)).map((row: any) =>
              Array.isArray(row) ? row.map((cell: any) => String(cell ?? '')) : []
            ) : [];
          
          sheetInfo[sheetName] = {
            headers: headers,
            sampleRows: sampleRows
          };
          console.log(`✅ [N8N] Added data for ${sheetName}:`, {
            headerCount: headers.length,
            sampleRowsCount: sampleRows.length
          });

          sheetContextString += `\nSheet Name: ${sheetName}\nHeaders: ${headers.join(', ')}\nSample Rows:\n`;
          sampleRows.forEach(row => {
            sheetContextString += `- ${row.join(', ')}\n`;
          });

        } else {
          console.log(`❌ [N8N] Skipped ${sheetName} - invalid data structure`);
        }
      }
    } else {
      console.log('❌ [N8N] No context.sheetData received');
    }

    // Process images and files into a format suitable for N8N
    // Extract text from PDFs using pdf-parse before sending to N8N
    const extractedFileContents = [];
    
    if (images && images.length > 0) {
      console.log(`🔍 [BACKEND] Processing ${images.length} files from frontend`);
      
      for (const img of images) {
        console.log(`🔍 [BACKEND] Processing file: ${img.name} (${img.mimeType})`, {
          hasData: !!img.data,
          dataLength: img.data ? img.data.length : 0,
          hasFileData: !!img.extractedData?.fileData,
          fileDataLength: img.extractedData?.fileData ? img.extractedData.fileData.length : 0,
          extractedDataType: img.extractedData?.type,
          extractedTextLength: img.extractedData?.textLength || 0
        });
        
        let processedFile = {
          type: img.mimeType,
          name: img.name,
          mimeType: img.mimeType, // Add mimeType for Gemini processing
          data: img.data, // Include the raw data for unified processor
          extractedData: img.extractedData || {
            type: 'metadata',
            fileName: img.name,
            mimeType: img.mimeType
          }
        };

        // If this is a PDF with file data, extract text using pdf-parse
        if (img.mimeType === 'application/pdf' && (img.data || img.extractedData?.fileData)) {
          try {
            console.log(`🔍 [PDF] Extracting text from PDF: ${img.name}`);
            const pdf = (await import('pdf-parse')).default;
            const pdfBase64Data = img.data || img.extractedData?.fileData;
            const buffer = Buffer.from(pdfBase64Data, 'base64');
            const pdfData = await pdf(buffer);
            const extractedText = pdfData.text || 'No text could be extracted from the PDF';
            
            console.log(`🔍 [PDF] Successfully extracted ${extractedText.length} characters from PDF`);
            
            processedFile.extractedData = {
              type: 'document',
              format: 'pdf',
              fileName: img.name,
              fileSize: img.extractedData?.fileSize || 0,
              mimeType: img.mimeType,
              extractedText: extractedText,
              textLength: extractedText.length,
              hasTextContent: extractedText.length > 0,
              needsBackendProcessing: false, // Text already extracted
              pageCount: pdfData.numpages || 0,
              isScannedDocument: extractedText.length < 50 // Rough heuristic for scanned docs
            };
            
            // Also store the raw data for the unified processor
            processedFile.data = img.data;
            
          } catch (pdfError) {
            console.error(`❌ [PDF] Failed to extract text from PDF ${img.name}:`, pdfError);
            // Keep the original extractedData but mark as needing backend processing
            processedFile.extractedData.needsBackendProcessing = true;
            processedFile.extractedData.extractionError = pdfError instanceof Error ? pdfError.message : 'Unknown error';
          }
        } else if (img.mimeType === 'application/pdf') {
          console.log(`❌ [PDF] PDF ${img.name} missing file data - cannot extract text`);
        }
        
        // If this is an image, prepare for Gemini Vision processing
        if (img.mimeType.startsWith('image/') && (img.data || img.extractedData?.fileData)) {
          console.log(`🖼️ [IMAGE] Preparing image ${img.name} for Gemini Vision analysis`);
          processedFile.extractedData = {
            type: 'image',
            format: img.mimeType.split('/')[1],
            fileName: img.name,
            fileSize: img.extractedData?.fileSize || 0,
            mimeType: img.mimeType,
            extractedText: `Image: ${img.name} - Ready for Gemini Vision analysis`,
            textLength: 0,
            hasTextContent: false, // Will be determined by Gemini Vision
            needsBackendProcessing: true, // Images need Gemini Vision processing
            imageData: img.data || img.extractedData?.fileData, // Store base64 for Gemini Vision API
            note: 'Image ready for Gemini Vision analysis'
          };
        }

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
              fileContent.extractedData.geminiError = result.error;
              fileContent.extractedData.geminiProcessed = false;
            }
            continue;
          }
          
          const result = await processor.processFile(fileContent, sheetContextString);
          
          if (result.success) {
            // Update the file content with unified processing results
            fileContent.extractedData.geminiStructuredData = result.structuredData;
            fileContent.extractedData.geminiProcessed = true;
            fileContent.extractedData.extractedText = result.extractedText;
            fileContent.extractedData.textLength = result.textLength;
            fileContent.extractedData.hasTextContent = result.textLength > 0;
            
            console.log(`✅ [UNIFIED PROCESSOR] Successfully processed ${fileContent.name}:`, {
              structuredDataType: Array.isArray(result.structuredData) ? 'array' : typeof result.structuredData,
              structuredDataLength: Array.isArray(result.structuredData) ? result.structuredData.length : 'N/A',
              textLength: result.textLength
            });
          } else {
            fileContent.extractedData.geminiError = result.error;
            fileContent.extractedData.geminiProcessed = false;
            console.error(`❌ [UNIFIED PROCESSOR] Failed to process ${fileContent.name}:`, result.error);
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

    const structuredExtracts = extractedFileContents
      .filter((f: any) => f.extractedData?.geminiStructuredData)
      .map((f: any) => ({
        fileName: f.name,
        mimeType: f.mimeType,
        structuredData: f.extractedData.geminiStructuredData
      }));

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
        messageCount: conversationHistory?.length || 0,
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
            sampleRowsCount: (sheetData as any).sampleRows?.length || 0
          }
        ])
      ),
      conversationHistoryLength: webhookData.conversationHistory.length,
      fileInfo: {
        totalFiles: webhookData.fileSummary.totalFiles,
        hasGeminiStructuredData: webhookData.fileSummary.hasGeminiStructuredData,
        geminiErrors: webhookData.fileSummary.geminiErrors,
        structuredExtractsCount: webhookData.structuredExtracts?.length || 0,
        structuredExtractsFiles: webhookData.structuredExtracts?.map((extract: any) => extract.fileName) || []
      }
    });

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error('❌ [N8N] N8N_WEBHOOK_URL is not configured in the environment.');
      throw new Error('N8N webhook service is not configured.');
    }

    console.log('🔍 [N8N] Using webhook URL:', n8nWebhookUrl);

    // Log the action as requested
    console.log('🚀 [N8N] Using n8n for AI processing. Calling webhook...');

    // Log payload size for debugging
    const payloadString = JSON.stringify(webhookData, null, 0);
    const payloadSizeKB = Math.round(payloadString.length / 1024);
    console.log(`🔍 [N8N] Payload size: ${payloadSizeKB} KB`);

    // Call the N8N webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(webhookData, null, 0), // Remove redundant fields and minify JSON to lighten payload
      signal: AbortSignal.timeout(120000), // Increase timeout to 2 minutes for N8N processing
    });

    if (!n8nResponse.ok) {
      const errorBody = await n8nResponse.text();
      console.error(`❌ [N8N] Webhook call failed with status ${n8nResponse.status}:`, errorBody);

      // Provide a user-friendly error for common issues like the workflow being inactive
      if (n8nResponse.status === 404) {
        return res.status(200).json({
          reasoning: 'The AI service is currently unavailable. Please ensure the workflow is active and try again.',
          clarifyQuestion: 'The AI service seems to be offline. Would you like to try again?',
          insights: ['N8N webhook returned a 404 Not Found error.'],
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
        clarifyQuestion: 'Would you like to try again, or would you prefer to wait a moment and try again?',
        insights: ['Request timed out after 2 minutes. This is common with complex file processing.'],
      });
    }
    
    return res.status(500).json({
      error: 'Failed to process chat message.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


