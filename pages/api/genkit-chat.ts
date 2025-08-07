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
  sheetNames?: string[];
  spreadsheetUrl?: string;
  fileAnalysis?: {
    files: Array<{
      mimeType: string;
      analysis: unknown;
      extractedData?: unknown;
      timestamp: number;
    }>;
    lastUpdated: number;
  };
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

// Function to handle follow-up actions based on user responses
function generateFollowUpActions(message: string, context: Context): Array<{
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}> {
  const lowerMessage = message.toLowerCase();
  const actions: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }> = [];

  // Check if user wants to add data to spreadsheet
  if (lowerMessage.includes('add') || lowerMessage.includes('1') || lowerMessage.includes('spreadsheet')) {
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const latestAnalysis = context.fileAnalysis.files[context.fileAnalysis.files.length - 1];
      if (latestAnalysis.extractedData && Array.isArray(latestAnalysis.extractedData) && latestAnalysis.extractedData.length > 0) {
        actions.push({
          id: `tool_${Date.now()}_add_data`,
          type: 'function',
          function: {
            name: 'extract_data_from_files',
            arguments: JSON.stringify({
              transcript: 'Add the extracted data to the spreadsheet',
              files: context.fileAnalysis.files.length
            })
          }
        });
      }
    }
  }

  // Check if user wants to extract more information
  if (lowerMessage.includes('extract') || lowerMessage.includes('2') || lowerMessage.includes('more')) {
    actions.push({
      id: `tool_${Date.now()}_extract_more`,
      type: 'function',
      function: {
        name: 'analyze_files',
        arguments: JSON.stringify({
          transcript: 'Extract additional information from the files',
          fileCount: context.fileAnalysis?.files.length || 1
        })
      }
    });
  }

  // Check if user wants to generate a report
  if (lowerMessage.includes('report') || lowerMessage.includes('3') || lowerMessage.includes('summary')) {
    actions.push({
      id: `tool_${Date.now()}_generate_report`,
      type: 'function',
      function: {
        name: 'analyze_files',
        arguments: JSON.stringify({
          transcript: 'Generate a comprehensive summary report of the file content',
          fileCount: context.fileAnalysis?.files.length || 1
        })
      }
    });
  }

  return actions;
}

// New n8n integration tool
interface N8nSheetUpdateInput {
  message: string;
  sheetNames: string[];
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  sessionId?: string;
  callbackUrl?: string;
}

// Export the n8n sheet update function
export const updateSheetViaN8n = async (input: N8nSheetUpdateInput): Promise<string> => {
  try {
    const { message, sheetNames, spreadsheetId, sessionId = `session-${Date.now()}` } = input;
    
    console.log(`🔗 [N8N] Triggering n8n workflow for sheet update`);
    console.log(`🔗 [N8N] Session ID: ${sessionId}`);
    console.log(`🔗 [N8N] Message: ${message}`);
    console.log(`🔗 [N8N] Sheets: ${sheetNames.join(', ')}`);
    
    // Prepare payload for n8n
    const payload = {
      sessionId,
      message,
      sheetNames,
      spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl,
      callbackUrl: input.callbackUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/n8n-callback`,
      timestamp: new Date().toISOString(),
      // Add additional context that n8n might need
      context: {
        source: 'genkit-chat',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Use the provided n8n webhook URL
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.sheetyai.com/webhook/c6bddb96-fe3e-4314-a07d-09435faed94f';
    
    console.log(`🔗 [N8N] Using webhook URL: ${n8nWebhookUrl}`);

    // Trigger the n8n workflow
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ReportAI-Genkit/1.0.0'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🔗 [N8N] Workflow failed with status ${response.status}:`, errorText);
      throw new Error(`N8N workflow failed: ${response.status} - ${errorText}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      // If response is not JSON, treat it as success
      result = { success: true, message: 'Workflow triggered successfully' };
    }

    console.log(`🔗 [N8N] Workflow triggered successfully:`, result);
    
    return `Processing sheet update via n8n... (Session: ${sessionId})`;
  } catch (error) {
    console.error('🔗 [N8N] Error triggering n8n workflow:', error);
    throw new Error(`Failed to trigger n8n workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Update the processMessage function to use n8n for sheet operations
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
    
    // Check for follow-up actions if we have recent analysis
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      if (timeSinceAnalysis < 5 * 60 * 1000) { // Within 5 minutes
        const followUpActions = generateFollowUpActions(message, context);
        if (followUpActions.length > 0) {
          suggestedTools.push(...followUpActions);
        }
      }
    }
    
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

    // Check if this is a sheet-related operation
    const isSheetOperation = lowerMessage.includes('add') || 
                           lowerMessage.includes('update') || 
                           lowerMessage.includes('insert') || 
                           lowerMessage.includes('sheet') ||
                           lowerMessage.includes('spreadsheet');

    if (isSheetOperation && context?.spreadsheetId && context?.sheetNames) {
      // Use n8n for sheet operations
      const n8nResult = await executeN8nTool({
        message,
        sheetNames: context.sheetNames,
        spreadsheetId: context.spreadsheetId,
        spreadsheetUrl: context.spreadsheetUrl
      });

      return {
        response: n8nResult.message,
        toolCalls: [],
        pendingToolCalls: [],
        toolResults: [n8nResult],
        context: context
      };
    }

    // Auto-execute all suggested tools
    const toolResults = [];
    let enhancedResponse = '';
    
    for (const toolCall of suggestedTools) {
      console.log(`🔍 [AUTO_EXECUTE] Auto-executing tool: ${toolCall.function.name}`);
      const result = await executeToolCall(toolCall, context, images);
      toolResults.push(result);
      
      // Store analysis results in context for future reference
      if (result.success) {
        if (toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images') {
          // Store file analysis results
          if (!context.fileAnalysis) {
            context.fileAnalysis = {
              files: [],
              lastUpdated: Date.now()
            };
          }
          
          // Parse the analysis result to extract structured data
          let analysisData = null;
          try {
            if (typeof result.result === 'string') {
              // Try to parse the result as JSON
              analysisData = JSON.parse(result.result);
            } else {
              analysisData = result.result;
            }
          } catch {
            analysisData = { rawResult: result.result };
          }
          
          // Store analysis for each file
          if (context.fileAnalysis) {
            images.forEach((image) => {
              context.fileAnalysis!.files.push({
                mimeType: image.mimeType,
                analysis: analysisData,
                extractedData: analysisData?.extracted_data || [],
                timestamp: Date.now()
              });
            });
            
            context.fileAnalysis.lastUpdated = Date.now();
            console.log(`🔍 [CONTEXT] Stored analysis for ${images.length} files, total files in context: ${context.fileAnalysis.files.length}`);
          }
          
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

    // Generate intelligent conversational response based on analysis results
    let response = '';
    const fileInfo = hasFiles ? ` along with ${images.length} ${images.length === 1 ? 'file' : 'files'}` : '';

    // Check if we have recent analysis results to provide intelligent suggestions
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const latestAnalysis = context.fileAnalysis.files[context.fileAnalysis.files.length - 1];
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      
      // If analysis was done recently (within last 5 minutes), provide intelligent response
      if (timeSinceAnalysis < 5 * 60 * 1000) {
        console.log(`🔍 [INTELLIGENT_RESPONSE] Generating intelligent response for recent analysis (${timeSinceAnalysis}ms ago)`);
        const extractedData = Array.isArray(latestAnalysis.extractedData) ? latestAnalysis.extractedData : [];
        
        if (extractedData.length > 0) {
          console.log(`🔍 [INTELLIGENT_RESPONSE] Found ${extractedData.length} data points to display`);
          response = `I've analyzed your file and found ${extractedData.length} data points. Here's what I found:\n\n`;
          
          // Add a summary of extracted data
          if (Array.isArray(extractedData)) {
            extractedData.slice(0, 5).forEach((item) => {
              if (item.field && item.value) {
                response += `• **${item.field}**: ${item.value}\n`;
              }
            });
            
            if (extractedData.length > 5) {
              response += `• ... and ${extractedData.length - 5} more items\n`;
            }
          }
          
          response += `\n**What would you like me to do next?**\n`;
          response += `1. 📊 Add this data to your spreadsheet\n`;
          response += `2. 🔍 Extract additional information\n`;
          response += `3. 📋 Generate a summary report\n`;
          response += `4. 💬 Ask me questions about the data`;
          
        } else {
          response = `I've analyzed your file but didn't find structured data to extract. The file appears to be a ${latestAnalysis.mimeType}.\n\n`;
          response += `**What would you like me to do next?**\n`;
          response += `1. 🔍 Try a different analysis approach\n`;
          response += `2. 📝 Extract text content instead\n`;
          response += `3. 📋 Generate a document summary\n`;
          response += `4. 💬 Ask me questions about the content`;
        }
      } else {
        // Analysis is older, provide standard response
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
      }
    } else {
      // No analysis results, use standard response logic
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
      toolResults: toolResults, // Include the results of auto-executed tools
      context: context // Return updated context with analysis results
    };

  } catch (error) {
    console.error('Message processing error:', error);
    return {
      response: `I encountered an error processing your message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolCalls: [],
      pendingToolCalls: [],
      toolResults: [],
      context: context // Return original context even on error
    };
  }
}

// New function to execute n8n tool
async function executeN8nTool(input: {
  message: string;
  sheetNames: string[];
  spreadsheetId?: string;
  spreadsheetUrl?: string;
}) {
  try {
    const { updateSheetViaN8n } = await import('../../genkit/tools');
    
    const result = await updateSheetViaN8n({
      message: input.message,
      sheetNames: input.sheetNames,
      spreadsheetId: input.spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl
    });

    return {
      success: true,
      result: result,
      message: result
    };
  } catch (error) {
    console.error('Error executing n8n tool:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to process sheet update via n8n'
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