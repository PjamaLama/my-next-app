import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    // Accommodate base64-encoded uploads
    bodyParser: { sizeLimit: '128mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, context, conversationHistory, images } = req.body || {};

    if ((!message || message === '') && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message or images are required' });
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

    // Process extracted text with Gemini to create structured data
    if (extractedFileContents.length > 0) {
      console.log('🤖 [GEMINI] Processing extracted file contents with Gemini...');
      
      // Check if API key is available
      if (!process.env.GOOGLE_GENAI_API_KEY) {
        console.error('Missing GOOGLE_GENAI_API_KEY environment variable');
        return res.status(500).json({ 
          error: 'Gemini API key not configured',
          details: 'Please ensure GOOGLE_GENAI_API_KEY is set in your environment variables'
        });
      }

      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Process each file with Gemini (text or vision)
        for (const fileContent of extractedFileContents) {
          console.log(`🤖 [GEMINI] Processing ${fileContent.name}`, {
            mimeType: fileContent.mimeType,
            type: fileContent.type,
            hasExtractedText: !!fileContent.extractedData?.extractedText,
            extractedTextLength: fileContent.extractedData?.extractedText?.length || 0
          });
          
          try {
            let structuredData;
            
            if (fileContent.mimeType.startsWith('image/') && fileContent.extractedData?.imageData && fileContent.extractedData.imageData !== 'undefined') {
              // Use Gemini Vision API for images
              console.log(`🖼️ [GEMINI VISION] Processing image ${fileContent.name} with Vision API`);
              
              const imagePart = {
                inlineData: {
                  data: fileContent.extractedData.imageData,
                  mimeType: fileContent.mimeType,
                },
              };
              
              const visionPrompt = `Analyze this image and extract structured data. Look for:
- Receipts: date, vendor, total amount, items, tax
- Invoices: invoice number, date, vendor, amounts, line items
- Forms: form fields, dates, names, amounts
- Any other structured information

Output as JSON array of objects with appropriate keys. Normalize dates to YYYY-MM-DD, amounts to numbers.`;

              const result = await model.generateContent([visionPrompt, imagePart]);
              const response = result.response;
              const text = response.text();

              if (!text || text.trim().length === 0) {
                throw new Error('Gemini Vision API returned empty response');
              }

              try {
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch && jsonMatch[1]) {
                  structuredData = JSON.parse(jsonMatch[1]);
                } else {
                  structuredData = JSON.parse(text);
                }
              } catch (jsonError) {
                console.error('Failed to parse Gemini Vision JSON response:', jsonError);
                console.error('Gemini Vision raw text response:', text);
                structuredData = { rawText: text };
              }
              
              // Update extracted text with Gemini's analysis
              fileContent.extractedData.extractedText = text;
              fileContent.extractedData.textLength = text.length;
              fileContent.extractedData.hasTextContent = text.length > 0;
              
            } else if (fileContent.extractedData?.extractedText && fileContent.extractedData.extractedText.length > 0 && fileContent.extractedData.extractedText !== 'undefined') {
              // Use Gemini text API for text-based files
              console.log(`📝 [GEMINI TEXT] Processing text from ${fileContent.name} with ${fileContent.extractedData.extractedText.length} characters`);
              
              const prompt = `Extract structured data from this file content. Output as JSON array of objects with keys like date, vendor, amount, category, details. Infer categories (e.g., Food, Fuel, Accommodation). Normalize dates to YYYY-MM-DD, amounts to numbers.

File: ${fileContent.name}
Content: ${fileContent.extractedData.extractedText}`;

              const result = await model.generateContent(prompt);
              const response = result.response;
              const text = response.text();

              if (!text || text.trim().length === 0) {
                throw new Error('Gemini API returned empty response');
              }

              try {
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch && jsonMatch[1]) {
                  structuredData = JSON.parse(jsonMatch[1]);
                } else {
                  structuredData = JSON.parse(text);
                }
              } catch (jsonError) {
                console.error('Failed to parse Gemini JSON response:', jsonError);
                console.error('Gemini raw text response:', text);
                structuredData = { rawText: text };
              }
            } else {
              console.log(`⏭️ [GEMINI] Skipping ${fileContent.name} - no content to process`);
              continue;
            }

            // Update the file content with Gemini's structured data
            fileContent.extractedData.geminiStructuredData = structuredData;
            fileContent.extractedData.geminiProcessed = true;
            
            console.log(`✅ [GEMINI] Successfully processed ${fileContent.name}:`, {
              structuredDataType: Array.isArray(structuredData) ? 'array' : typeof structuredData,
              structuredDataLength: Array.isArray(structuredData) ? structuredData.length : 'N/A'
            });

          } catch (geminiError) {
            console.error(`❌ [GEMINI] Error processing file ${fileContent.name}:`, geminiError);
            fileContent.extractedData.geminiError = (geminiError as Error).message;
            fileContent.extractedData.geminiProcessed = false;
          }
        }
      } catch (error) {
        console.error('❌ [GEMINI] Failed to initialize Gemini:', error);
        return res.status(500).json({ 
          error: 'Failed to process files with Gemini',
          details: (error as Error).message
        });
      }
    }

    // Send headers only to reduce payload
    const sheetHeaders: Record<string, string[]> = {};
    const sheetSampleRows: Record<string, string[][]> = {};
    if (context?.sheetData) {
      console.log('🔍 [N8N] Context sheetData received:', Object.keys(context.sheetData));
      for (const [sheetName, sheetData] of Object.entries(context.sheetData)) {
        console.log(`🔍 [N8N] Processing sheet: ${sheetName}`, {
          isArray: Array.isArray(sheetData),
          length: Array.isArray(sheetData) ? sheetData.length : 'N/A',
          firstRowIsArray: Array.isArray(sheetData) && sheetData.length > 0 ? Array.isArray(sheetData[0]) : false
        });
        if (Array.isArray(sheetData) && sheetData.length > 0 && Array.isArray(sheetData[0])) {
          sheetHeaders[sheetName] = sheetData[0].map((h: any) => String(h ?? ''));
          sheetSampleRows[sheetName] = sheetData.slice(1, 6).map(row => row.map((cell: any) => String(cell ?? '')));
          console.log(`✅ [N8N] Added data for ${sheetName}:`, {
            headerCount: sheetHeaders[sheetName].length,
            sampleRowCount: sheetSampleRows[sheetName].length
          });
        } else {
          console.log(`❌ [N8N] Skipped ${sheetName} - invalid data structure`);
        }
      }
    } else {
      console.log('❌ [N8N] No context.sheetData received');
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
      .map((f: any) => f.extractedData.geminiStructuredData);

    // Prepare the final payload for the N8N webhook with simplified data
    const webhookData = {
      message: message || '',
      // Omit raw text to avoid duplication if Gemini structured data is available
      extractedFileContents: initialFileSummary.hasGeminiStructuredData ? [] : extractedFileContents,
      selectedSheets: context?.sheetNames || [],
      sheetHeaders: sheetHeaders,
      sheetSampleRows: sheetSampleRows,
      conversationHistory: conversationHistory ? conversationHistory.slice(-5) : [], // Max 5 recent messages
      // Enhanced file information for better AI processing
      fileSummary: {
        totalFiles: initialFileSummary.totalFiles,
        hasGeminiStructuredData: initialFileSummary.hasGeminiStructuredData,
        geminiErrors: initialFileSummary.geminiErrors,
      },
      structuredExtracts: structuredExtracts, // Add this new field
    };

    console.log('🚀 [N8N] Final webhook data being sent:', {
      message: webhookData.message,
      selectedSheets: webhookData.selectedSheets,
      sheetHeaderKeys: Object.keys(webhookData.sheetHeaders),
      sheetSampleRowKeys: Object.keys(webhookData.sheetSampleRows),
      sheetDataStructure: Object.fromEntries(
        Object.entries(webhookData.sheetHeaders).map(([name, headers]) => [
          name,
          {
            headerCount: headers.length,
            sampleRowCount: webhookData.sheetSampleRows[name]?.length || 0
          }
        ])
      ),
      conversationHistoryLength: webhookData.conversationHistory.length,
      fileInfo: {
        totalFiles: webhookData.fileSummary.totalFiles,
        fileTypes: webhookData.fileSummary.fileTypes,
        hasStructuredData: webhookData.fileSummary.hasStructuredData,
        hasTextData: webhookData.fileSummary.hasTextData,
        hasMetadata: webhookData.fileSummary.hasMetadata,
        totalTextLength: webhookData.fileSummary.totalTextLength,
        filesWithText: webhookData.fileSummary.filesWithText,
        needsBackendProcessing: webhookData.fileSummary.needsBackendProcessing,
        // Include Gemini processing stats
        geminiProcessed: webhookData.fileSummary.geminiProcessed,
        geminiErrors: webhookData.fileSummary.geminiErrors,
        hasGeminiStructuredData: webhookData.fileSummary.hasGeminiStructuredData
      }
    });

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error('❌ [N8N] N8N_WEBHOOK_URL is not configured in the environment.');
      throw new Error('N8N webhook service is not configured.');
    }

    // Log the action as requested
    console.log('🚀 [N8N] Using n8n for AI processing. Calling webhook...');

    // Call the N8N webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(webhookData, null, 0), // Remove redundant fields and minify JSON to lighten payload
      signal: AbortSignal.timeout(30000), // 30-second timeout
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
          quickReplies: ['Try again'],
        });
      }

      throw new Error(`N8N webhook failed: ${n8nResponse.status} ${n8nResponse.statusText}`);
    }

    const result = await n8nResponse.json();

    // N8N may return an array of results; we typically want the first one.
    const n8nData = Array.isArray(result) ? result[0] : result;

    // Transform the N8N response to the format expected by the frontend
    const transformedResult = {
      intent: n8nData.isExtraction ? 'extraction' : 'update_data',
      reasoning: n8nData.reasoning || 'AI processing completed.',
      tables: n8nData.tables || [],
      clarifyQuestion: n8nData.clarifyQuestion || null,
      insights: n8nData.insights || [],
      quickReplies: n8nData.quickReplies || [],
    };

    return res.status(200).json({ success: true, ...transformedResult });
  } catch (error) {
    console.error('❌ [API] Chat API error:', error);
    return res.status(500).json({
      error: 'Failed to process chat message.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


