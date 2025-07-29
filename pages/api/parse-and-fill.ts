import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { sendToGemini } from '@/lib/gemini';
import type { NextApiRequest, NextApiResponse } from 'next';

// Configure API to handle larger file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow up to 10MB for file uploads
    },
  },
};

// Helper function to escape sheet names for Google Sheets API
const escapeSheetName = (name: string) => {
  // If the sheet name contains spaces, special characters, or starts with a digit,
  // wrap it in single quotes and escape any existing single quotes
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { transcript, spreadsheetId, sheetName, geminiApiKey, images } = req.body;
  
  console.log(`🔍 [PARSE-AND-FILL] Received request:`, {
    hasTranscript: !!transcript,
    hasSpreadsheetId: !!spreadsheetId,
    hasSheetName: !!sheetName,
    hasGeminiApiKey: !!geminiApiKey,
    imageCount: images?.length || 0,
    imageTypes: images?.map((img: any) => img.mimeType) || []
  });

  // Validate file sizes before processing
  if (images && images.length > 0) {
    console.log(`API: ${images.length} images/files included`);
    
    const maxFileSize = 8 * 1024 * 1024; // 8MB limit for individual files
    const totalSizeLimit = 20 * 1024 * 1024; // 20MB total limit
    let totalSize = 0;
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const fileSize = Math.ceil((image.data.length * 3) / 4); // Approximate base64 size
      
      if (fileSize > maxFileSize) {
        return res.status(413).json({
          error: 'File too large',
          details: `File ${i + 1} exceeds the 8MB limit. Please compress or resize your file.`,
          fileIndex: i,
          fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
          maxSize: '8MB'
        });
      }
      
      totalSize += fileSize;
    }
    
    if (totalSize > totalSizeLimit) {
      return res.status(413).json({
        error: 'Total file size too large',
        details: `Combined file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 20MB limit. Please reduce the number or size of files.`,
        totalSize: `${(totalSize / 1024 / 1024).toFixed(1)}MB`,
        maxTotalSize: '20MB'
      });
    }
  }

  // Check if we have a Gemini API key from the user or fallback to environment variable
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key is required. Please add it in your settings.' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const sheetDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${escapeSheetName(sheetName)}!A:Z`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const sheetData = sheetDataRes.data.values ?? [];
    const aiResponse = await sendToGemini({ 
      transcript, 
      sheetData, 
      sheetName, 
      geminiApiKey: apiKey,
      images: images || []
    });

    // Return a more comprehensive response for tool execution
    res.status(200).json({ 
      response: aiResponse ? 'Analysis completed successfully' : 'No data extracted',
      extractedData: aiResponse,
      success: !!aiResponse,
      updates: aiResponse || []
    });
  } catch (e) {
    console.error(e);
    
    // Handle specific error types
    if (e instanceof Error) {
      if (e.message.includes('body too large') || e.message.includes('413')) {
        return res.status(413).json({
          error: 'Request too large',
          details: 'The uploaded files exceed the size limit. Please reduce file sizes or upload fewer files.',
          limits: {
            individualFile: '8MB',
            totalFiles: '20MB'
          }
        });
      }
    }
    
    res.status(500).json({ error: 'Something went wrong' });
  }
} 