"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../providers/ChatProvider';
import { useSheet } from '../providers/SheetProvider';
import { Send, Loader2, Paperclip, File as FileIcon, X, Volume2, Square, BookOpen } from 'lucide-react';
import SheetChipSelector from './SheetChipSelector';
import EditRowModal from './EditRowModal';
import ChatMessage from './ChatMessage';
import VoiceRecorder from './VoiceRecorder';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

interface ChatInterfaceProps {
  className?: string;
  onShowTutorial?: () => void;
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



export default function ChatInterface({ className = '', onShowTutorial }: ChatInterfaceProps) {
  const { chatMessages, addMessage, loading, error, ensureSession, setChatMessages, sessionsLoading, sessions, updateMessageTables, currentSessionId, retrySessionLoad, retryCount, clearErrorAndCreateSession, setAbortController, cancelChatGeneration } = useChat();
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache } = useSheet();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<any>(null);
  const [processingTables, setProcessingTables] = useState<Set<string>>(new Set());
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [filesBeingSent, setFilesBeingSent] = useState<UploadedFile[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firebaseFileUrlsRef = useRef<any[]>([]);
  
  // Handle transcript changes from voice recorder
  const handleTranscriptChange = useCallback((transcript: string) => {
    if (transcript && transcript.trim()) {
      setInputValue(prev => {
        const currentText = prev.trim();
        const newText = transcript.trim();
        
        // If current input is empty, set the transcript directly
        if (!currentText) {
          return newText;
        }
        
        // Otherwise, append the new transcript to existing content
        // This allows building up the message across multiple recording sessions
        return currentText + ' ' + newText;
      });
    }
  }, []);
  
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
        console.log('Available voices:', availableVoices);
      }
    };

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }, []);

  const handleReadAloud = (text: string, messageId: string) => {
    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices.find(voice => voice.name.includes('Google')) || 
                          voices.find(voice => voice.name.includes('Microsoft') && voice.lang.includes('en')) || 
                          voices.find(voice => voice.name.includes('en'));

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const handleEdit = (data: any) => {
    setEditModalData(data);
    setEditModalOpen(true);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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

    // Add new files with a staggered entrance effect
    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Add entrance animation after a brief delay to ensure DOM update
    setTimeout(() => {
      newFiles.forEach((file, index) => {
        const fileElement = document.querySelector(`[data-file-id="${file.id}"]`) as HTMLElement;
        if (fileElement) {
          fileElement.classList.add('file-transition-in');
          // Stagger the animations slightly
          fileElement.style.animationDelay = `${index * 0.1}s`;
        }
      });
    }, 50);
  }, [uploadedFiles, processFile]);

  const removeFile = useCallback((id: string) => {
    // Add transition effect before removing
    const fileElement = document.querySelector(`[data-file-id="${id}"]`) as HTMLElement;
    if (fileElement) {
      fileElement.classList.add('file-transition-out');
      setTimeout(() => {
        setUploadedFiles(prev => prev.filter(f => f.id !== id));
      }, 300); // Match the animation duration
    } else {
      setUploadedFiles(prev => prev.filter(f => f.id !== id));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && uploadedFiles.length === 0) || isSending || isProcessingFiles || sessionsLoading) return;

    const message = inputValue.trim() || 'Extract data from uploaded files and add to selected sheets';
    setInputValue('');
    setIsSending(true);
    setIsProcessingFiles(true);

    // Upload files to Firebase Storage first
    firebaseFileUrlsRef.current = [];
    if (uploadedFiles.length > 0) {
      try {
        const storage = getStorage();
        for (const file of uploadedFiles) {
          // Create a unique filename with timestamp
          const timestamp = Date.now();
          const fileName = `${timestamp}_${file.name}`;
          const storageRef = ref(storage, `temp-uploads/${fileName}`);
          
          // Convert base64 to blob for upload
          if (file.fileData) {
            const base64Response = await fetch(`data:${file.mimeType};base64,${file.fileData}`);
            const blob = await base64Response.blob();
            
            // Upload to Firebase Storage
            await uploadBytes(storageRef, blob);
            
            // Get download URL
            const downloadURL = await getDownloadURL(storageRef);
            
            firebaseFileUrlsRef.current.push({
              name: file.name,
              mimeType: file.mimeType,
              size: file.size,
              downloadURL: downloadURL
            });
          }
        }
      } catch (error) {
        console.error('Failed to upload files to Firebase:', error);
        await addMessage({
          role: 'assistant',
          content: 'Failed to upload files. Please try again.',
        });
        setIsSending(false);
        setIsProcessingFiles(false);
        return;
      }
    }

    const structuredExtracts = uploadedFiles.map(file => {
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

    // 🚀 ENHANCED LOGGING: Log what's being sent to the backend
    console.log('🚀 [FRONTEND] Sending files to backend for AI processing:', {
      message: message,
      totalFiles: structuredExtracts.length,
      fileDetails: structuredExtracts.map((file: any) => ({
        name: file.name,
        mimeType: file.mimeType,
        type: file.extractedData?.type,
        hasFileData: !!file.data,
        fileDataLength: file.data ? file.data.length : 0,
        extractedDataKeys: Object.keys(file.extractedData || {}),
        extractedDataSample: file.extractedData ? {
          type: file.extractedData.type,
          format: file.extractedData.format,
          hasText: !!file.extractedData.extractedText,
          textLength: file.extractedData.extractedText?.length || 0,
          textSample: file.extractedData.extractedText?.substring(0, 100) + '...',
          headers: file.extractedData.headers,
          rowCount: file.extractedData.rowCount,
          columnCount: file.extractedData.columnCount
        } : 'none'
      })),
      sheetContext: {
        selectedSheets: selectedSheetNames || [],
        sheetDataKeys: Object.keys(sheetDataCache || {}),
        conversationHistoryLength: chatMessages.length
      }
    });

    // Move files to "being sent" state for visual transition
    if (uploadedFiles.length > 0) {
      setFilesBeingSent([...uploadedFiles]);
      setUploadedFiles([]);
    }

    const controller = new AbortController();
    setAbortController(controller); // Set the abort controller in the ChatProvider

    try {
      await ensureSession();

      // Add user message first
      await addMessage({
        role: 'user',
        content: message,
      });

      // Show processing message for files if there are files
      if (structuredExtracts.length > 0) {
        console.log('🔄 [FRONTEND] Adding processing message for files:', structuredExtracts.length);
        await addMessage({
          role: 'assistant',
          content: `🔄 Processing ${structuredExtracts.length} file${structuredExtracts.length > 1 ? 's' : ''}... Please wait while I analyze the content.`,
        });
      }

             const requestBody = {
         message,
         context: {
           sheetNames: selectedSheetNames || [],
           sheetData: sheetDataCache || {}
         },
         // Truncate conversation history for performance and to reduce token count.
         // Filter out any processing messages to ensure clean conversation context
         conversationHistory: chatMessages
           .filter(m => !m.content.includes('🔄 Processing'))
           .slice(-8)
           .map(m => ({
             role: m.role,
             content: m.content
           })),
         fileUrls: firebaseFileUrlsRef.current.length > 0 ? firebaseFileUrlsRef.current : undefined,
       };

      // 🚀 ENHANCED LOGGING: Log the complete request payload
      console.log('🚀 [FRONTEND] Complete request payload to /api/genkit-chat:', {
        requestBody,
        payloadSize: JSON.stringify(requestBody).length,
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal, // Pass the signal to the fetch request
      });

      if (response.ok) {
        const aiResponse = await response.json();
        
        // Remove the processing message if it exists
        if (structuredExtracts.length > 0) {
          console.log('✅ [FRONTEND] Removing processing message after successful AI response');
          setChatMessages(prev => prev.filter(msg => 
            !msg.content.includes('🔄 Processing') || msg.role !== 'assistant'
          ));
        }
        
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

                 setFilesBeingSent([]); // Clear the "being sent" files
         
         // Clean up Firebase files after successful processing
         if (firebaseFileUrlsRef.current.length > 0) {
           try {
             const storage = getStorage();
             for (const fileInfo of firebaseFileUrlsRef.current) {
               const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
               if (fileName) {
                 const storageRef = ref(storage, `temp-uploads/${fileName}`);
                 await deleteObject(storageRef);
                 console.log(`Cleaned up Firebase file: ${fileName}`);
               }
             }
           } catch (cleanupError) {
             console.error('Failed to cleanup Firebase files:', cleanupError);
           }
         }
       } else {
        // Remove the processing message if it exists
        if (structuredExtracts.length > 0) {
          setChatMessages(prev => prev.filter(msg => 
            !msg.content.includes('🔄 Processing') || msg.role !== 'assistant'
          ));
        }
        
        await addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
        });
      }
    } catch (err: any) {
      // Remove the processing message if it exists
      if (structuredExtracts.length > 0) {
        setChatMessages(prev => prev.filter(msg => 
          !msg.content.includes('🔄 Processing') || msg.role !== 'assistant'
        ));
      }
      
      if (err.name === 'AbortError') {
        console.log('Chat generation aborted by user.');
        await addMessage({
          role: 'assistant',
          content: 'Chat generation stopped.',
        });
      } else {
        console.error('Failed to send message:', err);
        await addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        });
      }
             // Restore files to upload area if there was an error
       if (filesBeingSent.length > 0) {
         setUploadedFiles(prev => [...prev, ...filesBeingSent]);
         setFilesBeingSent([]);
       }
       
               // Clean up Firebase files if there was an error
        if (firebaseFileUrlsRef.current.length > 0) {
          try {
            const storage = getStorage();
            for (const fileInfo of firebaseFileUrlsRef.current) {
             const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
             if (fileName) {
               const storageRef = ref(storage, `temp-uploads/${fileName}`);
               await deleteObject(storageRef);
               console.log(`Cleaned up Firebase file after error: ${fileName}`);
             }
           }
         } catch (cleanupError) {
           console.error('Failed to cleanup Firebase files after error:', cleanupError);
         }
       }
    } finally {
      setIsSending(false);
      setIsProcessingFiles(false);
      setAbortController(null); // Clear the abort controller
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
      <WhatsAppLinkBanner />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="text-center text-white/60 py-12">
            <div className="text-2xl mb-2">👋</div>
            <h3 className="text-lg font-semibold mb-2">Welcome to SheetyAI!</h3>
            <p className="text-sm">
              Start a conversation to analyze your spreadsheet data, ask questions, or get insights.
            </p>
            <div className="mt-4 text-xs text-white/40">
              Try asking: "What's in my data?" or "Show me a summary of sales"
            </div>
            {onShowTutorial && (
              <div className="mt-6">
                <button
                  onClick={onShowTutorial}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm"
                >
                  <BookOpen className="w-4 h-4" />
                  Show Tutorial
                </button>
              </div>
            )}
          </div>
        ) : (
          chatMessages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              selectedSheetNames={selectedSheetNames}
              processingTables={processingTables}
              onEdit={handleEdit}
              onReadAloud={handleReadAloud}
              speakingMessageId={speakingMessageId}
              formatTimestamp={formatTimestamp}
            />
          ))
        )}
        {isSending && ( // Use the 'isSending' state for AI thinking indicator
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-3 bg-white/10 text-white border border-white/20">
              <div className="flex items-center space-x-1">
                <span className="dot-flashing"></span>
                <span className="dot-flashing"></span>
                <span className="dot-flashing"></span>
              </div>
            </div>
          </div>
        )}
        
        {/* Files being sent visual transition */}
        {filesBeingSent.length > 0 && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-lg px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white file-pulse shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="relative">
                  <Paperclip className="w-4 h-4" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping"></div>
                </div>
                <span className="text-sm font-medium">Processing files...</span>
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="space-y-2">
                {filesBeingSent.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 text-xs bg-white/10 rounded px-2 py-1">
                    <FileIcon className="w-3 h-3" />
                    <span className="truncate">{file.name}</span>
                    <div className="ml-auto">
                      <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mx-6 mb-4 p-3 bg-red-500/10 border border-red-400/30 rounded-lg text-red-200 text-sm">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            {retryCount < 3 && (
              <button 
                onClick={retrySessionLoad}
                className="ml-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {!sessionsLoading && sessions.length === 0 && !error && (
        <div className="mx-6 mb-4 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg text-blue-200 text-sm">
          <div className="flex items-center justify-between">
            <span>Setting up your first chat session...</span>
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
            </div>
          </div>
        </div>
      )}

      {!sessionsLoading && sessions.length === 0 && error && (
        <div className="mx-6 mb-4 p-3 bg-red-500/10 border border-red-400/30 rounded-lg text-red-200 text-sm">
          <div className="flex items-center justify-between">
            <span>Failed to create chat session automatically</span>
            <button 
              onClick={async () => {
                setIsCreatingSession(true);
                try {
                  await clearErrorAndCreateSession();
                } catch (err) {
                  console.error('Failed to create session:', err);
                } finally {
                  setIsCreatingSession(false);
                }
              }}
              disabled={isCreatingSession}
              className="ml-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs transition-colors disabled:opacity-50"
            >
              {isCreatingSession ? 'Creating...' : 'Create New Chat'}
            </button>
          </div>
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
            <div className="text-xs text-white/60 mb-2 flex items-center gap-2">
              <span>📎 Files ready to send ({uploadedFiles.length})</span>
              {isProcessingFiles && (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-white/80 file-transition-in" data-file-id={file.id}>
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
          <VoiceRecorder
            onTranscriptChange={handleTranscriptChange}
            disabled={isSending}
            className="p-3 rounded-lg transition-colors bg-white/10 hover:bg-white/20 text-white"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            disabled={isSending}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            type={isSending ? "button" : "submit"}
            onClick={isSending ? () => {
              if (isStopping) return; // Prevent rapid clicking
              console.log('🛑 [ChatInterface] Stop button clicked - cancelling chat generation');
              setIsStopping(true);
              cancelChatGeneration();
              // Immediately reset sending states for better UX
              setIsSending(false);
              setIsProcessingFiles(false);
                             // Restore files to upload area if they were being sent
               if (filesBeingSent.length > 0) {
                 setUploadedFiles(prev => [...prev, ...filesBeingSent]);
                 setFilesBeingSent([]);
               }
               
               // Clean up Firebase files if stop was clicked
               if (firebaseFileUrlsRef.current && firebaseFileUrlsRef.current.length > 0) {
                 try {
                   const storage = getStorage();
                   for (const fileInfo of firebaseFileUrlsRef.current) {
                     const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
                     if (fileName) {
                       const storageRef = ref(storage, `temp-uploads/${fileName}`);
                       deleteObject(storageRef).then(() => {
                         console.log(`Cleaned up Firebase file after stop: ${fileName}`);
                       }).catch((cleanupError) => {
                         console.error('Failed to cleanup Firebase file after stop:', cleanupError);
                       });
                     }
                   }
                 } catch (cleanupError) {
                   console.error('Failed to cleanup Firebase files after stop:', cleanupError);
                 }
               }
              // Re-enable stop button after a brief delay
              setTimeout(() => setIsStopping(false), 500);
            } : handleSubmit}
            disabled={isSending ? (isStopping) : ((!inputValue.trim() && uploadedFiles.length === 0) || sessionsLoading)}
            aria-label={isSending ? "Stop chat generation" : "Send message"}
            className={`p-3 rounded-lg transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isSending 
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 focus:ring-red-500' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500'
            } ${(!inputValue.trim() && uploadedFiles.length === 0) || sessionsLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'}`}
          >
            {isSending ? (
              <Square className="h-5 w-5" /> // Stop icon
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        {waId && (
          <div className="text-center text-xs text-gray-400 mt-4">
            WhatsApp linked: <span className="font-semibold">{waId}</span>. Start messaging at <span className="font-semibold">+1-555-SHEETYAI</span>.
          </div>
        )}
      </div>
      <EditRowModal
        isOpen={editModalOpen && editModalData !== null}
        onClose={() => {
          setEditModalOpen(false);
          setEditModalData(null);
        }}
        preview={editModalData || { headers: [], rows: [], message: '' }}
        onSubmit={async (editedRows) => {
          if (editModalData && editModalData.headers) {
            // Transform editedRows back to simple array of arrays (just values)
            const updatedRows = editedRows.map(row => row.map(item => item.value));
            const messageId = editModalData.messageId as string | undefined;
            const tableIndex = editModalData.tableIndex as number | undefined;

            setChatMessages(prev => prev.map(msg => {
              if (msg.id !== messageId || !Array.isArray(msg.tables)) return msg;
              const tables = msg.tables.map((t, i) => {
                if (i !== tableIndex) return t;
                // Replace the entire set of rows for this table
                return { ...t, rows: updatedRows, rowCount: updatedRows.length } as any;
              });
              return { ...msg, tables };
            }));

            try {
              const targetMessage = chatMessages.find(m => m.id === messageId);
              if (targetMessage && Array.isArray(targetMessage.tables)) {
                const tablesForSave = targetMessage.tables.map((t, i) => {
                  if (i !== tableIndex) return t as any;
                  // Replace the entire set of rows for this table
                  return { ...t, rows: updatedRows, rowCount: updatedRows.length } as any;
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
