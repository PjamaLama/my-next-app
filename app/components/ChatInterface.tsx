"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../providers/ChatProvider';
import { useSheet } from '../providers/SheetProvider';
import { Send, Loader2, Paperclip, File as FileIcon, X, Mic } from 'lucide-react';
import SheetChipSelector from './SheetChipSelector';
import EditRowModal from './EditRowModal';

interface ChatInterfaceProps {
  className?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  fileData?: string;
  extractedData: any;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  try {
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Base64 encoding failed:', error);
    throw new Error('Failed to encode file to base64');
  }
};

const extractImageText = async (file: File): Promise<string> => {
  try {
    return `Image: ${file.name} - Ready for Gemini Vision analysis`;
  } catch (error) {
    console.warn('Image processing failed:', error);
    return '';
  }
};

const extractPDFText = async (file: File): Promise<string> => {
  try {
    const text = await file.text();
    if (text.includes('(') && text.includes(')')) {
      const lines = text.split('\n')
        .filter(line => line.trim().length > 0)
        .filter(line => !line.startsWith('%') && !line.startsWith('/'))
        .slice(0, 50);
      return lines.join('\n');
    }
    return text;
  } catch (error) {
    console.warn('PDF text extraction failed, treating as scanned document:', error);
    return '';
  }
};

export default function ChatInterface({ className = '' }: ChatInterfaceProps) {
  const { chatMessages, addMessage, loading, error, ensureSession, setChatMessages, sessionsLoading, sessions, updateMessageTables, currentSessionId } = useChat();
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache } = useSheet();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [processingTables, setProcessingTables] = useState<Set<string>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setInputValue(finalTranscript + interimTranscript);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };
      
      speechRecognitionRef.current = recognition;
    }
  }, []);

  const handleToggleRecording = () => {
    if (isRecording) {
      speechRecognitionRef.current?.stop();
    } else {
      speechRecognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  useEffect(() => {
    console.log('🔍 [ChatInterface] Session change effect triggered:', { currentSessionId, sessionsLoading });
    if (currentSessionId && !sessionsLoading) {
      console.log('🔍 [ChatInterface] Session changed to:', currentSessionId);
      console.log('🔍 [ChatInterface] Current chat messages count:', chatMessages.length);
    }
  }, [currentSessionId, sessionsLoading, chatMessages.length]);

  useEffect(() => {
    const handleApproveUpdate = async (event: CustomEvent) => {
      const { preview } = event.detail;
      if (!preview) return;

      try {
        setProcessingTables(prev => new Set(prev).add('approve'));
        const headers = Array.isArray(preview.headers) ? preview.headers : [];
        const rows = Array.isArray(preview.rows) ? preview.rows : [];
        if (!defaultSpreadsheetId || (!preview.sheetName && (!selectedSheetNames || selectedSheetNames.length === 0))) {
          throw new Error('No spreadsheet or sheet selected. Please select a sheet or ensure the table has a target sheet.');
        }
        const rowObjects = rows.map((row: any[]) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((header: string, index: number) => {
            obj[header] = String(row[index] || '');
          });
          return obj;
        });
        const response = await fetch('/api/ingest-rows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: defaultSpreadsheetId,
            sheetName: preview.sheetName || selectedSheetNames[0],
            rows: rowObjects,
            dryRun: false
          })
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to apply changes');
        }
        const result = await response.json();
        if (preview.messageId != null && typeof preview.tableIndex === 'number') {
          setChatMessages(prev => prev.map(message => {
            if (message.id !== preview.messageId || !message.tables) return message;
            const filteredTables = message.tables.filter((_, i) => i !== preview.tableIndex);
            return { ...message, tables: filteredTables } as any;
          }));
          try {
            const target = chatMessages.find(m => m.id === preview.messageId);
            if (target && Array.isArray(target.tables)) {
              const filteredTables = target.tables.filter((_, i) => i !== preview.tableIndex);
              await updateMessageTables(target.id, filteredTables as any);
            }
          } catch (e) {
            console.error('Failed to persist approval table removal:', e);
          }
        }
        const targetSheetName = preview.sheetName || selectedSheetNames[0];
        await addMessage({
          role: 'assistant',
          content: `✅ Changes applied successfully! ${result.inserts || 0} rows added to sheet "${targetSheetName}" in the spreadsheet.`,
        });
      } catch (error) {
        console.error('Failed to approve update:', error);
        await addMessage({
          role: 'assistant',
          content: `❌ Failed to apply changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } finally {
        setProcessingTables(prev => {
          const newSet = new Set(prev);
          newSet.delete('approve');
          return newSet;
        });
      }
    };

    const handleRejectUpdate = async (event: CustomEvent) => {
      const { preview } = event.detail;
      if (!preview) return;
      try {
        setProcessingTables(prev => new Set(prev).add('reject'));
        if (preview.messageId != null && typeof preview.tableIndex === 'number') {
          setChatMessages(prev => prev.map(message => {
            if (message.id !== preview.messageId || !message.tables) return message;
            const filteredTables = message.tables.filter((_, i) => i !== preview.tableIndex);
            return { ...message, tables: filteredTables } as any;
          }));
          try {
            const target = chatMessages.find(m => m.id === preview.messageId);
            if (target && Array.isArray(target.tables)) {
              const filteredTables = target.tables.filter((_, i) => i !== preview.tableIndex);
              await updateMessageTables(target.id, filteredTables as any);
            }
          } catch (e) {
            console.error('Failed to persist rejection table removal:', e);
          }
        }
        await addMessage({
          role: 'assistant',
          content: '❌ Changes rejected. The table has been removed from the chat.',
        });
      } catch (error) {
        console.error('Failed to reject update:', error);
      } finally {
        setProcessingTables(prev => {
          const newSet = new Set(prev);
          newSet.delete('reject');
          return newSet;
        });
      }
    };

    window.addEventListener('chat:approve-update', handleApproveUpdate as unknown as EventListener);
    window.addEventListener('chat:reject-update', handleRejectUpdate as unknown as EventListener);

    return () => {
      window.removeEventListener('chat:approve-update', handleApproveUpdate as unknown as EventListener);
      window.removeEventListener('chat:reject-update', handleRejectUpdate as unknown as EventListener);
    };
  }, [defaultSpreadsheetId, selectedSheetNames, setChatMessages, addMessage, updateMessageTables, chatMessages]);

  const processFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const uploadedFile: UploadedFile = {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      status: 'uploading',
      extractedData: {
        type: 'metadata',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      }
    };
    try {
      uploadedFile.status = 'processing';
      if (file.type === 'text/csv') {
        try {
          const text = await file.text();
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            const headers = lines[0].split(',').map(h => h.trim());
            const rows = lines.slice(1).map(line =>
              line.split(',').map(cell => cell.trim())
            );
            const sampleRows = rows.slice(0, 5);
            uploadedFile.extractedData = {
              type: 'structured',
              format: 'csv',
              fileName: file.name,
              fileSize: file.size,
              headers,
              rows,
              rowCount: rows.length,
              columnCount: headers.length,
              sampleRows,
              hasData: rows.length > 0,
              extractedText: `CSV with ${rows.length} rows and ${headers.length} columns. Headers: ${headers.join(', ')}. Sample data: ${sampleRows.slice(0, 2).map(row => row.slice(0, 3).join(', ')).join('; ')}`,
              textLength: text.length,
              preview: {
                headers: headers.slice(0, 5),
                sampleData: sampleRows.slice(0, 3)
              }
            };
          }
        } catch (error) {
          console.warn('CSV parsing failed:', error);
          uploadedFile.extractedData = {
            type: 'error',
            format: 'csv',
            fileName: file.name,
            fileSize: file.size,
            error: 'Failed to parse CSV file'
          };
        }
      } else if (file.type === 'application/pdf') {
        try {
          console.log(`🔍 [PDF] Preparing PDF ${file.name} for backend processing`);
          const arrayBuffer = await file.arrayBuffer();
          const base64Data = arrayBufferToBase64(arrayBuffer);
          uploadedFile.extractedData = {
            type: 'document',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `PDF document: ${file.name} - Ready for backend processing`,
            textLength: 0,
            hasTextContent: false,
            needsBackendProcessing: true,
            pageCount: 0,
            isScannedDocument: false,
            note: 'PDF ready for backend pdf-parse processing'
          };
          uploadedFile.fileData = base64Data;
          console.log(`🔍 [PDF] Successfully prepared PDF: ${file.name}, fileData length: ${uploadedFile.fileData.length}`);
        } catch (conversionError) {
          console.error(`❌ [PDF] Failed to convert PDF to base64: ${file.name}`, conversionError);
          uploadedFile.extractedData = {
            type: 'document',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `PDF document: ${file.name} - Base64 conversion failed`,
            textLength: 0,
            hasTextContent: false,
            needsBackendProcessing: true,
            pageCount: 0,
            isScannedDocument: true,
            conversionError: conversionError instanceof Error ? conversionError.message : 'Unknown error'
          };
        }
      } else if (file.type.startsWith('image/')) {
        const extractedText = await extractImageText(file);
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);
        uploadedFile.extractedData = {
          type: 'image',
          format: file.type.split('/')[1],
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          extractedText: extractedText,
          textLength: extractedText.length,
          hasTextContent: false,
          needsBackendProcessing: true,
          note: 'Image ready for Gemini Vision analysis'
        };
        uploadedFile.fileData = base64Data;
      } else if (file.type.includes('spreadsheet')) {
        uploadedFile.extractedData = {
          type: 'spreadsheet',
          format: file.type.includes('openxmlformats') ? 'xlsx' : 'xls',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          extractedText: `Excel spreadsheet: ${file.name}`,
          textLength: file.name.length,
          hasData: true,
          needsBackendProcessing: true
        };
      }
      uploadedFile.status = 'completed';
      return uploadedFile;
    } catch (error) {
      uploadedFile.status = 'error';
      uploadedFile.error = error instanceof Error ? error.message : 'Failed to process file';
      return uploadedFile;
    }
  }, []);

  const handleFileSelect = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    const acceptedTypes = ['image/*', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const validFiles = fileArray.filter(file => {
      return acceptedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        }
        return file.type === type;
      });
    });

    if (uploadedFiles.length + validFiles.length > 5) {
      alert(`You can only upload up to 5 files at a time.`);
      return;
    }

    const newFiles: UploadedFile[] = [];
    for (const file of validFiles) {
      const processedFile = await processFile(file);
      newFiles.push(processedFile);
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, [uploadedFiles, processFile]);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && uploadedFiles.length === 0) || isSending || isProcessingFiles || sessionsLoading) return;

    const message = inputValue.trim() || 'Extract data from uploaded files and add to selected sheets';
    setInputValue('');
    setIsSending(true);
    setIsProcessingFiles(true);

    let structuredExtracts: any[] = [];

    try {
      await ensureSession();

      if (uploadedFiles.length > 0) {
        structuredExtracts = uploadedFiles.map(file => {
          const fileData: any = {
            name: file.name,
            mimeType: file.mimeType,
            extractedData: file.extractedData,
          };
          if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
            if (file.fileData) {
              fileData.data = file.fileData;
            }
          }
          return fileData;
        });
      }

      await addMessage({
        role: 'user',
        content: message,
      });

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
          })),
          images: structuredExtracts.length > 0 ? structuredExtracts : undefined,
        })
      });

      if (response.ok) {
        const aiResponse = await response.json();
        const preservedTables = aiResponse.tables ? aiResponse.tables.map((table: any) => {
          const rows = Array.isArray(table.rows) ? table.rows : (table.rows ? [table.rows] : []);
          return {
            title: table.title || '',
            headers: Array.isArray(table.headers) ? table.headers : [],
            rows: rows,
            rowCount: rows.length,
            summary: table.summary || '',
            meta: table.meta ? {
              sheetName: table.meta.sheetName || '',
              operations: table.meta.operations || {},
              requiresConfirmation: Boolean(table.meta.requiresConfirmation),
              isDryRun: Boolean(table.meta.isDryRun)
            } : {}
          }
        }) : [];
        
        await addMessage({
          role: 'assistant',
          content: aiResponse.reasoning || 'AI processing completed.',
          tables: preservedTables,
          insights: Array.isArray(aiResponse.insights) ? aiResponse.insights : [],
        });

        setUploadedFiles([]);
      } else {
        await addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      await addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setIsSending(false);
      setIsProcessingFiles(false);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(timestamp);
  };

  if (loading || sessionsLoading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${className}`}>
        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>{sessionsLoading ? 'Loading sessions...' : 'Loading chat...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
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
                <div className="text-sm">
                  {(!message.tables || message.tables.length === 0) && message.content}
                </div>
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
                {message.tables && message.tables.length > 0 && (
                  <div className="mt-3 space-y-4">
                    {message.tables.map((table, index) => (
                      <div key={index} className="bg-white/10 rounded p-3">
                        {table.title && (
                          <div className="font-semibold mb-2 text-emerald-300">
                            {table.title}
                          </div>
                        )}
                        {table.summary && (
                          <div className="text-sm text-white/80 mb-3">
                            {table.summary}
                          </div>
                        )}
                        {(() => {
                          const rows = Array.isArray(table.rows) ? table.rows : (table.rows ? [table.rows] : []);
                          if (rows.length > 0) {
                            return (
                              <>
                                <div className="overflow-x-auto mb-3">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-white/20">
                                        {Array.isArray(table.headers) && (table.headers as string[]).map((header: string, i: number) => (
                                          <th key={i} className="text-left p-2 font-medium text-white/80">
                                            {header}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(rows as any[][]).slice(0, 10).map((row: any[], rowIndex: number) => (
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
                                  {(rows as any[]).length > 10 && (
                                    <div className="text-center text-xs text-white/60 mt-2">
                                      Showing first 10 of {(rows as any[]).length} rows
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                                  <div className="text-xs text-white/60 mr-auto">
                                    📊 Target: <span className="text-emerald-300 font-medium">
                                      {table.meta?.sheetName || selectedSheetNames?.[0] || 'No sheet selected'}
                                    </span>
                                    {!table.meta?.sheetName && !selectedSheetNames?.[0] && (
                                      <span className="text-yellow-400 ml-2">⚠️ Select a sheet first</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (table.headers && rows) {
                                        const headers = Array.isArray(table.headers) ? table.headers : [];
                                        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : [];
                                        const normalizedRows = [
                                          headers.map((h, i) => ({ column: h, value: String(firstRow?.[i] ?? '') }))
                                        ];
                                        setEditModalData({
                                          headers,
                                          rows: normalizedRows,
                                          message: table.summary || `Edit data for ${table.title}`,
                                          messageId: message.id,
                                          tableIndex: index,
                                          title: table.title,
                                        });
                                        setEditModalOpen(true);
                                      }
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      const event = new CustomEvent('chat:approve-update', {
                                        detail: {
                                          preview: {
                                            headers: table.headers,
                                            rows: rows,
                                            message: table.summary || `Approve update for ${table.title}`,
                                            messageId: message.id,
                                            tableIndex: index,
                                            title: table.title,
                                            sheetName: table.meta?.sheetName || undefined,
                                          }
                                        }
                                      });
                                      window.dispatchEvent(event);
                                    }}
                                    disabled={processingTables.has('approve') || (!table.meta?.sheetName && !selectedSheetNames?.[0])}
                                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                                    title={(!table.meta?.sheetName && !selectedSheetNames?.[0]) ? 'Select a sheet first to approve this table' : 'Approve and submit this data to the sheet'}
                                  >
                                    {processingTables.has('approve') ? 'Applying...' : 'Approve'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const event = new CustomEvent('chat:reject-update', {
                                        detail: {
                                          preview: {
                                            headers: table.headers,
                                            rows: rows,
                                            message: table.summary || `Reject update for ${table.title}`,
                                            messageId: message.id,
                                            tableIndex: index,
                                            title: table.title,
                                            sheetName: table.meta?.sheetName || undefined,
                                          }
                                        }
                                      });
                                      window.dispatchEvent(event);
                                    }}
                                    disabled={processingTables.has('reject')}
                                    className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                                  >
                                    {processingTables.has('reject') ? 'Removing...' : 'Reject'}
                                  </button>
                                </div>
                              </>
                            );
                          } else {
                            return (
                              <div className="space-y-2 text-xs">
                                {Array.isArray(table.headers) && table.headers.length > 0 && (
                                  <div>
                                    <div className="font-medium text-emerald-300 mb-1">Headers:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {(table.headers as string[]).map((header: string, i: number) => (
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
                            );
                          }
                        })()}
                      </div>
                    ))}
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

      {error && (
        <div className="mx-6 mb-4 p-3 bg-red-500/10 border border-red-400/30 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {!sessionsLoading && sessions.length === 0 && (
        <div className="mx-6 mb-4 p-3 bg-yellow-500/10 border border-yellow-400/30 rounded-lg text-yellow-200 text-sm">
          Unable to load chat sessions. Please refresh the page or try again.
        </div>
      )}

      <div className="border-t border-white/10 p-6">
        <div className="mb-4">
          <SheetChipSelector />
        </div>
        
        {sessionsLoading && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg text-blue-200 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin h-4 w-4" />
              <span>Setting up your chat session...</span>
            </div>
          </div>
        )}
        
        {uploadedFiles.length > 0 && (
          <div className="mb-4 space-y-2">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-white/80">
                <div className="flex items-center gap-2">
                  <FileIcon className="w-4 h-4" />
                  <span className="text-sm">{file.name}</span>
                </div>
                <button onClick={() => removeFile(file.id)} className="p-1 hover:bg-white/10 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <form ref={formRef} onSubmit={handleSubmit} className="flex gap-3 items-center">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            className="hidden"
            disabled={isSending}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your data, request analysis, or get insights..."
            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={isSending}
          />
          <button
            type="button"
            onClick={handleToggleRecording}
            className={`p-3 rounded-lg transition-colors bg-white/10 hover:bg-white/20 text-white`}
            disabled={isSending || !speechRecognitionRef.current}
          >
            <Mic className={`w-5 h-5 ${isRecording ? 'text-red-400 animate-pulse' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            disabled={isSending}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={((!inputValue.trim() && uploadedFiles.length === 0) || isSending || isProcessingFiles || sessionsLoading)}
            className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center justify-center"
          >
            {isSending ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
      <EditRowModal
        isOpen={editModalOpen && editModalData !== null}
        onClose={() => {
          setEditModalOpen(false);
          setEditModalData(null);
        }}
        preview={editModalData || { headers: [], rows: [], message: '' }}
        onSubmit={async (rowData) => {
          if (editModalData && editModalData.headers) {
            const updatedRow = rowData.map(item => item.value);
            const messageId = editModalData.messageId as string | undefined;
            const tableIndex = editModalData.tableIndex as number | undefined;

            setChatMessages(prev => prev.map(msg => {
              if (msg.id !== messageId || !Array.isArray(msg.tables)) return msg;
              const tables = msg.tables.map((t, i) => {
                if (i !== tableIndex) return t;
                const currentRows = Array.isArray(t.rows) ? t.rows : [];
                const newRows = currentRows.length > 0 ? [updatedRow, ...currentRows.slice(1)] : [updatedRow];
                return { ...t, rows: newRows, rowCount: newRows.length } as any;
              });
              return { ...msg, tables };
            }));

            try {
              const targetMessage = chatMessages.find(m => m.id === messageId);
              if (targetMessage && Array.isArray(targetMessage.tables)) {
                const tablesForSave = targetMessage.tables.map((t, i) => {
                  if (i !== tableIndex) return t as any;
                  const currentRows = Array.isArray(t.rows) ? t.rows : [];
                  const newRows = currentRows.length > 0 ? [updatedRow, ...currentRows.slice(1)] : [updatedRow];
                  return { ...t, rows: newRows, rowCount: newRows.length } as any;
                });
                await updateMessageTables(targetMessage.id, tablesForSave as any);
              }
            } catch (e) {
              console.error('Failed to persist edited rows:', e);
            }
          }
          setEditModalOpen(false);
          setEditModalData(null);
        }}
        activeSheet={selectedSheetNames && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined}
      />
    </div>
  );
}
""
