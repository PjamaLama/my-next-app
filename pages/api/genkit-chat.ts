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
  sheetData?: any; // Add sheet data to context
  fileAnalysis?: {
    files: Array<{
      mimeType: string;
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
      analyses: data.analyses, // Pass through the analyses field
      extractions: data.extractions, // Pass through the extractions field
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
        // Note: Sheet operations are now handled by n8n, not through extract_data_from_files
        console.log(`🔍 [FOLLOW_UP] User wants to add data to spreadsheet - this will be handled by n8n`);
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

// Update the processMessage function to perform sheet operations via Genkit tools (no n8n)
async function processMessage(
  message: string, 
  context: Context, 
  conversationHistory: ConversationHistoryItem[], 
  images: ImageData[] = []
) {
  try {
    // Fetch sheet data if we have spreadsheet and sheet information
    let sheetData = null;
    if (context?.spreadsheetId && context?.sheetNames && context.sheetNames.length > 0) {
      try {
        console.log(`🔍 [PROCESS_MESSAGE] Fetching sheet data for ${context.sheetNames[0]} in ${context.spreadsheetId}`);
        
        // Fetch the current sheet data
        const sheetResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            spreadsheetId: context.spreadsheetId, 
            sheetName: context.sheetNames[0] 
          })
        });

        if (sheetResponse.ok) {
          const sheetResult = await sheetResponse.json();
          sheetData = sheetResult.data;
          console.log(`✅ [PROCESS_MESSAGE] Successfully fetched ${sheetData?.length || 0} rows of sheet data`);
        } else {
          console.warn(`⚠️ [PROCESS_MESSAGE] Failed to fetch sheet data: ${sheetResponse.status}`);
        }
      } catch (error) {
        console.error(`❌ [PROCESS_MESSAGE] Error fetching sheet data:`, error);
      }
    }

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
      // If the user's intent is sheet-related, run an end-to-end Genkit flow that extracts and updates the sheet
      const isSheetRelated = lowerMessage.includes('add') || 
                             lowerMessage.includes('update') || 
                             lowerMessage.includes('insert') || 
                             lowerMessage.includes('sheet') ||
                             lowerMessage.includes('spreadsheet');

      if (isSheetRelated) {
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'extract_data_from_files',
            arguments: JSON.stringify({ 
              transcript: message,
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
            })
          }
        });
      } else {
        // Otherwise, prefer a fast text-only extraction
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: hasPDFs ? 'analyze_files' : 'analyze_images',
            arguments: JSON.stringify({ 
              transcript: message,
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
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
      } else if (/\b[A-Z]{1,3}\d+\b/.test(message) && (lowerMessage.includes('set') || lowerMessage.includes('change') || lowerMessage.includes('update'))) {
        // Detect direct cell update like "set B12 to 123"
        const cellMatch = message.match(/\b([A-Z]{1,3}\d+)\b/);
        const valueMatch = message.match(/to\s+(.+)$/i);
        if (cellMatch && context?.spreadsheetId && context?.sheetNames?.length) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: 'update_single_cell',
              arguments: JSON.stringify({
                spreadsheetId: context.spreadsheetId,
                sheetName: context.sheetNames[0],
                cell: cellMatch[1],
                value: valueMatch ? valueMatch[1].trim() : ''
              })
            }
          });
        }
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

    // Auto-execute all suggested tools FIRST (including file analysis)
    const toolResults = [];
    let enhancedResponse = '';
    
    for (const toolCall of suggestedTools) {
      console.log(`🔍 [AUTO_EXECUTE] Auto-executing tool: ${toolCall.function.name}`);
      
      let result;
      
      // Use extract_text_only instead of analyze_files/analyze_images for faster processing when just analyzing
      if (toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images') {
        // Replace with extract_text_only for faster processing
        const extractToolCall = {
          ...toolCall,
          function: {
            ...toolCall.function,
            name: 'extract_text_only',
            arguments: JSON.stringify({
              transcript: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments).transcript || 'Extract text from files' : 'Extract text from files',
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
            })
          }
        };
        
        console.log(`🔍 [AUTO_EXECUTE] Replaced ${toolCall.function.name} with extract_text_only for faster processing`);
        result = await executeToolCall(extractToolCall, context, images);
      } else {
        result = await executeToolCall(toolCall, context, images);
      }
      
      toolResults.push(result);
      
      // Store analysis results in context for future reference
      if (result.success) {
        // Check the actual tool that was executed (not the original tool name)
        const executedToolName = toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images' 
          ? 'extract_text_only' 
          : toolCall.function.name;
          
        if (executedToolName === 'extract_text_only') {
          // Store extracted text results
          if (!context.fileAnalysis) {
            context.fileAnalysis = {
              files: [],
              lastUpdated: Date.now()
            };
          }
          
          // Get the extracted text directly from the result
          let extractedTexts = null;
          if (result.extractions && Array.isArray(result.extractions)) {
            // Use the extractions array directly
            extractedTexts = result.extractions.map((extraction: any) => 
              extraction.extractedText || ''
            );
            console.log(`🔍 [CONTEXT] Found extracted texts:`, extractedTexts.length, 'files');
          } else {
            extractedTexts = [];
          }
          
          // Store extracted text for each file
          if (context.fileAnalysis && extractedTexts) {
            images.forEach((image, index) => {
              context.fileAnalysis!.files.push({
                mimeType: image.mimeType,
                extractedData: extractedTexts[index] || '',
                timestamp: Date.now()
              });
            });
            
            context.fileAnalysis.lastUpdated = Date.now();
            console.log(`🔍 [CONTEXT] Stored extracted text for ${images.length} files, total files in context: ${context.fileAnalysis.files.length}`);
          }
          
          enhancedResponse += `\n\n📄 **Text Extraction Complete:**\n${result.result}`;
        } else if (executedToolName === 'analyze_files' || executedToolName === 'analyze_images') {
          // Store file analysis results (keeping this for backward compatibility)
          if (!context.fileAnalysis) {
            context.fileAnalysis = {
              files: [],
              lastUpdated: Date.now()
            };
          }
          
          // Get the extracted data directly from the result
          let extractedData = null;
          if (result.analyses && Array.isArray(result.analyses)) {
            // Use the analyses array directly
            extractedData = result.analyses.map((analysis: any) => 
              analysis.extractedData?.result?.extracted_data || analysis.extractedData || []
            ).flat();
            console.log(`🔍 [CONTEXT] Found analyses data:`, extractedData);
          } else if (result.details && result.details.analyses) {
            // Fallback: use the analyses data from details
            extractedData = result.details.analyses.map((analysis: any) => 
              analysis.extractedData?.result?.extracted_data || analysis.extractedData || []
            ).flat();
            console.log(`🔍 [CONTEXT] Found analyses data in details:`, extractedData);
          } else {
            // Fallback: try to parse the result as JSON
            try {
              if (typeof result.result === 'string') {
                const parsed = JSON.parse(result.result);
                extractedData = parsed.extracted_data || parsed.result?.extracted_data || [];
              } else {
                extractedData = result.result?.extracted_data || result.result?.result?.extracted_data || [];
              }
            } catch {
              extractedData = [];
            }
          }
          
          // Store extracted data for each file
          if (context.fileAnalysis && extractedData) {
            images.forEach((image) => {
              context.fileAnalysis!.files.push({
                mimeType: image.mimeType,
                extractedData: extractedData,
                timestamp: Date.now()
              });
            });
            
            context.fileAnalysis.lastUpdated = Date.now();
            console.log(`🔍 [CONTEXT] Stored extracted data for ${images.length} files, total files in context: ${context.fileAnalysis.files.length}`);
          }
          
          enhancedResponse += `\n\n📄 **File Analysis Complete:**\n${result.result}`;
        } else if (toolCall.function.name === 'update_sheet') {
          enhancedResponse += `\n\n✅ **Spreadsheet Updated:**\n${result.result}`;
        } else if (toolCall.function.name === 'get_sheet_data') {
          enhancedResponse += `\n\n📋 **Sheet Data Retrieved:**\n${result.result}`;
        } else if (toolCall.function.name === 'extract_data_from_files') {
          enhancedResponse += `\n\n✅ **Data Extracted and Sheet Updated:**\n${result.result}`;
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

// n8n tool removed: sheet updates are handled directly via Genkit flows in /api/genkit-tool-execute

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