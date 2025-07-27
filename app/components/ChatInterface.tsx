'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useSheet } from '../providers/SheetProvider';

// Types for chat messages and tool calls
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolResult {
  id: string;
  result: string;
  success: boolean;
}

// Available tools for the AI
interface AvailableTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

const availableTools: AvailableTool[] = [
  {
    name: 'update_sheet',
    description: 'Update Google Sheets with new data based on user voice input',
    parameters: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'The user voice transcript to process'
        },
        sheetData: {
          type: 'object',
          description: 'Current sheet data structure'
        }
      },
      required: ['transcript', 'sheetData']
    }
  },
  {
    name: 'get_sheet_data',
    description: 'Retrieve current data from a Google Sheet',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'Google Sheets spreadsheet ID'
        },
        sheetName: {
          type: 'string',
          description: 'Name of the sheet tab'
        }
      },
      required: ['spreadsheetId', 'sheetName']
    }
  },
  {
    name: 'analyze_voice_input',
    description: 'Analyze voice input to understand user intent',
    parameters: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'Voice transcript to analyze'
        }
      },
      required: ['transcript']
    }
  }
];

interface ChatInterfaceProps {
  transcript: string;
  isListening: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onClearTranscript: () => void;
}

export default function ChatInterface({
  transcript,
  isListening,
  onStartListening,
  onStopListening,
  onClearTranscript
}: ChatInterfaceProps) {
  const { user, geminiApiKey } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetName } = useSheet();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process voice transcript when it changes
  useEffect(() => {
    if (transcript.trim() && !isListening) {
      handleVoiceInput(transcript.trim());
    }
  }, [transcript, isListening]);

  const handleVoiceInput = async (voiceText: string) => {
    if (!voiceText.trim()) return;

    // Add user voice message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: voiceText,
      timestamp: new Date(),
      isVoice: true
    };

    setMessages(prev => [...prev, userMessage]);
    onClearTranscript();
    
    await processWithAI(voiceText, true);
  };

  const handleTextInput = async () => {
    if (!userInput.trim()) return;

    // Add user text message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date(),
      isVoice: false
    };

    setMessages(prev => [...prev, userMessage]);
    const inputText = userInput;
    setUserInput('');
    
    await processWithAI(inputText, false);
  };

  const processWithAI = async (input: string, isVoice: boolean) => {
    setIsProcessing(true);

    try {
      // Call Genkit AI chat endpoint with tool calling capabilities
      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          isVoice,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetName: selectedSheetName,
            availableTools
          },
          conversationHistory: messages.slice(-5) // Last 5 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle AI response with potential tool calls
      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response || 'I processed your request.',
        timestamp: new Date(),
        toolCalls: data.toolCalls || [],
        toolResults: data.toolResults || []
      };

      setMessages(prev => [...prev, aiMessage]);

      // Handle pending tool calls that need human approval
      if (data.pendingToolCalls && data.pendingToolCalls.length > 0) {
        setPendingToolCalls(data.pendingToolCalls);
      }

    } catch (error) {
      console.error('AI processing error:', error);
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const approveTool = async (toolCall: ToolCall) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toolCall,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetName: selectedSheetName
          }
        }),
      });

      const data = await response.json();
      
      // Update the message with tool result
      const resultMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'system',
        content: `Tool executed: ${toolCall.function.name}`,
        timestamp: new Date(),
        toolResults: [{
          id: toolCall.id,
          result: data.result || 'Tool executed successfully',
          success: data.success || false
        }]
      };

      setMessages(prev => [...prev, resultMessage]);
      setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));

    } catch (error) {
      console.error('Tool execution error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectTool = (toolCall: ToolCall) => {
    setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
    
    const rejectionMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'system',
      content: `Tool call rejected: ${toolCall.function.name}`,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, rejectionMessage]);
  };

  const clearChat = () => {
    setMessages([]);
    setPendingToolCalls([]);
  };

  if (!user) {
    return (
      <div className="p-4 text-center text-gray-500">
        Please sign in to use the chat interface.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-lg">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">AI Chat with Voice & Tools</h2>
          <button
            onClick={clearChat}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
          >
            Clear Chat
          </button>
        </div>
        {selectedSheetName && (
          <p className="text-sm opacity-90 mt-1">
            Connected to: {selectedSheetName}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p>Start a conversation with voice or text!</p>
            <p className="text-sm mt-2">The AI can help you update spreadsheets and more.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : message.role === 'system'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {message.role === 'user' && message.isVoice && (
                    <span className="text-xs">🎤</span>
                  )}
                  <span className="text-xs opacity-75">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p>{message.content}</p>
                
                {/* Tool calls display */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="mt-2 text-xs">
                    <p className="font-semibold">Suggested tools:</p>
                    {message.toolCalls.map((tool) => (
                      <div key={tool.id} className="mt-1 p-2 bg-white/20 rounded">
                        <p>{tool.function.name}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tool results display */}
                {message.toolResults && message.toolResults.length > 0 && (
                  <div className="mt-2 text-xs">
                    {message.toolResults.map((result) => (
                      <div key={result.id} className={`mt-1 p-2 rounded ${
                        result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        <p>{result.result}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-200 text-gray-800 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span>AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pending tool approvals */}
      {pendingToolCalls.length > 0 && (
        <div className="p-4 border-t bg-yellow-50">
          <h3 className="font-semibold text-yellow-800 mb-2">Tool Approval Required</h3>
          {pendingToolCalls.map((toolCall) => (
            <div key={toolCall.id} className="bg-white p-3 rounded border mb-2">
              <p className="font-medium">{toolCall.function.name}</p>
              <p className="text-sm text-gray-600 mb-2">
                {JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => approveTool(toolCall)}
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  disabled={isProcessing}
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectTool(toolCall)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  disabled={isProcessing}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          {/* Voice button */}
          <button
            onClick={isListening ? onStopListening : onStartListening}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isListening
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isListening ? '⏹️ Stop' : '🎤 Voice'}
          </button>

          {/* Text input */}
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleTextInput()}
            placeholder="Type your message or use voice..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />

          {/* Send button */}
          <button
            onClick={handleTextInput}
            disabled={!userInput.trim() || isProcessing}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>

        {/* Voice transcript display */}
        {transcript.trim() && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
            <span className="text-blue-600">Voice: </span>
            <span>{transcript}</span>
          </div>
        )}
      </div>
    </div>
  );
} 