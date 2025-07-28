import { NextApiRequest, NextApiResponse } from 'next';

// Define proper types for the function parameters
interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  [key: string]: unknown;
}

interface ConversationHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface ImageData {
  data: string;
  mimeType: string;
}

// Simple chat processing with image support
async function processMessage(
  message: string, 
  context: Context, 
  conversationHistory: ConversationHistoryItem[], 
  images: ImageData[] = []
) {
  try {
    // Analyze the message for intent
    const lowerMessage = message.toLowerCase();
    let intent = 'chat';
    const suggestedTools: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }> = [];

    // Enhanced intent detection with image consideration
    const hasImages = images && images.length > 0;
    
    if (hasImages) {
      // If images are provided, suggest image analysis tools
      suggestedTools.push({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: 'analyze_images',
          arguments: JSON.stringify({ 
            transcript: message,
            imageCount: images.length,
            imageTypes: images.map(img => img.mimeType)
          })
        }
      });
      
      // If the message also mentions sheet operations with images
      if (lowerMessage.includes('add') || lowerMessage.includes('extract') || lowerMessage.includes('data from')) {
        intent = 'extract_from_images';
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'extract_data_from_images',
            arguments: JSON.stringify({ 
              transcript: message,
              images: images.length
            })
          }
        });
      }
    } else {
      // Original intent detection for text-only messages
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
    }

    // Generate conversational response with image awareness
    let response = '';
    const imageInfo = hasImages ? ` along with ${images.length} ${images.length === 1 ? 'image/file' : 'images/files'}` : '';

    switch (intent) {
      case 'extract_from_images':
        response = `I can see you've provided ${images.length} ${images.length === 1 ? 'image/file' : 'images/files'} and want to extract data from ${images.length === 1 ? 'it' : 'them'}. I can analyze the content and help you add the information to your spreadsheet "${context?.sheetName || 'current sheet'}". Would you like me to proceed with analyzing the ${images.length === 1 ? 'image' : 'images'} and extracting data?`;
        break;
      case 'add_data':
        response = `I understand you want to add new data${imageInfo}. I can help you update your spreadsheet "${context?.sheetName || 'current sheet'}" with the information you provided. Would you like me to process this update?`;
        break;
      case 'update_data':
        response = `I can help you update the data in your spreadsheet "${context?.sheetName || 'current sheet'}" based on your input${imageInfo}. Should I proceed with analyzing and applying these changes?`;
        break;
      case 'get_data':
        if (context?.sheetName) {
          response = `I can retrieve the current data from your "${context.sheetName}" sheet. Would you like me to fetch that information for you?`;
        } else {
          response = `I'd be happy to help you get data, but you'll need to select a spreadsheet and sheet first. Please choose your target sheet and try again.`;
        }
        break;
      default:
        if (hasImages) {
          response = `I can see you've shared ${images.length} ${images.length === 1 ? 'image/file' : 'images/files'} with me. I can analyze ${images.length === 1 ? 'it' : 'them'} and help you with various tasks like extracting data, describing content, or adding information to your spreadsheets. What would you like me to do with ${images.length === 1 ? 'this image' : 'these images'}?`;
        } else {
          response = `I'm here to help you manage your Google Sheets. You can ask me to add, update, or retrieve data from your spreadsheets. What would you like to do?`;
        }
    }

    if (context?.sheetName && !hasImages) {
      response += `\n\nCurrently connected to: ${context.sheetName}`;
    }

    return {
      response,
      toolCalls: [], // No direct tool calls from this simplified API
      pendingToolCalls: suggestedTools.filter(tool =>
        tool.function.name === 'update_sheet' ||
        tool.function.name === 'analyze_images' ||
        tool.function.name === 'extract_data_from_images' ||
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
    const { message, context, conversationHistory, images } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`API: Processing chat message: ${message}`);
    if (images && images.length > 0) {
      console.log(`API: ${images.length} images/files included`);
    }

    const result = await processMessage(
      message,
      context || {},
      conversationHistory || [],
      images || []
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