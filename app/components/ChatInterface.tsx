"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../providers/ChatProvider';
import { useSheet } from '../providers/SheetProvider';
import { useFirebase } from '../providers/FirebaseProvider';
import WhatsAppLinkBanner from './WhatsAppLinkBanner';
import { Send, Loader2, Paperclip, File as FileIcon, X, Volume2, Square, BookOpen, Crown } from 'lucide-react';
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
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache, isSheetDataLoading } = useSheet();
  const [sheetDataLoadStartTime, setSheetDataLoadStartTime] = useState<number | null>(null);

  // Track sheet data loading state changes
  useEffect(() => {
    if (isSheetDataLoading && selectedSheetNames.length > 0) {
      setSheetDataLoadStartTime(Date.now());
    } else {
      setSheetDataLoadStartTime(null);
    }
  }, [isSheetDataLoading, selectedSheetNames.length]);
  const { user, waId, userType, isBetaUser } = useFirebase();
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
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Loading messages - mostly useful status updates and pro tips, with occasional funny sprinkles
  const loadingMessages = [
    // Actual processing status updates
    "🔄 Analyzing your request and connecting to Google Sheets...",
    "📊 Reading sheet structure and column headers...",
    "🔍 Scanning for existing data patterns and relationships...",
    "🧠 Processing your message with AI intelligence...",
    "⚡ Optimizing data extraction and formatting...",
    "📝 Preparing sheet updates and validation checks...",
    "🔗 Establishing secure connection to your spreadsheet...",
    "📋 Validating data types and ensuring accuracy...",
    "✨ Applying AI insights to your data...",
    "💾 Saving changes and syncing with Google Sheets...",

    // Pro tips for better results
    "💡 Pro tip: Convert your sheet data to a table in Google Sheets for better AI processing",
    "💡 Tip: Highlight your data, right-click and select 'Convert to table' for optimal results",
    "💡 Pro tip: Delete empty columns and rows before uploading for cleaner processing",
    "💡 Tip: Check out the template example sheet for the perfect data format",
    "💡 Pro tip: Use clear, descriptive column headers for best AI understanding",
    "💡 Tip: Sort your data by date or priority before uploading for better insights",
    "💡 Pro tip: Remove merged cells and formatting for more accurate data extraction",
    "💡 Tip: Keep your data in the first sheet tab for fastest processing",
    "💡 Pro tip: Use consistent date formats across your entire sheet",
    "💡 Tip: Add data validation rules in Google Sheets to prevent errors",

    // Just a few sprinkled funny moments (much less frequent)
    "Taking a break, lol kidding",
    "I bet you're pretty impressed with me right now, it's okay to admit it 🤯",
    "Flirting with Debbie from accounting, think i got a shot 😜"
  ];

  // Session-specific states - reset when session changes
  const [isSending, setIsSending] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firebaseFileUrlsRef = useRef<any[]>([]);


  // Reset session-specific states when session changes
  useEffect(() => {
    setIsSending(false);
    setIsProcessingFiles(false);
    setIsStopping(false);
    setIsCancelled(false); // Reset cancellation flag
    setInputValue(''); // Clear input when switching sessions
    setUploadedFiles([]); // Clear uploaded files when switching sessions

    // Clear file input to allow fresh file selection when switching sessions
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [currentSessionId]);

  // Cycle through loading messages while AI is thinking
  useEffect(() => {
    if (!isSending) {
      setLoadingMessageIndex(0); // Reset to first message when not sending
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % loadingMessages.length);
    }, 3000); // Change message every 3 seconds

    return () => clearInterval(interval);
  }, [isSending, loadingMessages.length]);
  
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

      const tableKey = preview.uid || `${preview.messageId}-${preview.tableIndex}`;
      try {
        setProcessingTables(prev => new Set(prev).add(tableKey));
        const headers = Array.isArray(preview.headers) ? preview.headers : [];
        const rows = Array.isArray(preview.rows) ? preview.rows : [];
        if (!defaultSpreadsheetId) {
          throw new Error('No spreadsheet selected. Please select a spreadsheet first using the sheet selector above.');
        }
        if (!preview.sheetName) {
          throw new Error('This table does not specify a target sheet. Please ensure the table has a target sheet defined before approving.');
        }

        console.log('🔍 Approving table:', {
          preview,
          hasMeta: !!preview.meta,
          meta: preview.meta,
          operations: preview.meta?.operations,
          updateRow: preview.meta?.updateRow,
          rowsLength: preview.rows?.length
        });  // Debug log

        let successMessage = '';
        const targetSheetName = preview.sheetName || selectedSheetNames[0];
        const operations = preview.meta?.operations || {};

        // Determine operation type based on meta.operations and simple heuristics
        const isUpdateOperation = (operations.update || 0) > 0 && preview.meta?.updateRow != null;
        const isAddOperation = (operations.add || 0) > 0;
        const hasFormula = Array.isArray(preview.rows) && preview.rows.some((r: any[]) => r.some((c: any) => typeof c === 'string' && String(c).trim().startsWith('=')));
        const isTotalsLike = (preview.title && String(preview.title).toLowerCase().includes('total')) || (Array.isArray(preview.rows) && preview.rows.some((r: any[]) => String(r?.[0] ?? '').toLowerCase() === 'total'));

        const preferUpdate = isUpdateOperation && (hasFormula || isTotalsLike);
        const preferAdd = isAddOperation && !hasFormula && !isTotalsLike;

        if ((preferUpdate || (isUpdateOperation && !isAddOperation)) && preview.rows?.length === 1) {  // Update operation for single row
          console.log(`✅ Routing to update API for row ${preview.meta.updateRow} (update operation)`);
          const response = await fetch('/api/update-sheet-row', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              spreadsheetId: defaultSpreadsheetId,
              sheetName: targetSheetName,
              rowIndex: preview.meta.updateRow,
              values: preview.rows[0]
            })
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to update row');
          }
          const result = await response.json();
          successMessage = `✅ Row ${preview.meta.updateRow} updated successfully in "${targetSheetName}".`;
        } else if (preferAdd || isAddOperation) {  // Add operation
          console.log('🔍 Routing to append API (add operation)');
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
              sheetName: targetSheetName,
              rows: rowObjects,
              dryRun: false
            })
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to apply changes');
          }
          const result = await response.json();
          successMessage = `✅ Changes applied successfully! ${result.inserts || 0} rows added to "${targetSheetName}".`;
        } else {
          // Fallback logic for tables without clear operations metadata
          if (preview.meta?.updateRow && preview.rows?.length === 1) {
            console.log(`✅ Routing to update API for row ${preview.meta.updateRow} (fallback logic)`);
            const response = await fetch('/api/update-sheet-row', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                spreadsheetId: defaultSpreadsheetId,
                sheetName: targetSheetName,
                rowIndex: preview.meta.updateRow,
                values: preview.rows[0]
              })
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.details || 'Failed to update row');
            }
            const result = await response.json();
            successMessage = `✅ Row ${preview.meta.updateRow} updated successfully in "${targetSheetName}".`;
          } else {
            console.log('🔍 Routing to append API (fallback logic)');
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
                sheetName: targetSheetName,
                rows: rowObjects,
                dryRun: false
              })
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to apply changes');
            }
            const result = await response.json();
            successMessage = `✅ Changes applied successfully! ${result.inserts || 0} rows added to "${targetSheetName}".`;
          }
        }

        // Add success message to chat
        await addMessage({
          role: 'assistant',
          content: successMessage,
        });

        // Remove the approved table from the message (prefer uid when available)
        if (preview.messageId != null) {
          setChatMessages(prev => prev.map(message => {
            if (message.id !== preview.messageId || !message.tables) return message;
            const filteredTables = message.tables.filter((t: any, i: number) => {
              if (preview.uid && (t as any).uid) {
                return (t as any).uid !== preview.uid;
              }
              return i !== preview.tableIndex;
            });
            return { ...message, tables: filteredTables } as any;
          }));
          try {
            const target = chatMessages.find(m => m.id === preview.messageId);
            if (target && Array.isArray(target.tables)) {
              const filteredTables = target.tables.filter((t: any, i: number) => {
                if (preview.uid && (t as any).uid) {
                  return (t as any).uid !== preview.uid;
                }
                return i !== preview.tableIndex;
              });
              await updateMessageTables(target.id, filteredTables as any);
            }
          } catch (e) {
            console.error('Failed to persist approval table removal:', e);
          }
        }
      } catch (error) {
        console.error('Failed to approve update:', error);
        await addMessage({
          role: 'assistant',
          content: `❌ Failed to apply changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } finally {
        setProcessingTables(prev => {
          const newSet = new Set(prev);
          newSet.delete(tableKey);
          return newSet;
        });
      }
    };

    const handleRejectUpdate = async (event: CustomEvent) => {
      const { preview } = event.detail;
      if (!preview) return;
      const rejectTableKey = `reject-${(preview.uid || `${preview.messageId}-${preview.tableIndex}`)}`;
      try {
        setProcessingTables(prev => new Set(prev).add(rejectTableKey));
        if (preview.messageId != null) {
          setChatMessages(prev => prev.map(message => {
            if (message.id !== preview.messageId || !message.tables) return message;
            const filteredTables = message.tables.filter((t: any, i: number) => {
              if (preview.uid && (t as any).uid) {
                return (t as any).uid !== preview.uid;
              }
              return i !== preview.tableIndex;
            });
            return { ...message, tables: filteredTables } as any;
          }));
          try {
            const target = chatMessages.find(m => m.id === preview.messageId);
            if (target && Array.isArray(target.tables)) {
              const filteredTables = target.tables.filter((t: any, i: number) => {
                if (preview.uid && (t as any).uid) {
                  return (t as any).uid !== preview.uid;
                }
                return i !== preview.tableIndex;
              });
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
          newSet.delete(rejectTableKey);
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
          const arrayBuffer = await file.arrayBuffer();
          const base64Data = arrayBufferToBase64(arrayBuffer);

          uploadedFile.extractedData = {
            type: 'document',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: '',
            textLength: 0,
            hasTextContent: false,
            needsBackendProcessing: true,
            pageCount: 0,
            isScannedDocument: true,
            note: 'PDF ready for AI text extraction'
          };
          uploadedFile.fileData = base64Data;
        } catch (error) {
          console.error(`❌ [PDF] Failed to process PDF: ${file.name}`, error);
          uploadedFile.extractedData = {
            type: 'error',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            error: 'Failed to process PDF file'
          };
        }
      } else if (file.type.startsWith('image/')) {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);
        uploadedFile.extractedData = {
          type: 'image',
          format: file.type.split('/')[1],
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          extractedText: '', // Don't pre-extract text - let AI handle it
          textLength: 0,
          hasTextContent: false,
          needsBackendProcessing: true, // Let backend AI process the image
          note: 'Image ready for Gemini Vision processing'
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

    // Prevent sending messages if no spreadsheet is selected
    if (!defaultSpreadsheetId) {
      await addMessage({
        role: 'assistant',
        content: `🤖 I need you to select a Google Sheet before we can start chatting. Please use the "Manage Spreadsheets" button to add or select a spreadsheet.`
      });
      return;
    }

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

    // Check if we have required sheet data for selected sheets
    const hasRequiredSheetData = selectedSheetNames.every(sheetName => sheetDataCache[sheetName]);
    const hasTimedOut = sheetDataLoadStartTime && (Date.now() - sheetDataLoadStartTime) > 30000; // 30 second timeout

    if (selectedSheetNames.length > 0 && !hasRequiredSheetData && !hasTimedOut) {
      console.log('⏳ [ChatInterface] Waiting for sheet data to load:', {
        selectedSheets: selectedSheetNames,
        availableData: Object.keys(sheetDataCache),
        isLoading: isSheetDataLoading,
        loadTime: sheetDataLoadStartTime ? Date.now() - sheetDataLoadStartTime : 0
      });

      // Show user feedback that sheet data is loading
      await addMessage({
        role: 'assistant',
        content: `⏳ Please wait, I'm loading data from your selected sheets. This usually takes just a few seconds...`
      });
      return;
    }

    // If we've timed out waiting for sheet data, allow submission with a warning
    if (selectedSheetNames.length > 0 && !hasRequiredSheetData && hasTimedOut) {
      console.log('⚠️ [ChatInterface] Sheet data load timed out, proceeding without data:', {
        selectedSheets: selectedSheetNames,
        loadTime: sheetDataLoadStartTime ? Date.now() - sheetDataLoadStartTime : 0
      });

      // Show warning but allow submission
      await addMessage({
        role: 'assistant',
        content: `⚠️ I wasn't able to load your sheet data in time, but I'll proceed with your request anyway. Some features may not work correctly.`
      });
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

    const message = inputValue.trim() || (uploadedFiles.length > 0 ? 'Process uploaded files' : 'Extract data from uploaded files and add to selected sheets');
    setIsSending(true);
    setIsProcessingFiles(true);

    // Process and upload files to Firebase Storage
    firebaseFileUrlsRef.current = [];
    if (uploadedFiles.length > 0) {
      try {
        const storage = getStorage();

        for (const file of uploadedFiles) {
          if (!file.fileData) continue;

          const timestamp = Date.now();
          const fileName = `${timestamp}_${file.name}`;
          const storageRef = ref(storage, `temp-uploads/${fileName}`);

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
            storagePath: `temp-uploads/${fileName}`
          });
        }
      } catch (error) {
        console.error('Failed to process/upload files:', error);
        await addMessage({
          role: 'assistant',
          content: 'Failed to process files. Please try again.',
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

    // Files are now attached to the user message directly

    const controller = new AbortController();
    setAbortController(controller); // Set the abort controller in the ChatProvider

    try {
      await ensureSession();

      // Add user message with attached files (WhatsApp-style grouping)
      await addMessage({
        role: 'user',
        content: message,
        files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
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

      // Clear file input to allow re-uploading same files
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Files are now grouped with the user message - no separate processing message needed

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
        // Check if the request was cancelled before processing the response
        if (controller.signal.aborted || isCancelled) {
          console.log('🚫 [FRONTEND] Request was cancelled, ignoring response');
          return; // Don't process the response if cancelled
        }

        const aiResponse = await response.json();

        // Double-check cancellation after JSON parsing (in case it took time)
        if (isCancelled) {
          console.log('🚫 [FRONTEND] Request was cancelled during JSON parsing, ignoring response');
          return;
        }

        // No processing message to remove - files are grouped with user message
        
        const preservedTables = aiResponse.tables ? aiResponse.tables.map((table: any, index: number) => {
          const rows = Array.isArray(table.rows) ? table.rows : (table.rows ? [table.rows] : []);
          return {
            uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
            title: table.title || '',
            headers: Array.isArray(table.headers) ? table.headers : [],
            rows: rows,
            rowCount: rows.length,
            summary: table.summary || '',
            meta: table.meta ? {
              sheetName: table.meta.sheetName || '',
              operations: table.meta.operations || {},
              requiresConfirmation: Boolean(table.meta.requiresConfirmation),
              isDryRun: Boolean(table.meta.isDryRun),
              updateRow: table.meta.updateRow
            } : {}
          }
        }) : [];
        
        await addMessage({
          role: 'assistant',
          content: aiResponse.reasoning || 'AI processing completed.',
          tables: preservedTables,
          insights: Array.isArray(aiResponse.insights) ? aiResponse.insights : [],
        });
         
        // Clean up Firebase files after successful processing (don't let cleanup errors affect success)
        if (firebaseFileUrlsRef.current.length > 0) {
          // Fire and forget - don't await cleanup to prevent it from blocking success
          setTimeout(async () => {
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
              // Cleanup failure should not affect the user experience
            }
          }, 0);
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
      // No processing message to remove - files are grouped with user message
      
      if (err.name === 'AbortError' || isCancelled) {
        console.log('Chat generation aborted by user.');
        // Only add the "stopped" message if we haven't already processed a response
        if (!isCancelled) {
          await addMessage({
            role: 'assistant',
            content: 'Chat generation stopped.',
          });
        }
      } else {
        console.error('Failed to send message:', err);
        await addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        });
      }
    } finally {
      setIsSending(false);
      setIsProcessingFiles(false);
      setAbortController(null); // Clear the abort controller
      setIsCancelled(false); // Reset cancellation flag

      // Files are now attached to the message, no need to restore from separate state

      // Clean up Firebase files if there was an error or cancellation
      if (firebaseFileUrlsRef.current.length > 0) {
        try {
          const storage = getStorage();
          for (const fileInfo of firebaseFileUrlsRef.current) {
            if (fileInfo.storagePath) {
              const storageRef = ref(storage, fileInfo.storagePath);
              deleteObject(storageRef).then(() => {
                console.log(`Cleaned up Firebase file after cancellation/error: ${fileInfo.storagePath}`);
              }).catch((cleanupError) => {
                console.error('Failed to cleanup Firebase file after cancellation/error:', cleanupError);
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
                    console.log(`Cleaned up Firebase file after cancellation/error (fallback): temp-uploads/${actualFileName}`);
                  }).catch((cleanupError) => {
                    console.error('Failed to cleanup Firebase file after cancellation/error (fallback):', cleanupError);
                  });
                }
              }
            }
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup Firebase files after cancellation/error:', cleanupError);
        }
      }

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
    <div className={`flex flex-col h-full min-h-0 ${className} md:hidden:block`}
         style={{
           paddingTop: 'env(safe-area-inset-top)',
           paddingBottom: 'env(safe-area-inset-bottom)',
           paddingLeft: 'env(safe-area-inset-left)',
           paddingRight: 'env(safe-area-inset-right)'
         }}>
      <WhatsAppLinkBanner />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4 min-h-0 mobile-chat-messages"
           style={{
             paddingTop: 'calc(1rem + env(safe-area-inset-top))',
             paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))'
           }}>
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
        {isSending && ( // Dynamic loading indicator with funny messages and tips
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-3 bg-white/10 text-white border border-white/20">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span className="text-sm opacity-90">
                  {loadingMessages[loadingMessageIndex]}
                </span>
              </div>
            </div>
          </div>
        )}
        
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mx-3 mb-2 p-2 bg-red-500/10 border border-red-400/30 rounded-lg text-red-200 text-sm">
          <span>{error}</span>
        </div>
      )}

      {/* Removed session loading states - loads instantly */}

      <div className="border-t border-white/10 p-2 sm:p-3 pt-2 sm:pt-3 flex-shrink-0 mobile-chat-input"
           style={{
             paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))'
           }}>
        {/* Compact sheet selector */}
        <div className="mb-2 sm:mb-3">
          <SheetChipSelector />
        </div>
        
        {/* Removed session loading indicator - loads instantly */}
        
        {uploadedFiles.length > 0 && (
          <div className="mb-2 space-y-1">
            <div className="text-xs text-white/60 mb-2 flex items-center gap-2 px-1">
              <span>📎 Files ready to send ({uploadedFiles.length})</span>
              {isProcessingFiles && (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded-lg text-white/80 file-transition-in" data-file-id={file.id}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                  {file.status === 'processing' ? (
                    <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-amber-400" />
                  ) : file.status === 'completed' ? (
                    <div className="w-4 h-4 flex-shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : file.status === 'error' ? (
                    <div className="w-4 h-4 flex-shrink-0 rounded-full bg-red-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : (
                    <FileIcon className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  )}
                    <span className="text-sm truncate font-medium">{file.name}</span>
                    {file.status === 'processing' && (
                      <span className="text-xs text-amber-400 ml-1">Processing...</span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-xs text-red-400 ml-1">Error</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 hover:bg-white/10 rounded-md active:scale-95 flex items-center justify-center ml-1 transition-colors"
                    disabled={file.status === 'processing'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}



        <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            className="hidden"
            disabled={isSending}
          />

          {/* Compact input field */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                userType === 'free' && isLimitReached
                  ? "Daily limit reached. Upgrade to Pro for unlimited messages!"
                  : "Ask about your data, request analysis, or get insights..."
              }
              className="flex-1 px-4 py-3 min-h-[48px] bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-base"
              data-tutorial="chat-input"
              disabled={isSending || (userType === 'free' && isLimitReached)}
            />

            {/* Compact button layout */}
            <div className="flex items-center gap-2">
              <VoiceRecorder
                onTranscriptChange={handleTranscriptChange}
                disabled={isSending || (userType === 'free' && isLimitReached)}
                className="w-10 h-10 rounded-lg transition-all duration-150 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 border border-white/20 min-w-[44px] min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-lg transition-all duration-150 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center active:scale-95 border border-white/20 min-w-[44px] min-h-[44px]"
                disabled={isSending || (userType === 'free' && isLimitReached)}
                data-tutorial="file-upload"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Compact send button */}
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
                          setIsCancelled(true); // Set cancellation flag to prevent response processing
                          cancelChatGeneration();
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
                        uploadedFiles.some(file => file.status === 'processing') ||
                        (selectedSheetNames.length > 0 &&
                         !selectedSheetNames.every(sheetName => sheetDataCache[sheetName]) &&
                         !(sheetDataLoadStartTime && (Date.now() - sheetDataLoadStartTime) > 30000))
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
                className={`w-11 h-11 rounded-lg transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 border min-w-[44px] min-h-[44px] ${
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
                  <Square className="h-3.5 w-3.5" />
                ) : uploadedFiles.some(file => file.status === 'processing') ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Compact upgrade hint for free users - hidden on mobile, visible on desktop */}
        {userType === 'free' && !isLimitReached && (
          <div className="mt-2 text-center hidden md:block">
            <div className="inline-flex items-center gap-2 text-sm text-yellow-300 bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-lg px-3 py-1.5 cursor-pointer hover:from-yellow-500/30 hover:to-yellow-600/30 hover:border-yellow-400/40 transition-all duration-200"
                 onClick={() => openModal('Pro')}
                 role="button"
                 tabIndex={0}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' || e.key === ' ') {
                     e.preventDefault();
                     openModal('Pro');
                   }
                 }}>
              <Crown className="w-4 h-4" fill="currentColor" />
              <span className="font-medium text-sm">Go Pro for Unlimited Messages</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </div>
        )}

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
