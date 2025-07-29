import { NextApiRequest, NextApiResponse } from 'next';

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

// Function to execute a tool call
async function executeToolCall(
  toolCall: {
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  },
  context: Context,
  images: ImageData[] = []
) {
  try {
    console.log(`🔍 [AUTO_EXECUTE] Executing tool: ${toolCall.function.name}`);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/genkit-tool-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCall,
        context,
        images
      }),
    });

    if (!response.ok) {
      // Check if the response is JSON or HTML
      const contentType = response.headers.get('content-type');
      let errorMessage = `Tool execution failed: ${response.status}`;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('Failed to parse error response as JSON:', parseError);
        }
      } else {
        // Handle HTML error responses
        try {
          const errorText = await response.text();
          if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            errorMessage = `Server error (${response.status}): Received HTML error page`;
          } else {
            errorMessage = `Server error (${response.status}): ${errorText}`;
          }
        } catch (textError) {
          console.error('Failed to read error response text:', textError);
        }
      }
      
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = await response.json();
      console.log(`🔍 [AUTO_EXECUTE] Tool execution result:`, data);
    } catch (parseError) {
      console.error('Failed to parse successful response as JSON:', parseError);
      throw new Error('Invalid JSON response from tool execution');
    }
    
    return {
      success: data.success,
      result: data.result,
      details: data.details,
      toolId: toolCall.id
    };
  } catch (error) {
    console.error(`🔍 [AUTO_EXECUTE] Tool execution error:`, error);
    return {
      success: false,
      result: `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: null,
      toolId: toolCall.id
    };
  }
}

// Simple chat processing with image support and automatic tool execution
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

    // Enhanced intent detection with file consideration (images and PDFs)
    const hasFiles = images && images.length > 0;
    const hasPDFs = hasFiles && images.some(img => img.mimeType === 'application/pdf');
    const hasImages = hasFiles && images.some(img => img.mimeType.startsWith('image/'));
    
    if (hasFiles) {
      // Determine the appropriate tool name based on file types
      const toolName = hasPDFs ? 'analyze_files' : 'analyze_images';
      const extractToolName = hasPDFs ? 'extract_data_from_files' : 'extract_data_from_images';
      
      // If files are provided, suggest analysis tools
      suggestedTools.push({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify({ 
            transcript: message,
            fileCount: images.length,
            fileTypes: images.map(img => img.mimeType)
          })
        }
      });
      
      // If the message also mentions sheet operations with files
      if (lowerMessage.includes('add') || lowerMessage.includes('extract') || lowerMessage.includes('data from')) {
        intent = 'extract_from_files';
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: extractToolName,
            arguments: JSON.stringify({ 
              transcript: message,
              files: images.length
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

    // Auto-execute all suggested tools
    const toolResults = [];
    let enhancedResponse = '';
    
    for (const toolCall of suggestedTools) {
      console.log(`🔍 [AUTO_EXECUTE] Auto-executing tool: ${toolCall.function.name}`);
      const result = await executeToolCall(toolCall, context, images);
      toolResults.push(result);
      
      // Enhance response based on tool execution results
      if (result.success) {
        if (toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images') {
          enhancedResponse += `\n\n📄 **File Analysis Complete:**\n${result.result}`;
        } else if (toolCall.function.name === 'extract_data_from_files' || toolCall.function.name === 'extract_data_from_images') {
          enhancedResponse += `\n\n📊 **Data Extraction Complete:**\n${result.result}`;
        } else if (toolCall.function.name === 'update_sheet') {
          enhancedResponse += `\n\n✅ **Spreadsheet Updated:**\n${result.result}`;
        } else if (toolCall.function.name === 'get_sheet_data') {
          enhancedResponse += `\n\n📋 **Sheet Data Retrieved:**\n${result.result}`;
        }
      } else {
        enhancedResponse += `\n\n❌ **Tool Execution Failed:**\n${result.result}`;
      }
    }

    // Generate conversational response with file awareness
    let response = '';
    const fileInfo = hasFiles ? ` along with ${images.length} ${images.length === 1 ? 'file' : 'files'}` : '';

    switch (intent) {
      case 'extract_from_files':
        response = `I've analyzed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and extracted the relevant data.`;
        break;
      case 'add_data':
        response = `I've processed your request to add new data${fileInfo} to your spreadsheet "${context?.sheetName || 'current sheet'}".`;
        break;
      case 'update_data':
        response = `I've updated your spreadsheet "${context?.sheetName || 'current sheet'}" based on your input${fileInfo}.`;
        break;
      case 'get_data':
        if (context?.sheetName) {
          response = `I've retrieved the current data from your "${context.sheetName}" sheet.`;
        } else {
          response = `I'd be happy to help you get data, but you'll need to select a spreadsheet and sheet first. Please choose your target sheet and try again.`;
        }
        break;
      default:
        if (hasFiles) {
          response = `I've processed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and completed the requested analysis.`;
        } else {
          response = `I've processed your request and completed the necessary actions.`;
        }
    }

    // Add enhanced response with tool results
    if (enhancedResponse) {
      response += enhancedResponse;
    }

    if (context?.sheetName && !hasImages) {
      response += `\n\nCurrently connected to: ${context.sheetName}`;
    }

    return {
      response,
      toolCalls: [], // No manual tool calls needed
      pendingToolCalls: [], // No pending tools - all executed automatically
      toolResults: toolResults // Include the results of auto-executed tools
    };

  } catch (error) {
    console.error('Message processing error:', error);
    return {
      response: `I encountered an error processing your message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolCalls: [],
      pendingToolCalls: [],
      toolResults: []
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
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 