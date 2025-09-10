"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../providers/ChatProvider';
import { useSheet } from '../providers/SheetProvider';
import { useFirebase } from '../providers/FirebaseProvider';
import WhatsAppLinkBanner from './WhatsAppLinkBanner';
import { Send, Loader2, Paperclip, File as FileIcon, X, Volume2, Square, BookOpen } from 'lucide-react';
import SheetChipSelector from './SheetChipSelector';
import EditRowModal from './EditRowModal';
import ChatMessage from './ChatMessage';
import VoiceRecorder from './VoiceRecorder';
import WhatsAppStartChattingBanner from './WhatsAppStartChattingBanner';

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAdminMeta } from '../hooks/useAdminMeta';
import { useMessageLimits } from '../hooks/useMessageLimits';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';
import { useWhatsAppBannerVisibility } from '../hooks/useWhatsAppBannerVisibility';
import { useTutorial } from '../providers/TutorialProvider';
import { arrayBufferToBase64, extractImageText, extractPDFText, validateFileForUpload, type UploadedFile } from '../../lib/utils/chatFileUtils';
import { trackConversion, trackUserInteraction, trackFeatureUsage } from '@/lib/analytics/safeAnalytics';
import InteractiveTutorial from './InteractiveTutorial';

interface ChatInterfaceProps {
  className?: string;
  onShowTutorial?: () => void;
}





export default function ChatInterface({ className = '', onShowTutorial }: ChatInterfaceProps) {
  const { chatMessages, addMessage, error, ensureSession, setChatMessages, updateMessageTables, currentSessionId, clearErrorAndCreateSession, setAbortController, cancelChatGeneration } = useChat();
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache } = useSheet();
  const { user, waId, userType } = useFirebase();
  const { meta: adminMeta } = useAdminMeta();
  const { canSendMessage, incrementUsage, isLimitReached, dailyUsage, limit } = useMessageLimits();
  const { openModal } = useUpgradeModal();
  const { bannerMode, isVisible: isWhatsAppBannerVisible } = useWhatsAppBannerVisibility();
  const { isTutorialVisible, hideTutorial } = useTutorial();
  const [inputValue, setInputValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalData, setEditModalData] = useState<any>(null);
  const [processingTables, setProcessingTables] = useState<Set<string>>(new Set());
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Session-specific states - reset when session changes
  const [isSending, setIsSending] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [filesBeingSent, setFilesBeingSent] = useState<UploadedFile[]>([]);
  const [isStopping, setIsStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firebaseFileUrlsRef = useRef<any[]>([]);

  // Reset session-specific states when session changes
  useEffect(() => {
    setIsSending(false);
    setIsProcessingFiles(false);
    setFilesBeingSent([]);
    setIsStopping(false);
    setInputValue(''); // Clear input when switching sessions
    setUploadedFiles([]); // Clear uploaded files when switching sessions
  }, [currentSessionId]);
  
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
    // Handle session changes - scroll behavior managed by messages effect above
  }, [currentSessionId, chatMessages.length]);

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
          // Prepare PDF for backend processing
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
          // PDF successfully prepared for backend processing
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

    // Validate files with size limits based on user plan
    const validFiles = fileArray.filter(file => {
      // First check file type
      const isTypeValid = acceptedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        }
        return file.type === type;
      });

      if (!isTypeValid) {
        alert(`File type not supported: ${file.name}`);
        return false;
      }

      // Then check file size based on user plan
      const validation = validateFileForUpload(file, userType);
      if (!validation.valid) {
        alert(`${file.name}: ${validation.error}`);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) {
      return; // No valid files
    }

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
  }, [uploadedFiles, processFile, userType]);

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
    if ((!inputValue.trim() && uploadedFiles.length === 0) || isSending || isProcessingFiles) return;

    // Check if any files are still processing
    const processingFiles = uploadedFiles.filter(file => file.status === 'processing');
    if (processingFiles.length > 0) {
      console.log('⏳ [ChatInterface] Waiting for file processing to complete:', processingFiles.map(f => f.name));
      // Show user feedback that files are still processing
      await addMessage({
        role: 'assistant',
        content: `⏳ Please wait, I'm still processing ${processingFiles.length} file${processingFiles.length > 1 ? 's' : ''}. This usually takes just a few seconds...`
      });
      return;
    }

    // Prevent duplicate submissions
    if (isSending) return;

    // Check message limits for free users
    if (userType === 'free' && !canSendMessage) {
      openModal(); // Open upgrade modal
      return;
    }

    // Increment usage counter for free users
    if (userType === 'free') {
      const canIncrement = await incrementUsage();
      if (!canIncrement) {
        // Limit reached, open upgrade modal
        openModal();
        return;
      }
      // Force immediate refresh of message counter
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('message-counter-refresh'));
      }, 100);
    }

    const message = inputValue.trim() || 'Extract data from uploaded files and add to selected sheets';
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
              downloadURL: downloadURL,
              storagePath: `temp-uploads/${fileName}` // Store the original storage path for cleanup
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

      // Track first message sent conversion
      if (chatMessages.length === 0) {
        // This is the first message in the session
        trackConversion('first_message_sent');
        trackUserInteraction('chat', 'first_message', 'sent');
      } else {
        // Track regular message interactions
        trackUserInteraction('chat', 'message_sent', 'user');
      }

      // Track feature usage
      trackFeatureUsage('chat', 'message_sent', {
        hasFiles: uploadedFiles.length > 0,
        messageLength: message.length,
        fileCount: uploadedFiles.length
      });

      // Clear input only after message is successfully added
      setInputValue('');

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
              if (fileInfo.storagePath) {
                const storageRef = ref(storage, fileInfo.storagePath);
                await deleteObject(storageRef);
                console.log(`Cleaned up Firebase file: ${fileInfo.storagePath}`);
              } else {
                // Fallback to old method if storagePath is not available
                const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
                if (fileName && fileName.includes('temp-uploads%2F')) {
                  // Extract just the filename part after temp-uploads%2F
                  const actualFileName = fileName.split('temp-uploads%2F')[1];
                  if (actualFileName) {
                    const storageRef = ref(storage, `temp-uploads/${actualFileName}`);
                    await deleteObject(storageRef);
                    console.log(`Cleaned up Firebase file (fallback): temp-uploads/${actualFileName}`);
                  }
                }
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
              if (fileInfo.storagePath) {
                const storageRef = ref(storage, fileInfo.storagePath);
                await deleteObject(storageRef);
                console.log(`Cleaned up Firebase file after error: ${fileInfo.storagePath}`);
              } else {
                // Fallback to old method if storagePath is not available
                const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
                if (fileName && fileName.includes('temp-uploads%2F')) {
                  // Extract just the filename part after temp-uploads%2F
                  const actualFileName = fileName.split('temp-uploads%2F')[1];
                  if (actualFileName) {
                    const storageRef = ref(storage, `temp-uploads/${actualFileName}`);
                    await deleteObject(storageRef);
                    console.log(`Cleaned up Firebase file after error (fallback): temp-uploads/${actualFileName}`);
                  }
                }
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

      // Fallback: ensure input is cleared even if message addition failed
      if (inputValue.trim() && inputValue.trim() === message) {
        setInputValue('');
      }
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(timestamp);
  };

  // Removed blocking loading state - chat loads instantly

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <WhatsAppLinkBanner />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
        {chatMessages.length === 0 ? (
          <div className="text-center text-white/60 py-8 sm:py-12 px-4">
            <div className="text-3xl mb-3">👋</div>
            <h3 className="text-xl sm:text-lg font-semibold mb-3">Welcome to SheetyAI!</h3>
            <p className="text-base sm:text-sm leading-relaxed">
              Talk to update your sheets! Use voice, type text, or upload files to process and update your Google Sheets.
            </p>
            <div className="mt-4 text-sm text-white/40 max-w-md mx-auto">
              Try: "Add this data to my sales sheet" or "Upload this PDF and extract the information"
            </div>
            {onShowTutorial && (
              <div className="mt-8">
                <button
                  onClick={onShowTutorial}
                  className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-base font-medium min-h-[48px] active:scale-95"
                >
                  <BookOpen className="w-5 h-5" />
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
          <span>{error}</span>
        </div>
      )}

      {/* Removed session loading states - loads instantly */}

      <div className="border-t border-white/10 p-4 sm:p-6 pt-3 sm:pt-6">
        {/* Mobile-optimized sheet selector */}
        <div className="mb-3 sm:mb-4">
          <SheetChipSelector />
        </div>
        
        {/* Removed session loading indicator - loads instantly */}
        
        {uploadedFiles.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-xs text-white/60 mb-3 flex items-center gap-2 px-1">
              <span>📎 Files ready to send ({uploadedFiles.length})</span>
              {isProcessingFiles && (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl text-white/80 file-transition-in" data-file-id={file.id}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {file.status === 'processing' ? (
                      <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin text-amber-400" />
                    ) : file.status === 'completed' ? (
                      <div className="w-5 h-5 flex-shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : file.status === 'error' ? (
                      <div className="w-5 h-5 flex-shrink-0 rounded-full bg-red-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    ) : (
                      <FileIcon className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                    )}
                    <span className="text-sm truncate font-medium">{file.name}</span>
                    {file.status === 'processing' && (
                      <span className="text-xs text-amber-400 ml-2">Processing...</span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-xs text-red-400 ml-2">Error</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 hover:bg-white/10 rounded-lg active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center ml-2 transition-colors"
                    disabled={file.status === 'processing'}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}



        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            className="hidden"
            disabled={isSending}
          />

          {/* Main input field */}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              userType === 'free' && isLimitReached
                ? "Daily limit reached. Upgrade to Pro for unlimited messages!"
                : "Ask about your data, request analysis, or get insights..."
            }
            className="w-full px-4 py-3 min-h-[52px] bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-base"
            data-tutorial="chat-input"
            disabled={isSending || (userType === 'free' && isLimitReached)}
          />

          {/* Compact WhatsApp-style button layout */}
          <div className="flex items-center justify-end gap-1.5">
            {/* Attachment buttons group - compact */}
            <div className="flex items-center gap-1">
              <VoiceRecorder
                onTranscriptChange={handleTranscriptChange}
                disabled={isSending || (userType === 'free' && isLimitReached)}
                className="w-9 h-9 rounded-full transition-all duration-150 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 shadow-md hover:shadow-lg backdrop-blur-sm border border-white/20"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 rounded-full transition-all duration-150 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 shadow-md hover:shadow-lg backdrop-blur-sm border border-white/20"
                disabled={isSending || (userType === 'free' && isLimitReached)}
                data-tutorial="file-upload"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            {/* Send button - prominent floating action button */}
            <button
              type="button"
              onClick={
                userType === 'free' && isLimitReached
                  ? () => openModal()
                  : isSending
                    ? () => {
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
                              if (fileInfo.storagePath) {
                                const storageRef = ref(storage, fileInfo.storagePath);
                                deleteObject(storageRef).then(() => {
                                  console.log(`Cleaned up Firebase file after stop: ${fileInfo.storagePath}`);
                                }).catch((cleanupError) => {
                                  console.error('Failed to cleanup Firebase file after stop:', cleanupError);
                                });
                              } else {
                                // Fallback to old method if storagePath is not available
                                const fileName = fileInfo.downloadURL.split('/').pop()?.split('?')[0];
                                if (fileName && fileName.includes('temp-uploads%2F')) {
                                  // Extract just the filename part after temp-uploads%2F
                                  const actualFileName = fileName.split('temp-uploads%2F')[1];
                                  if (actualFileName) {
                                    const storageRef = ref(storage, `temp-uploads/${actualFileName}`);
                                    deleteObject(storageRef).then(() => {
                                      console.log(`Cleaned up Firebase file after stop (fallback): temp-uploads/${actualFileName}`);
                                    }).catch((cleanupError) => {
                                      console.error('Failed to cleanup Firebase file after stop (fallback):', cleanupError);
                                    });
                                  }
                                }
                              }
                            }
                          } catch (cleanupError) {
                            console.error('Failed to cleanup Firebase files after stop:', cleanupError);
                          }
                        }
                        // Re-enable stop button after a brief delay
                        setTimeout(() => setIsStopping(false), 500);
                      }
                    : () => handleSubmit(new Event('submit') as any)
              }
              disabled={
                isSending
                  ? isStopping
                  : (userType === 'free' && isLimitReached)
                    ? true
                    : (!inputValue.trim() && uploadedFiles.length === 0) ||
                      uploadedFiles.some(file => file.status === 'processing')
              }
              aria-label={
                userType === 'free' && isLimitReached
                  ? "Upgrade to Pro for unlimited messages"
                  : isSending
                    ? "Stop chat generation"
                    : uploadedFiles.some(file => file.status === 'processing')
                      ? "Files are still processing..."
                      : "Send message"
              }
              className={`w-11 h-11 rounded-full transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg hover:shadow-xl ml-1 ${
                isSending
                  ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500'
                  : uploadedFiles.some(file => file.status === 'processing')
                    ? 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500'
                    : userType === 'free' && isLimitReached
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-500'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-500'
              } ${
                (userType === 'free' && isLimitReached) ||
                (!inputValue.trim() && uploadedFiles.length === 0) ||
                uploadedFiles.some(file => file.status === 'processing')
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:scale-105 cursor-pointer active:scale-95'
              }`}
            >
              {isSending ? (
                <Square className="h-4 w-4" />
              ) : uploadedFiles.some(file => file.status === 'processing') ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>


        {/* WhatsApp banner with mobile spacing */}
        <div className="mt-2 sm:mt-0">
          {waId ? (
            <WhatsAppStartChattingBanner />
          ) : (
            <div className="text-center text-xs text-gray-400 mt-3">
              <div
                className="bg-gradient-to-r from-blue-600/20 to-blue-700/20 border border-blue-500/30 rounded-md p-2 inline-block cursor-pointer hover:bg-blue-600/30 transition-colors"
                onClick={() => window.location.href = '/whatsapp-setup'}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    window.location.href = '/whatsapp-setup';
                  }
                }}
                aria-label="Link your WhatsApp number"
              >
                <div className="flex items-center gap-2 text-blue-300">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Link your WhatsApp number</span>
                  <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
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

      {/* Interactive Tutorial */}
      <InteractiveTutorial
        isVisible={isTutorialVisible}
        onClose={hideTutorial}
      />
    </div>
  );
}
