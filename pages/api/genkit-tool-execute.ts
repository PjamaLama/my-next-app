import { NextApiRequest, NextApiResponse } from 'next';
import { updateSheetFlow } from '../../genkit/updateSheetFlow';
import { analyzeFileFlow } from '../../genkit/analyzeFileFlow';

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
    const { toolCall, context, images } = req.body;

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

    // Get API key from environment variable
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    
    // Ensure API key is provided for tools that require it
    if (!apiKey && (name === 'analyze_images' || name === 'analyze_files' || name === 'extract_data_from_images' || name === 'extract_data_from_files')) {
      return res.status(400).json({
        success: false,
        error: 'Gemini API key is required for this operation.',
        details: 'Please ensure your GOOGLE_GENAI_API_KEY is configured in your environment variables.'
      });
    }

    console.log(`API: Executing approved tool: ${name}`);
    console.log(`API: Tool arguments:`, args);
    console.log(`API: Received ${images?.length || 0} images`);
    console.log(`API: Images types:`, images?.map((img: ImageData) => img.mimeType) || []);
    console.log(`API: Gemini API key provided:`, !!apiKey);

    switch (name) {
      case 'update_sheet':
        return await handleUpdateSheet(args, context, res);

      case 'get_sheet_data':
        return await handleGetSheetData(args, res);

      case 'analyze_voice_input':
        return await handleAnalyzeVoiceInput(args, res);

      case 'analyze_images':
      case 'analyze_files':
        return await handleAnalyzeImages(args, images, apiKey!, res);

      case 'extract_data_from_images':
      case 'extract_data_from_files':
        return await handleExtractDataFromImages(args, context, images, apiKey!, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown tool: ${name}`
        });
    }

  } catch (error: unknown) {
    console.error('API: Unhandled error during tool execution:', error);
    console.error('API: Type of error:', typeof error);

    let errorMessage = 'Failed to execute tool';
    let errorDetails: string | object = 'An unknown error occurred.';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
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
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else if (typeof error === 'object' && error !== null) {
      // Attempt to stringify other object types for logging
      try {
        errorDetails = JSON.stringify(error);
              } catch {
        errorDetails = '[Unstringifiable object error]';
      }
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails
    });
  }
}

function formatAnalysesAsMarkdown(analyses: Array<{ index: number; type: string; analysis: unknown; success: boolean; error?: string; extractedData?: unknown }>): string {
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
        const updatesForSheet = result.actions.map((action: SheetAction) => {
          // Validate that the AI is using the correct sheet name
          if (action.sheet && action.sheet !== sheetName) {
            console.warn(`AI returned sheet name "${action.sheet}" but expected "${sheetName}". Using expected sheet name.`);
          }
          return {
            sheetName: sheetName, // Always use the expected sheet name from the loop
            cell: `${action.column}${action.row}`,
            value: action.value,
            row: action.row,
            column: action.column
          };
        });
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
      try {
        const data = await response.json();
        return res.status(200).json({
          success: true,
          result: `Retrieved ${data.data?.length || 0} rows from ${sheetName}`,
          data: data.data || []
        });
      } catch (parseError) {
        console.error('Failed to parse sheet data response as JSON:', parseError);
        return res.status(500).json({
          success: false,
          error: 'Failed to parse sheet data response'
        });
      }
    } else {
      const errorText = await response.text();
      console.error('Get sheet data API error:', errorText);
      let details = errorText;
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        details = 'Received HTML error page from internal API. Check server logs for details.';
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve sheet data',
        details: details
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

async function handleAnalyzeImages(args: ToolArgs, images: ImageData[], apiKey: string, res: NextApiResponse) {
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

    const analysisResults: Array<{
      index: number;
      type: string;
      analysis: string;
      success: boolean;
      error?: string;
      extractedData?: unknown;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        // Create the flow with the provided API key
        const flow = analyzeFileFlow(apiKey);
        const result = await flow.run({ prompt: transcript || 'Analyze this file', files: [image] });
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: 'Analysis complete',
          success: true,
          extractedData: result
        });
      } catch (error) {
        console.error(`Error analyzing image ${i + 1}:`, error);
        
        // Provide user-friendly error messages for common AI service issues
        let errorMessage = 'Analysis failed';
        if (error instanceof Error) {
          if (error.message.includes('503') || error.message.includes('overloaded')) {
            errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
          } else if (error.message.includes('429') || error.message.includes('rate limit')) {
            errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
          } else if (error.message.includes('quota exceeded')) {
            errorMessage = 'AI service quota exceeded. Please check your API key limits.';
          } else {
            errorMessage = error.message;
          }
        }
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: 'Analysis failed',
          success: false,
          error: errorMessage
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
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to analyze images';
    if (error instanceof Error) {
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleExtractDataFromImages(args: ToolArgs, context: Context, images: ImageData[], apiKey: string, res: NextApiResponse) {
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

    // First, analyze the files to extract data
    const analysisResults: Array<{
      index: number;
      type: string;
      analysis: unknown;
      success: boolean;
      error?: string;
      extractedData?: unknown;
    }> = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        console.log(`Analyzing file ${i + 1}: ${image.mimeType}`);
        
        // Use the analyzeFileFlow to extract data from the file
        const flow = analyzeFileFlow(apiKey);
        const result = await flow.run({ 
          prompt: transcript || 'Extract all relevant data from this file that could be added to a spreadsheet',
          files: [image]
        });
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: result,
          success: true
        });
        
      } catch (analysisError) {
        console.error(`Error analyzing file ${i + 1}:`, analysisError);
        
        // Provide user-friendly error messages for common AI service issues
        let errorMessage = 'Unknown error during analysis';
        if (analysisError instanceof Error) {
          if (analysisError.message.includes('503') || analysisError.message.includes('overloaded')) {
            errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
          } else if (analysisError.message.includes('429') || analysisError.message.includes('rate limit')) {
            errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
          } else if (analysisError.message.includes('quota exceeded')) {
            errorMessage = 'AI service quota exceeded. Please check your API key limits.';
          } else {
            errorMessage = analysisError.message;
          }
        }
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: null,
          success: false,
          error: errorMessage
        });
      }
    }

    // Check if any analysis succeeded
    const successfulAnalyses = analysisResults.filter(result => result.success);
    if (successfulAnalyses.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze any files',
        details: 'All file analysis attempts failed. This may be due to AI service issues or unsupported file types.',
        analysisResults
      });
    }

    // Now use the updateSheetFlow to process the extracted data and update the sheet
    try {
      console.log('Processing extracted data with updateSheetFlow...');
      
      // Combine all extracted data into a single transcript
      const extractedData = analysisResults
        .filter(result => result.success && result.analysis)
        .map(result => {
          if (typeof result.analysis === 'string') {
            return result.analysis;
          } else if (result.analysis && typeof result.analysis === 'object') {
            return JSON.stringify(result.analysis);
          }
          return '';
        })
        .join('\n\n');
      
      // Create an enhanced transcript that includes the extracted data
      const enhancedTranscript = `${transcript || 'Add the following data to the spreadsheet'}\n\nIMPORTANT: The extracted data contains multiple entries. Please create a separate row for each entry in the data.\n\nExtracted data:\n${extractedData}`;
      
      // Call the updateSheetFlow with the enhanced transcript
      const updateResult = await updateSheetFlow({
        transcript: enhancedTranscript,
        sheetId: spreadsheetId,
        sheetName: targetSheetName,
        commit: true // Actually commit the changes
      });
      
      console.log('UpdateSheetFlow result:', updateResult);
      
      return res.status(200).json({
        success: true,
        result: `Successfully extracted data from ${successfulAnalyses.length} out of ${images.length} files and updated ${targetSheetName}`,
        details: {
          filesProcessed: images.length,
          successfulAnalyses: successfulAnalyses.length,
          analysisResults,
          updateResult,
          executedActions: updateResult.executedActions || 0
        }
      });
      
    } catch (updateError) {
      console.error('Error updating sheet with extracted data:', updateError);
      
      // Provide user-friendly error messages for update failures
      let errorMessage = 'Failed to update sheet with extracted data';
      if (updateError instanceof Error) {
        if (updateError.message.includes('503') || updateError.message.includes('overloaded')) {
          errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
        } else if (updateError.message.includes('429') || updateError.message.includes('rate limit')) {
          errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
        } else {
          errorMessage = updateError.message;
        }
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        details: updateError instanceof Error ? updateError.message : String(updateError),
        analysisResults // Still return the analysis results even if update failed
      });
    }

  } catch (error) {
    console.error('Error in handleExtractDataFromImages:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to extract data from images';
    if (error instanceof Error) {
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 