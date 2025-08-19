"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../providers/ChatProvider';
import { useSheet } from '../providers/SheetProvider';
import { Send, Loader2 } from 'lucide-react';
import SheetChipSelector from './SheetChipSelector';

interface ChatInterfaceProps {
  className?: string;
}

export default function ChatInterface({ className = '' }: ChatInterfaceProps) {
  const { chatMessages, addMessage, loading, error, ensureSession } = useChat();
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache } = useSheet();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const message = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    try {
      // Ensure we have a valid session before adding messages
      await ensureSession();
      
      // Add user message to chat
      await addMessage({
        role: 'user',
        content: message,
      });

      // Call AI service to get response
      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            sheetNames: selectedSheetNames || [],
            sheetData: sheetDataCache || {}
          },
          conversationHistory: chatMessages.slice(-5).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      // Debug logging
      console.log('🔍 [CHAT] Sending to genkit-chat:', {
        message,
        selectedSheetNames,
        sheetDataCacheKeys: Object.keys(sheetDataCache || {}),
        sheetDataCacheSample: Object.fromEntries(
          Object.entries(sheetDataCache || {}).map(([name, data]) => [
            name, 
            { 
              isArray: Array.isArray(data), 
              length: Array.isArray(data) ? data.length : 'N/A',
              hasHeaders: Array.isArray(data) && data.length > 0 ? Array.isArray(data[0]) : false
            }
          ])
        )
      });

      if (response.ok) {
        const aiResponse = await response.json();
        
        // Debug logging to see what n8n is returning
        console.log('🔍 [N8N Response] Full AI response:', aiResponse);
        console.log('🔍 [N8N Response] Tables:', aiResponse.tables);
        if (aiResponse.tables && aiResponse.tables.length > 0) {
          aiResponse.tables.forEach((table: any, index: number) => {
            console.log(`🔍 [N8N Response] Table ${index}:`, {
              title: table.title,
              headers: table.headers,
              rows: table.rows,
              rowCount: table.rowCount,
              summary: table.summary,
              meta: table.meta
            });
          });
        }
        
        // Preserve table data for approve/reject/edit functionality
        const preservedTables = aiResponse.tables ? aiResponse.tables.map((table: any) => {
          // Handle n8n response format where rows might be nested
          let processedRows = [];
          if (Array.isArray(table.rows)) {
            // Check if rows are nested one level too deep (n8n format)
            if (table.rows.length > 0 && Array.isArray(table.rows[0]) && Array.isArray(table.rows[0][0])) {
              // Unwrap the extra nesting level
              processedRows = table.rows[0];
            } else {
              processedRows = table.rows;
            }
          }
          
          return {
            title: table.title || '',
            headers: Array.isArray(table.headers) ? table.headers : [],
            rows: processedRows, // Use processed rows
            rowCount: processedRows.length,
            summary: table.summary || '',
            meta: table.meta ? {
              sheetName: table.meta.sheetName || '',
              operations: table.meta.operations || {},
              requiresConfirmation: Boolean(table.meta.requiresConfirmation),
              isDryRun: Boolean(table.meta.isDryRun)
            } : {}
          };
        }) : [];
        
        console.log('🔍 [N8N Response] Preserved tables:', preservedTables);
        
        // Additional debugging for processed rows
        preservedTables.forEach((table: any, index: number) => {
          console.log(`🔍 [Processed Table ${index}]`, {
            title: table.title,
            headers: table.headers,
            rows: table.rows,
            rowCount: table.rowCount,
            rowsType: Array.isArray(table.rows) ? 'Array' : typeof table.rows,
            firstRow: Array.isArray(table.rows) && table.rows.length > 0 ? table.rows[0] : 'No rows'
          });
        });
        
        // Add AI response to chat
        await addMessage({
          role: 'assistant',
          content: aiResponse.reasoning || 'AI processing completed.',
          tables: preservedTables,
          insights: Array.isArray(aiResponse.insights) ? aiResponse.insights : [],
          quickReplies: Array.isArray(aiResponse.quickReplies) ? aiResponse.quickReplies : []
        });
      } else {
        // Add error message if AI service fails
        await addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // Add error message to chat
      await addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(timestamp);
  };

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${className}`}>
        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Loading chat...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="text-center text-white/60 py-12">
            <div className="text-2xl mb-2">👋</div>
            <h3 className="text-lg font-semibold mb-2">Welcome to Report AI!</h3>
            <p className="text-sm">
              Start a conversation to analyze your spreadsheet data, ask questions, or get insights.
            </p>
            <div className="mt-4 text-xs text-white/40">
              Try asking: "What's in my data?" or "Show me a summary of sales"
            </div>
          </div>
        ) : (
          chatMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 text-white border border-white/20'
                }`}
              >
                <div className="text-sm">{message.content}</div>
                {message.tables && message.tables.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.tables.map((table, index) => (
                      <div key={index} className="bg-white/10 rounded p-3">
                        {table.title && (
                          <div className="font-semibold mb-2 text-emerald-300">
                            {table.title}
                          </div>
                        )}
                        
                        {/* Debug information - show what data we actually have */}
                        <div className="mb-3 p-2 bg-yellow-900/20 border border-yellow-800/30 rounded text-xs text-yellow-200">
                          <div className="font-medium mb-1">Debug Info:</div>
                          <div>Headers: {table.headers?.length || 0}</div>
                          <div>Rows data: {table.rows ? 'Present' : 'Missing'}</div>
                          <div>Row count: {table.rowCount || 0}</div>
                          <div>Summary: {table.summary || 'None'}</div>
                          <div>Rows type: {typeof table.rows}</div>
                          <div>Rows value: {JSON.stringify(table.rows).substring(0, 100)}...</div>
                        </div>
                        
                        {/* Show actual table data if available */}
                        {(() => {
                          try {
                            if (!table.rows) return null;
                            const parsedRows = JSON.parse(table.rows);
                            if (Array.isArray(parsedRows) && parsedRows.length > 0) {
                              return (
                                <div className="overflow-x-auto mb-3">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-white/20">
                                        {table.headers?.map((header: string, i: number) => (
                                          <th key={i} className="text-left p-2 font-medium text-white/80">
                                            {header}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {parsedRows.slice(0, 10).map((row: any[], rowIndex: number) => (
                                        <tr key={rowIndex} className="border-b border-white/10">
                                          {row.map((cell: any, cellIndex: number) => (
                                            <td key={cellIndex} className="p-2 text-white/90">
                                              {String(cell || '')}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {parsedRows.length > 10 && (
                                    <div className="text-center text-xs text-white/60 mt-2">
                                      Showing first 10 rows of {parsedRows.length}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          } catch (e) {
                            console.warn('Failed to parse table rows:', e);
                          }
                          return null;
                        })()}
                        
                        {/* Action buttons for approve/reject/edit */}
                        {(() => {
                          try {
                            if (!table.rows) return null;
                            const parsedRows = JSON.parse(table.rows);
                            if (Array.isArray(parsedRows) && parsedRows.length > 0) {
                              return (
                                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                                  <button
                                    onClick={() => {
                                      // Trigger edit modal via custom event
                                      const event = new CustomEvent('chat:open-edit-modal', {
                                        detail: {
                                          preview: {
                                            headers: table.headers,
                                            rows: parsedRows,
                                            message: table.summary || `Edit data for ${table.title}`
                                          }
                                        }
                                      });
                                      window.dispatchEvent(event);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Trigger approve action via custom event
                                      const event = new CustomEvent('chat:approve-update', {
                                        detail: {
                                          preview: {
                                            headers: table.headers,
                                            rows: parsedRows,
                                            message: table.summary || `Approve update for ${table.title}`
                                          }
                                        }
                                      });
                                      window.dispatchEvent(event);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Trigger reject action via custom event
                                      const event = new CustomEvent('chat:reject-update', {
                                        detail: {
                                          preview: {
                                            headers: table.headers,
                                            rows: parsedRows,
                                            message: table.summary || `Reject update for ${table.title}`
                                          }
                                        }
                                      });
                                      window.dispatchEvent(event);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              );
                            }
                          } catch (e) {
                            console.warn('Failed to parse table rows for actions:', e);
                          }
                          return null;
                        })()}
                        
                        {/* Fallback metadata display if no rows */}
                        {(() => {
                          try {
                            if (!table.rows) return true;
                            const parsedRows = JSON.parse(table.rows);
                            return !Array.isArray(parsedRows) || parsedRows.length === 0;
                          } catch (e) {
                            return true; // If parsing fails, show fallback
                          }
                        })() && (
                          <div className="space-y-2 text-xs">
                            {table.headers && table.headers.length > 0 && (
                              <div>
                                <div className="font-medium text-emerald-300 mb-1">Headers:</div>
                                <div className="flex flex-wrap gap-1">
                                  {table.headers.map((header: string, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-white/10 rounded text-white/80">
                                      {header}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {table.rowCount > 0 && (
                              <div className="text-white/70">
                                <span className="font-medium">Rows:</span> {table.rowCount}
                              </div>
                            )}
                            {table.summary && (
                              <div className="text-white/80">
                                <span className="font-medium">Summary:</span> {table.summary}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {message.insights && message.insights.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-emerald-300 mb-2">Insights:</div>
                    <ul className="text-xs space-y-1">
                      {message.insights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-emerald-400 mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-xs opacity-70 mt-2">
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mb-4 p-3 bg-red-500/10 border border-red-400/30 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-white/10 p-6">
        {/* Sheet Selector - Added above input field */}
        <div className="mb-4">
          <SheetChipSelector />
        </div>
        
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your data, request analysis, or get insights..."
            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isSending}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
          >
            {isSending ? (
              <Loader2 className="animate-spin h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
