import { NextApiRequest, NextApiResponse } from 'next';
import { updateSingleSheetFlow } from '../../lib/genkit-template';

// Simple chat processing without complex Genkit tool definitions to avoid schema issues
async function processMessage(message: string, isVoice: boolean, context: any, conversationHistory: any[]) {
  try {
    // Analyze the message for intent
    const lowerMessage = message.toLowerCase();
    let intent = 'chat';
    let suggestedTools: any[] = [];

    // Simple intent detection
    if (lowerMessage.includes('add') || lowerMessage.includes('insert') || lowerMessage.includes('new')) {
      intent = 'add_data';
      suggestedTools.push({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: 'update_sheet',
          arguments: JSON.stringify({ transcript: message })
        }
      });
    } else if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('edit')) {
      intent = 'update_data';
      suggestedTools.push({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: 'update_sheet',
          arguments: JSON.stringify({ transcript: message })
        }
      });
    } else if (lowerMessage.includes('show') || lowerMessage.includes('get') || lowerMessage.includes('display') || lowerMessage.includes('data')) {
      intent = 'get_data';
      if (context?.spreadsheetId && context?.sheetName) {
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'get_sheet_data',
            arguments: JSON.stringify({ 
              spreadsheetId: context.spreadsheetId, 
              sheetName: context.sheetName 
            })
          }
        });
      }
    }

    // Generate conversational response
    let response = '';
    const inputType = isVoice ? 'voice' : 'text';
    
    switch (intent) {
      case 'add_data':
        response = `I understand you want to add new data via ${inputType}. I can help you update your spreadsheet "${context?.sheetName || 'current sheet'}" with the information you provided. Would you like me to process this update?`;
        break;
      case 'update_data':
        response = `I can help you update the data in your spreadsheet "${context?.sheetName || 'current sheet'}" based on your ${inputType} input. Should I proceed with analyzing and applying these changes?`;
        break;
      case 'get_data':
        if (context?.sheetName) {
          response = `I can retrieve the current data from your "${context.sheetName}" sheet. Would you like me to fetch that information for you?`;
        } else {
          response = `I'd be happy to help you get data, but you'll need to select a spreadsheet and sheet first. Please choose your target sheet and try again.`;
        }
        break;
      default:
        response = `I'm here to help you manage your Google Sheets through ${inputType} commands. You can ask me to add, update, or retrieve data from your spreadsheets. What would you like to do?`;
    }

    // Add context info
    if (context?.sheetName) {
      response += `\n\nCurrently connected to: ${context.sheetName}`;
    }

    return {
      response,
      toolCalls: [],
      pendingToolCalls: suggestedTools.filter(tool => 
        tool.function.name === 'update_sheet' || 
        (tool.function.name === 'get_sheet_data' && !context?.spreadsheetId)
      )
    };

  } catch (error) {
    console.error('Message processing error:', error);
    return {
      response: `I encountered an error processing your message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolCalls: [],
      pendingToolCalls: []
    };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, isVoice, context, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`API: Processing chat message (${isVoice ? 'voice' : 'text'}): ${message}`);

    // Process the message
    const result = await processMessage(
      message,
      isVoice || false,
      context || {},
      conversationHistory || []
    );

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('API: Chat processing failed:', error);
    return res.status(500).json({
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 