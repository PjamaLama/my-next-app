import { NextApiRequest, NextApiResponse } from 'next';
import { updateSingleSheetFlow } from '../../lib/genkit-template';

// Define proper types for the function parameters
interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  [key: string]: unknown;
}

interface ToolArgs {
  transcript?: string;
  sheetData?: unknown;
  spreadsheetId?: string;
  sheetName?: string;
  imageCount?: number;
  imageTypes?: string[];
  [key: string]: unknown;
}

interface ImageData {
  data: string;
  mimeType: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toolCall, context, images } = req.body;

    if (!toolCall || !toolCall.function) {
      return res.status(400).json({ error: 'Valid tool call is required' });
    }

    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);

    console.log(`API: Executing approved tool: ${name}`);
    console.log(`API: Tool arguments:`, args);

    switch (name) {
      case 'update_sheet':
        return await handleUpdateSheet(args, context, res);

      case 'get_sheet_data':
        return await handleGetSheetData(args, res);

      case 'analyze_voice_input':
        return await handleAnalyzeVoiceInput(args, res);

      case 'analyze_images':
        return await handleAnalyzeImages(args, images, res);

      case 'extract_data_from_images':
        return await handleExtractDataFromImages(args, context, images, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown tool: ${name}`
        });
    }

  } catch (error) {
    console.error('API: Tool execution failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute tool',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleUpdateSheet(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { transcript, sheetData } = args;
    const { spreadsheetId, sheetName } = context;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for sheet updates'
      });
    }

    let processSheetData = sheetData;
    if (!processSheetData && spreadsheetId && sheetName) {
      console.log('Fetching current sheet data...');

      const sheetResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, sheetName })
      });

      if (sheetResponse.ok) {
        const sheetResult = await sheetResponse.json();
        processSheetData = {
          headers: sheetResult.data[0] || [],
          rows: sheetResult.data.slice(1) || [],
          sheetName: sheetName
        };
      } else {
        return res.status(400).json({
          success: false,
          error: 'Could not fetch current sheet data'
        });
      }
    }

    const result = await updateSingleSheetFlow({
      transcript,
      sheetData: processSheetData
    });

    if (result && result.length > 0) {
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/updateSheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId,
          sheetName,
          actions: result
        })
      });

      if (updateResponse.ok) {
        const updateResult = await updateResponse.json();
        return res.status(200).json({
          success: true,
          result: `Successfully updated sheet with ${result.length} changes`,
          details: updateResult,
          actions: result
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Failed to execute sheet updates'
        });
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

async function handleAnalyzeImages(args: ToolArgs, images: ImageData[], res: NextApiResponse) {
  try {
    const { transcript } = args;

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Images are required for analysis'
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

        // Use the existing Gemini API integration for image/PDF analysis
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/parse-and-fill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: analysisPrompt,
            images: [image] // Send one image at a time for detailed analysis
          })
        });

        if (response.ok) {
          const analysisData = await response.json();
          analysisResults.push({
            index: i + 1,
            type: image.mimeType,
            analysis: analysisData.response || 'Analysis completed',
            extractedData: analysisData.extractedData || null
          });
        } else {
          analysisResults.push({
            index: i + 1,
            type: image.mimeType,
            analysis: `Failed to analyze ${image.mimeType.includes('pdf') ? 'PDF' : 'image'}`,
            error: 'API error'
          });
        }
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
      result: summary,
      analyses: analysisResults,
      summary: {
        total: images.length,
        successful: successfulAnalyses,
        failed: images.length - successfulAnalyses,
        types: [...new Set(images.map(img => img.mimeType))]
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

async function handleExtractDataFromImages(args: ToolArgs, context: Context, images: ImageData[], res: NextApiResponse) {
  try {
    const { transcript } = args;
    const { spreadsheetId, sheetName } = context;

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Images are required for data extraction'
      });
    }

    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and sheet name are required for data extraction'
      });
    }

    console.log(`Extracting data from ${images.length} images/files for ${sheetName}`);

    // Get current sheet structure to understand what data to extract
    const sheetResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId, sheetName })
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
            sheetName,
            images: [image]
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
    
    const summary = `Successfully extracted data from ${successfulExtractions} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}. Applied ${totalUpdates} updates to ${sheetName}.`;

    return res.status(200).json({
      success: true,
      result: summary,
      extractions: extractionResults,
      summary: {
        total: images.length,
        successful: successfulExtractions,
        failed: images.length - successfulExtractions,
        totalUpdates,
        sheetName
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