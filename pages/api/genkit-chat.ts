import { NextApiRequest, NextApiResponse } from 'next';

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
    // Now we only receive extractedData, not raw base64 data
    const extractedFileContents = images
      ? images.map((img: any) => ({
          type: img.mimeType,
          name: img.name,
          // No more raw data - only extracted/processed data
          extractedData: img.extractedData || {
            type: 'metadata',
            fileName: img.name,
            mimeType: img.mimeType
          }
        }))
      : [];

    // Include both headers AND row data for AI processing
    const sheetDataForAI: Record<string, { headers: string[]; rows: string[][] }> = {};
    if (context?.sheetData) {
      console.log('🔍 [N8N] Context sheetData received:', Object.keys(context.sheetData));
      for (const [sheetName, sheetData] of Object.entries(context.sheetData)) {
        console.log(`🔍 [N8N] Processing sheet: ${sheetName}`, {
          isArray: Array.isArray(sheetData),
          length: Array.isArray(sheetData) ? sheetData.length : 'N/A',
          firstRowIsArray: Array.isArray(sheetData) && sheetData.length > 0 ? Array.isArray(sheetData[0]) : false
        });
        if (Array.isArray(sheetData) && sheetData.length > 0 && Array.isArray(sheetData[0])) {
          // Include both headers and rows for AI processing
          sheetDataForAI[sheetName] = { 
            headers: sheetData[0].map((h: any) => String(h ?? '')),
            rows: sheetData.slice(1).map(row => row.map((cell: any) => String(cell ?? '')))
          };
          console.log(`✅ [N8N] Added data for ${sheetName}:`, {
            headerCount: sheetDataForAI[sheetName].headers.length,
            rowCount: sheetDataForAI[sheetName].rows.length
          });
        } else {
          console.log(`❌ [N8N] Skipped ${sheetName} - invalid data structure`);
        }
      }
    } else {
      console.log('❌ [N8N] No context.sheetData received');
    }

    console.log('🔍 [N8N] Final sheetDataForAI:', Object.keys(sheetDataForAI));

    // Prepare the final payload for the N8N webhook with full data
    const webhookData = {
      message: message || '',
      extractedFileContents,
      selectedSheets: context?.sheetNames || [],
      sheetData: sheetDataForAI, // Full data including headers AND rows
      conversationHistory: conversationHistory ? conversationHistory.slice(-5) : [], // Max 5 recent messages
      currentDate: new Date().toISOString(),
      // Enhanced file information for better AI processing
      fileSummary: {
        totalFiles: extractedFileContents.length,
        fileTypes: extractedFileContents.map((f: any) => f.type),
        hasStructuredData: extractedFileContents.some((f: any) => f.extractedData?.type === 'structured'),
        hasTextData: extractedFileContents.some((f: any) => f.extractedData?.extractedText && f.extractedData.extractedText.length > 0),
        hasMetadata: extractedFileContents.some((f: any) => f.extractedData?.type === 'metadata' || f.extractedData?.type === 'document' || f.extractedData?.type === 'image'),
        totalTextLength: extractedFileContents.reduce((sum: number, f: any) => sum + (f.extractedData?.textLength || 0), 0),
        filesWithText: extractedFileContents.filter((f: any) => f.extractedData?.extractedText && f.extractedData.extractedText.length > 0).length,
        needsBackendProcessing: extractedFileContents.some((f: any) => f.extractedData?.needsBackendProcessing === true)
      }
    };

    console.log('🚀 [N8N] Final webhook data being sent:', {
      message: webhookData.message,
      selectedSheets: webhookData.selectedSheets,
      sheetDataKeys: Object.keys(webhookData.sheetData),
      sheetDataStructure: Object.fromEntries(
        Object.entries(webhookData.sheetData).map(([name, data]) => [
          name, 
          { 
            headerCount: data.headers.length, 
            rowCount: data.rows.length,
            sampleRows: data.rows.slice(0, 3) // Log first 3 rows for debugging
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
        needsBackendProcessing: webhookData.fileSummary.needsBackendProcessing
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
      body: JSON.stringify(webhookData),
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


