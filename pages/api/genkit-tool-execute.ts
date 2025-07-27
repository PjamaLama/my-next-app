import { NextApiRequest, NextApiResponse } from 'next';
import { updateSingleSheetFlow } from '../../lib/genkit-template';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toolCall, context } = req.body;

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

async function handleUpdateSheet(args: any, context: any, res: NextApiResponse) {
  try {
    const { transcript, sheetData } = args;
    const { spreadsheetId, sheetName } = context;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for sheet updates'
      });
    }

    // If we don't have sheet data, fetch it first
    let processSheetData = sheetData;
    if (!processSheetData && spreadsheetId && sheetName) {
      console.log('Fetching current sheet data...');
      
      // Fetch current sheet data
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

    // Use Genkit to process the update
    const result = await updateSingleSheetFlow({
      transcript,
      sheetData: processSheetData
    });

    // Execute the updates using your existing API
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

async function handleGetSheetData(args: any, res: NextApiResponse) {
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

async function handleAnalyzeVoiceInput(args: any, res: NextApiResponse) {
  try {
    const { transcript } = args;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for analysis'
      });
    }

    // Simple intent analysis
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