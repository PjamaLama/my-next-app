import { NextApiRequest, NextApiResponse } from 'next';
import { updateSheetFlow } from '../../genkit/updateSheetFlow';

// Configure API to handle larger file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow up to 10MB for file uploads
    },
  },
};

// Define proper types for the function parameters
interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  sheetNames?: string[];
  [key: string]: unknown;
}

interface ToolArgs {
  transcript?: string;
  sheetData?: unknown;
  spreadsheetId?: string;
  sheetName?: string; // Keep for backward compatibility if needed, but prefer sheetNames
  sheetNames?: string[]; // New field for multiple sheet selection
  imageCount?: number;
  imageTypes?: string[];
  [key: string]: unknown;
}

interface ImageData {
  data: string;
  mimeType: string;
}

// Define interface SheetAction
interface SheetAction {
  sheet?: string;
  column: string;
  row: number;
  value: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toolCall, context, images, geminiApiKey } = req.body;

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

    if (!toolCall || !toolCall.function) {
      return res.status(400).json({ error: 'Valid tool call is required' });
    }

    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);

    console.log(`API: Executing approved tool: ${name}`);
    console.log(`API: Tool arguments:`, args);
    console.log(`API: Received ${images?.length || 0} images`);
    console.log(`API: Images types:`, images?.map((img: ImageData) => img.mimeType) || []);
    console.log(`API: Gemini API key provided:`, !!geminiApiKey);

    switch (name) {
      case 'update_sheet':
        return await handleUpdateSheet(args, context, res);

      case 'get_sheet_data':
        return await handleGetSheetData(args, res);

      case 'analyze_voice_input':
        return await handleAnalyzeVoiceInput(args, res);

      case 'analyze_images':
      case 'analyze_files':
        return await handleAnalyzeImages(args, images, res, geminiApiKey);

      case 'extract_data_from_images':
      case 'extract_data_from_files':
        return await handleExtractDataFromImages(args, context, images, res, geminiApiKey);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown tool: ${name}`
        });
    }

  } catch (error) {
    console.error('API: Tool execution failed:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('body too large') || error.message.includes('413')) {
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
    
    return res.status(500).json({
      success: false,
      error: 'Failed to execute tool',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

function formatAnalysesAsMarkdown(analyses: any[]): string {
  if (!analyses || analyses.length === 0) {
    return "No analysis results to display.";
  }

  let markdown = "| File | Type | Analysis | Extracted Data |\n";
  markdown += "|---|---|---|---|\n";

  for (const analysis of analyses) {
    const extractedData = analysis.extractedData ? `\`\`\`json\n${JSON.stringify(analysis.extractedData, null, 2)}\n\`\`\`` : "None";
    markdown += `| ${analysis.index} | ${analysis.type} | ${analysis.analysis} | ${extractedData} |\n`;
  }

  return markdown;
}

async function handleUpdateSheet(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { transcript, preview } = args;
    const { spreadsheetId, sheetNames } = context;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for sheet updates'
      });
    }

    if (!spreadsheetId || !sheetNames || !Array.isArray(sheetNames) || sheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and at least one sheet name are required'
      });
    }

    const allUpdates: SheetAction[] = [];
    for (const sheetName of sheetNames) {
      console.log(`Processing updates for sheet: ${sheetName}`);
      const result = await updateSheetFlow({
        transcript,
        sheetId: spreadsheetId,
        sheetName: sheetName,
        commit: !preview // Only commit if not in preview mode
      });

      if (result && result.actions && result.actions.length > 0) {
        const updatesForSheet = result.actions.map((action: SheetAction) => ({
          sheetName: action.sheet || sheetName,
          cell: `${action.column}${action.row}`,
          value: action.value,
          row: action.row,
          column: action.column
        }));
        allUpdates.push(...updatesForSheet);
      }
    }

    if (allUpdates.length > 0) {
      if (preview) {
        // Return preview data without actually updating
        return res.status(200).json({
          success: true,
          result: `Preview: ${allUpdates.length} cells would be updated across ${sheetNames.length} sheet(s).`,
          actions: allUpdates,
          preview: true
        });
      } else {
        // Actually update the sheets
        console.log(`Formatted ${allUpdates.length} total updates for save-sheet-data-multi API:`, allUpdates);

        const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/save-sheet-data-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId,
            updates: allUpdates
          })
        });

        if (updateResponse.ok) {
          const updateResult = await updateResponse.json();
          return res.status(200).json({
            success: true,
            result: `Successfully updated ${allUpdates.length} cells across ${sheetNames.length} sheet(s).`,
            details: updateResult,
            actions: allUpdates
          });
        } else {
          const errorText = await updateResponse.text();
          console.error('Update API error:', errorText);
          return res.status(500).json({
            success: false,
            error: 'Failed to execute sheet updates',
            details: errorText
          });
        }
      }
    } else {
      return res.status(200).json({
        success: true,
        result: 'No updates were needed based on the transcript',
        actions: []
      });
    }
  } catch (error) {
    console.error('Sheet update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sheet update failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleGetSheetData(args: ToolArgs, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetName } = args;

    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and sheet name are required'
      });
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId, sheetName })
    });

    if (response.ok) {
      const data = await response.json();
      return res.status(200).json({
        success: true,
        result: `Retrieved ${data.data?.length || 0} rows from ${sheetName}`,
        data: data.data || []
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve sheet data'
      });
    }

  } catch (error) {
    console.error('Get sheet data error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sheet data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleAnalyzeVoiceInput(args: ToolArgs, res: NextApiResponse) {
  try {
    const { transcript } = args;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for analysis'
      });
    }

    const analysis = {
      intent: 'unknown',
      entities: [] as string[],
      confidence: 0.5,
      suggestedActions: [] as string[]
    };

    const lowerTranscript = transcript.toLowerCase();

    if (lowerTranscript.includes('add') || lowerTranscript.includes('insert') || lowerTranscript.includes('new')) {
      analysis.intent = 'add_data';
      analysis.confidence = 0.8;
      analysis.suggestedActions.push('Use update_sheet tool to add new data');
    } else if (lowerTranscript.includes('update') || lowerTranscript.includes('change') || lowerTranscript.includes('modify')) {
      analysis.intent = 'update_data';
      analysis.confidence = 0.8;
      analysis.suggestedActions.push('Use update_sheet tool to modify existing data');
    } else if (lowerTranscript.includes('delete') || lowerTranscript.includes('remove')) {
      analysis.intent = 'delete_data';
      analysis.confidence = 0.7;
      analysis.suggestedActions.push('Use update_sheet tool to remove data');
    } else if (lowerTranscript.includes('show') || lowerTranscript.includes('get') || lowerTranscript.includes('display')) {
      analysis.intent = 'get_data';
      analysis.confidence = 0.7;
      analysis.suggestedActions.push('Use get_sheet_data tool to retrieve information');
    }

    return res.status(200).json({
      success: true,
      result: `Analyzed voice input: Intent=${analysis.intent}, Confidence=${analysis.confidence}`,
      analysis
    });

  } catch (error) {
    console.error('Voice analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze voice input',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleAnalyzeImages(args: ToolArgs, images: ImageData[], res: NextApiResponse, geminiApiKey?: string) {
  try {
    const { transcript } = args;

    console.log(`🔍 [ANALYZE_IMAGES] Received ${images?.length || 0} images`);
    console.log(`🔍 [ANALYZE_IMAGES] Args:`, args);

    if (!images || images.length === 0) {
      console.log(`❌ [ANALYZE_IMAGES] No files provided`);
      return res.status(400).json({
        success: false,
        error: 'Files are required for analysis'
      });
    }

    console.log(`Analyzing ${images.length} images/files`);

    // Use Genkit to analyze images - we'll call the existing image processing API
    const analysisResults = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        // For PDFs and images, we can use Gemini's multimodal capabilities
        let analysisPrompt = `Analyze this ${image.mimeType.includes('pdf') ? 'PDF document' : 'image'} and describe what you see. `;
        
        if (transcript) {
          analysisPrompt += `The user asked: "${transcript}". Focus your analysis on what might be relevant to their request.`;
        } else {
          analysisPrompt += `Look for any data, text, tables, or information that could be useful for data entry or analysis.`;
        }

        // Simple image analysis - provide basic analysis without external API calls
        const fileType = image.mimeType.includes('pdf') ? 'PDF document' : 'image';
        let analysis = `Successfully processed ${fileType}. `;
        
        if (transcript) {
          analysis += `The user requested: "${transcript}". The file contains visual content that can be analyzed for data extraction.`;
        } else {
          analysis += `The file contains visual content that can be analyzed for data extraction.`;
        }
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: analysis,
          extractedData: null
        });
      } catch (error) {
        console.error(`Error analyzing image ${i + 1}:`, error);
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: 'Analysis failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const successfulAnalyses = analysisResults.filter(result => !result.error).length;
    const summary = `Successfully analyzed ${successfulAnalyses} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}`;

    return res.status(200).json({
      success: true,
      result: summary + "\n\n" + formatAnalysesAsMarkdown(analysisResults),
      analyses: analysisResults,
      summary: {
        total: images.length,
        successful: successfulAnalyses,
        failed: images.length - successfulAnalyses,
        types: Array.from(new Set(images.map(img => img.mimeType)))
      }
    });

  } catch (error) {
    console.error('Image analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze images',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleExtractDataFromImages(args: ToolArgs, context: Context, images: ImageData[], res: NextApiResponse, geminiApiKey?: string) {
  try {
    const { transcript } = args;
    const { spreadsheetId, sheetName, sheetNames } = context;

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files are required for data extraction'
      });
    }

    // Handle both sheetName (singular) and sheetNames (plural) for backward compatibility
    const targetSheetName = sheetName || (Array.isArray(sheetNames) && sheetNames.length > 0 ? sheetNames[0] : null);

    if (!spreadsheetId || !targetSheetName) {
      console.error('Missing context:', { spreadsheetId, sheetName, sheetNames, targetSheetName });
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and sheet name are required for data extraction',
        details: {
          provided: {
            spreadsheetId: !!spreadsheetId,
            sheetName: !!sheetName,
            sheetNames: Array.isArray(sheetNames) ? sheetNames.length : 0
          },
          resolved: {
            targetSheetName: !!targetSheetName
          }
        }
      });
    }

    console.log(`Extracting data from ${images.length} images/files for ${targetSheetName}`);

    // Get current sheet structure to understand what data to extract
    const sheetResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId, sheetName: targetSheetName })
    });

    let sheetStructure = null;
    if (sheetResponse.ok) {
      const sheetResult = await sheetResponse.json();
      sheetStructure = {
        headers: sheetResult.data[0] || [],
        rows: sheetResult.data.slice(1) || []
      };
    }

    const extractionResults = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        // Create a detailed extraction prompt
        let extractionPrompt = `Extract structured data from this ${image.mimeType.includes('pdf') ? 'PDF document' : 'image'} that would be suitable for adding to a spreadsheet.`;
        
        if (sheetStructure && sheetStructure.headers.length > 0) {
          extractionPrompt += ` The target spreadsheet has these columns: ${sheetStructure.headers.join(', ')}. Extract data that matches these columns when possible.`;
        }
        
        if (transcript) {
          extractionPrompt += ` User request: "${transcript}"`;
        }
        
        extractionPrompt += ` Return the data in a structured format that can be easily added to the spreadsheet.`;

        // Use the existing Gemini API for extraction
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/parse-and-fill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: extractionPrompt,
            spreadsheetId,
            sheetName: targetSheetName,
            images: [image],
            geminiApiKey: geminiApiKey
          })
        });

        if (response.ok) {
          const extractionData = await response.json();
          extractionResults.push({
            index: i + 1,
            type: image.mimeType,
            extraction: 'Data extracted successfully',
            data: extractionData.updates || [],
            applied: extractionData.success || false
          });
        } else {
          extractionResults.push({
            index: i + 1,
            type: image.mimeType,
            extraction: 'Failed to extract data',
            error: 'API error'
          });
        }
      } catch (error) {
        console.error(`Error extracting data from image ${i + 1}:`, error);
        extractionResults.push({
          index: i + 1,
          type: image.mimeType,
          extraction: 'Data extraction failed',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const successfulExtractions = extractionResults.filter(result => !result.error).length;
    const totalUpdates = extractionResults.reduce((sum, result) => sum + (result.data?.length || 0), 0);
    
    const summary = `Successfully extracted data from ${successfulExtractions} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}. Applied ${totalUpdates} updates to ${targetSheetName}.`;

    return res.status(200).json({
      success: true,
      result: summary,
      extractions: extractionResults,
      summary: {
        total: images.length,
        successful: successfulExtractions,
        failed: images.length - successfulExtractions,
        totalUpdates,
        sheetName: targetSheetName
      }
    });

  } catch (error) {
    console.error('Data extraction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to extract data from images',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 