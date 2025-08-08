"use client";
import React, { useState, useRef, useEffect } from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";
import { useServiceAccount } from './providers/ServiceAccountProvider';
import ServiceAccountInfo from './components/ServiceAccountInfo';
import { db } from "./providers/FirebaseProvider";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  orderBy,
  limit
} from "firebase/firestore";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import Image from 'next/image';
import PWAInstaller from './components/PWAInstaller';
import RecentActivity from './components/RecentActivity';
import SheetChipSelector from './components/SheetChipSelector';



// import { useSettings } from './providers/SettingsProvider'; // Corrected import path

// Types
// Add interface for uploaded images
interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  geminiFileUri?: string;
  fileType: 'image' | 'pdf'; // Added to distinguish between images and PDFs
}

// Add type for stepper field - enhanced for multi-sheet support
interface StepperField {
  column: string;
  cell: string;
  value?: string;
  sheetName?: string; // Add sheet name for multi-sheet support
  row?: number; // Add row number for multi-row support
}

// Enhanced activity tracking for multi-sheet operations
interface ActivityItem {
  type: 'add' | 'edit' | 'delete';
  entity: 'sheet' | 'webhook';
  label: string;
  timestamp: number;
  oldValue?: string; // For edit activity
  newValue?: string; // For edit activity
  webhookType?: 'initial' | 'final' | 'backup' | 'other'; // For webhook edit activity
  sheetName?: string; // For webhook add activity
  rowNumber?: string; // For webhook add activity
  rowData?: { column: string; cell: string; value: string }[]; // For webhook add activity
  sheetsAffected?: string[]; // For multi-sheet operations
  rowsAffected?: number; // For multi-row operations
}

// Define ChatMessage type for use throughout the file
type ChatMessage = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isVoice?: boolean;
    hasImages?: boolean;
    imageCount?: number;
    attachments?: Array<{
      id: string;
      name: string;
      type: string;
      fileType: 'image' | 'pdf';
      preview?: string;
    }>;
    isProcessing?: boolean;
    toolCalls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    toolResults?: Array<{
      id: string;
      result: string;
      success: boolean;
      details?: unknown;
    }>;
    messageType?: 'voice' | 'text' | 'sheet_update' | 'tool_execution' | 'ai_response';
    quickReplies?: string[];
  };





export default function Home() {
  // All hooks must be called before any return!
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const { user, loading, signInWithGoogle, authError } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames } = useSheet();
  const { serviceAccountEmail, isLoading: serviceAccountLoading } = useServiceAccount();
  // Removed: const { settingsOpen, setSettingsOpen } = useSettings();
  // Track user's available spreadsheets
  const [hasSpreadsheets, setHasSpreadsheets] = useState(false);
  const [spreadsheetsLoading, setSpreadsheetsLoading] = useState(true);
  // Prefetched sheet metadata and cache
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [sheetDataCache, setSheetDataCache] = useState<Record<string, string[][]>>({});
  const [sheetsPrefetched, setSheetsPrefetched] = useState<boolean>(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(listening);
  const [editingText, setEditingText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);

  

  
  // Add state for available spreadsheet options
  // const [spreadsheetOptions, setSpreadsheetOptions] = useState<Array<{id: string; spreadsheetId: string; sheetNames: string[]}>>([]);

  // Add state for image upload functionality
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Chat functionality state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  
  // Visual feedback state for voice-to-chat transitions
  // const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  
  // State for missed intent detection and fallback UI
  const [missedIntentSuggestion, setMissedIntentSuggestion] = useState<string | null>(null);
  
  // Removed message filter UI
  
  // Removed n8n session tracking; Genkit flow handles updates synchronously
  
  // User context and preferences system
  // const [userContext, setUserContext] = useState<{
  //   businessType: string;
  //   workflowDescription: string;
  //   sheetPurpose: string;
  //   preferredBehavior: string;
  //   formulaRows: number[];
  //   insertionPreference: 'above_formulas' | 'append' | 'custom';
  // } | null>(null);
  // const [showContextSetup, setShowContextSetup] = useState(false);
  


  // Background operation state
  const [backgroundOperation, setBackgroundOperation] = useState<{
    isRunning: boolean;
    operation: string;
    progress?: string;
  }>({
    isRunning: false,
    operation: '',
    progress: undefined
  });
  
  // Fix recognitionRef type - use 'any' since SpeechRecognition type is not available
  // Voice recognition ref
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Speech recognition effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!SpeechRecognitionClass) {
      console.error('Speech recognition not supported in this browser');
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    
    console.log('SpeechRecognition class found:', SpeechRecognitionClass);
    
    // Cleanup function to properly stop recognition
    const cleanupRecognition = () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Error stopping recognition during cleanup:', e);
        }
        recognitionRef.current = null;
      }
    };
    
    if (listening) {
      console.log('Starting speech recognition...');
      
      // Clean up any existing recognition first
      cleanupRecognition();
      
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true; // Set to true to keep listening until manually stopped
      recognition.interimResults = true;
      recognition.lang = "en-US";
      
      recognition.onstart = () => {
        console.log('Speech recognition started successfully!');
        console.log('Recognition object:', recognition);
      };
      
      recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log('Speech recognition result received:', event);
        
        let interimTranscript = '';
        let finalTranscript = '';

        // Process only the latest result to avoid duplication
        const latestResultIndex = event.results.length - 1;
        const latestResult = event.results[latestResultIndex];
        
        if (latestResult.isFinal) {
          finalTranscript = latestResult[0].transcript;
          console.log('Final result:', finalTranscript);
        } else {
          interimTranscript = latestResult[0].transcript;
          console.log('Interim result:', interimTranscript);
        }
        
        console.log('Final transcript:', finalTranscript);
        console.log('Interim transcript:', interimTranscript);
        
        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript + ' ');
          setInterimText('');
        } else {
          setInterimText(interimTranscript);
        }
      };
      
      recognition.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.log('Speech recognition error event:', event);
        
        // Handle different error types appropriately
        switch (event.error) {
          case 'aborted':
            // This is expected when stopping recognition - not an error
            console.log('Speech recognition stopped (aborted)');
            break;
          case 'no-speech':
            // No speech detected - this is normal, continue listening
            console.log('No speech detected - continuing to listen');
            break;
          case 'audio-capture':
            console.error('Audio capture error - microphone may not be available');
            setListening(false);
            break;
          case 'not-allowed':
            console.error('Microphone permission denied');
            setListening(false);
            break;
          case 'network':
            console.error('Network error occurred');
            setListening(false);
            break;
          case 'service-not-allowed':
            console.error('Speech recognition service not allowed');
            setListening(false);
            break;
          default:
            console.error('Speech recognition error:', event.error);
            setListening(false);
            break;
        }
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        // Auto-restart if we're still supposed to be listening
        if (listeningRef.current) {
          console.log('Auto-restarting speech recognition...');
          try {
            recognition.start();
          } catch (e) {
            console.error('Failed to auto-restart speech recognition:', e);
            setListening(false);
            recognitionRef.current = null;
          }
        } else {
          recognitionRef.current = null;
          console.log('Recognition ended and listening is false - cleanup complete');
        }
      };
      
      recognitionRef.current = recognition;
      
      try {
        recognition.start();
        console.log('Speech recognition start() called');
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        setListening(false);
        recognitionRef.current = null;
      }
    } else {
      // Not listening - clean up any existing recognition
      console.log('Stopping speech recognition...');
      cleanupRecognition();
    }
    
    // Cleanup on unmount or when listening changes
    return () => {
      console.log('Speech recognition effect cleanup');
      cleanupRecognition();
    };
  }, [listening]);

  // Update listeningRef when listening state changes
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  // Debug transcript changes - add these right after the speech recognition useEffect
  useEffect(() => {
    console.log('Transcript changed:', transcript);
  }, [transcript]);

  useEffect(() => {
    console.log('Interim text changed:', interimText);
  }, [interimText]);

  // Update display text when voice recording or editing text changes
  useEffect(() => {
    const newDisplayText = editingText + (listening ? (transcript + interimText) : '');
    setDisplayText(newDisplayText);
    console.log('Display text updated:', newDisplayText);
  }, [editingText, listening, transcript, interimText]);

  // Debug editingText changes
  useEffect(() => {
    console.log('editingText changed:', editingText);
  }, [editingText]);

  // Check if user has any spreadsheets configured
  useEffect(() => {
    if (!user) {
      setHasSpreadsheets(false);
      setSpreadsheetsLoading(false);
      return;
    }
    setSpreadsheetsLoading(true);
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setHasSpreadsheets(snapshot.docs.length > 0);
      setSpreadsheetsLoading(false);
    });
    return () => unsubOptions();
  }, [user]);



  // Subscribe to user's spreadsheet options
  // useEffect(() => {
  //   if (!user) return;
  //   const optionsRef = collection(db, "users", user.uid, "options");
  //   const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
  //     setSpreadsheetOptions(snapshot.docs.map(doc => ({ 
  //       id: doc.id, 
  //       ...doc.data() 
  //     } as {id: string; spreadsheetId: string; sheetNames: string[]})));
  //   });
  //   return () => unsubOptions();
  // }, [user]);



  // Fetch selected sheet if not cached (avoid duplicate with prefetch)
  useEffect(() => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) return;
    const focus = selectedSheetNames[0];
    // Skip if already cached, or if prefetch is handling it
    if (sheetDataCache[focus] && sheetDataCache[focus].length > 0) return;
    if (!sheetsPrefetched && allSheetNames.includes(focus)) return;

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch('/api/get-sheet-data/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: focus }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setSheetDataCache(prev => ({ ...prev, [focus]: data || [] }));
          console.log(`✅ Cached ${data?.length || 0} rows for "${focus}"`);
        }
      } catch (error) {
        console.error('❌ Error fetching sheet data:', error);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [defaultSpreadsheetId, selectedSheetNames, allSheetNames, sheetsPrefetched, sheetDataCache]);



  // Helper to parse webhook response for stepper fields
  function parseStepperFields(response: string): StepperField[] {
    // Try to extract JSON array from response
    // Remove the unsupported 's' flag and allow multiline with [\s\S]
    const match = response.match(/\[[\s\S]*\]/);
    const arrStr = match ? match[0] : response;
    try {
      // Try parsing as JSON array
      const arr = JSON.parse(arrStr);
      if (Array.isArray(arr) && arr.every(obj => obj.column && obj.cell)) {
        return arr;
      }
    } catch {
      // Try to parse as comma-separated objects
      const objectRegex = /\{[^}]+\}/g;
      const objects = response.match(objectRegex);
      if (objects) {
        return objects.map(objStr => {
          try {
            // Replace single quotes with double quotes for JSON.parse
            const safeStr = objStr.replace(/([a-zA-Z0-9_]+):/g, '"$1":').replace(/'/g, '"');
            return JSON.parse(safeStr);
          } catch {
            return {};
          }
        }).filter(obj => obj.column && obj.cell);
      }
    }
    return [];
  }

  // When sendResult changes and contains a webhook response, parse stepper fields and open the stepper modal
  useEffect(() => {
    if (sendResult && sendResult.includes("Response:")) {
      // Try to extract the JSON-like part after 'Response:'
      const parts = sendResult.split("Response:");
      if (parts.length > 1) {
        const fields = parseStepperFields(parts[1]);
        if (fields.length > 0) {
          setStepperFields(fields);
          setStepperModalOpen(true);
        }
      }
    }
  }, [sendResult]);

  // Add activity to Firestore
  const addActivity = async (activity: ActivityItem) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "recentActivity"), { ...activity, userId: user.uid });
      console.log("Activity written to Firestore:", { ...activity, userId: user.uid });
      setActivityError(null);
    } catch (err) {
      console.error("Failed to write activity to Firestore:", err);
      setActivityError("Failed to save activity to Firestore. Check your connection and permissions.");
    }
  };

  // On user load, subscribe to recentActivity for this user
  useEffect(() => {
    if (!user) return;
    const qAct = query(
      collection(db, "recentActivity"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(qAct, (snapshot) => {
      const acts = snapshot.docs.map(doc => doc.data() as ActivityItem);
      setActivity(acts);
    });
    return () => unsub();
  }, [user]);

  // Stepper Handlers
  const handleStepperChange = (cell: string, value: string) => {
    setStepperValues(prev => ({ ...prev, [cell]: value }));
  };

  const handleStepperBack = () => {
    setStepperIndex(idx => Math.max(0, idx - 1));
  };

  const handleStepperNext = () => {
    setStepperIndex(idx => Math.min(stepperFields.length - 1, idx + 1));
  };

  const handleStepperFinish = () => {
    setStepperComplete(true);
  };

  const handleStepperAcceptAll = () => {
    // Accept all AI values for fields that don't have a user value
    const newValues: { [cell: string]: string } = { ...stepperValues };
    stepperFields.forEach(field => {
      if ((newValues[field.cell] === undefined || newValues[field.cell] === "") && field.value) {
        newValues[field.cell] = field.value;
      }
    });
    setStepperValues(newValues);
    // Also update the current input if on a field that was just filled
    const currentField = stepperFields[stepperIndex];
    if (currentField && newValues[currentField.cell]) {
      handleStepperChange(currentField.cell, newValues[currentField.cell]);
    }
    handleStepperFinish(); // Automatically move to review complete after accepting all
  };

  // Enhanced save function for multi-sheet support
  const saveToSheet = async () => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
      setSendResult("Please select a spreadsheet and sheet first.");
      return;
    }

    if (stepperFields.length === 0) {
      setSendResult("No fields to save.");
      return;
    }

    setFinalSubmitStatus('loading');
    try {
      const result = await fetch('/api/save-sheet-data-multi/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: defaultSpreadsheetId,
          sheetName: selectedSheetNames[0],
          actions: stepperFields.map(field => ({
            type: 'updateCell',
            sheet: field.sheetName || selectedSheetNames[0],
            row: field.row || 1,
            column: field.column,
            cell: field.cell,
            value: stepperValues[field.cell] || field.value || ''
          }))
        }),
      });

      if (result.ok) {
        const data = await result.json();
        console.log('Save result:', data);
        setFinalSubmitStatus('success');
        setStepperModalOpen(false);
        setStepperFields([]);
        setStepperValues({});
        setStepperComplete(false);
        
        // Add activity record
        await addActivity({
          type: 'add',
          entity: 'sheet',
          label: `Updated ${stepperFields.length} cells in ${selectedSheetNames[0]}`,
          timestamp: Date.now(),
          sheetsAffected: selectedSheetNames,
          rowsAffected: stepperFields.length
        });

        // Show success message
        setSendResult(`Successfully saved ${stepperFields.length} update${stepperFields.length !== 1 ? 's' : ''} to ${selectedSheetNames[0]}.`);
        
        // Clear after a delay
        setTimeout(() => {
          setSendResult(null);
        }, 1000);
      } else {
        setFinalSubmitStatus('error');
        console.error('Save failed:', result);
      }
    } catch (e) {
      console.error('Error saving to sheets:', e);
      setFinalSubmitStatus('error');
    }
  };



  // Helper function to calculate file size progress
  const getFileSizeProgress = () => {
    const maxFileSize = 8 * 1024 * 1024; // 8MB limit
    const totalSizeLimit = 20 * 1024 * 1024; // 20MB total limit
    
    let totalSize = 0;
    const fileSizes = uploadedImages.map(img => {
      const size = img.file.size;
      totalSize += size;
      return {
        name: img.file.name,
        size: size,
        sizeMB: (size / 1024 / 1024).toFixed(1),
        percentage: (size / maxFileSize) * 100
      };
    });
    
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);
    const totalPercentage = (totalSize / totalSizeLimit) * 100;
    
    return {
      fileSizes,
      totalSize,
      totalSizeMB,
      totalPercentage,
      maxFileSize,
      totalSizeLimit
    };
  };

  // Helper function to check file sizes and show warnings
  const checkFileSizes = (files: FileList): { warnings: string[]; errors: string[] } => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const maxFileSize = 8 * 1024 * 1024; // 8MB limit
    const totalSizeLimit = 20 * 1024 * 1024; // 20MB total limit
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check individual file size
      if (file.size > maxFileSize) {
        errors.push(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum file size is 8MB.`);
      } else if (file.size > maxFileSize * 0.8) { // Warning at 80% of limit
        warnings.push(`"${file.name}" is large (${(file.size / 1024 / 1024).toFixed(1)}MB). Consider compressing it.`);
      }
      
      totalSize += file.size;
    }

    // Check total size
    if (totalSize > totalSizeLimit) {
      errors.push(`Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 20MB limit. Please upload fewer files.`);
    } else if (totalSize > totalSizeLimit * 0.8) { // Warning at 80% of limit
      warnings.push(`Total upload size (${(totalSize / 1024 / 1024).toFixed(1)}MB) is approaching the 20MB limit.`);
    }

    return { warnings, errors };
  };

  // Image upload handlers
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    const newImages: UploadedImage[] = [];

    try {
      // Check file sizes and get warnings/errors
      const { warnings, errors } = checkFileSizes(files);

      // Process files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf';
        
        if (!isImage && !isPdf) {
          errors.push(`"${file.name}" is not a supported file type. Only images and PDFs are allowed.`);
          continue;
        }

        // Skip files that are too large (already caught by checkFileSizes)
        if (file.size > 8 * 1024 * 1024) {
          continue;
        }
        
        // Create preview URL
        const preview = URL.createObjectURL(file);
        
        const imageData: UploadedImage = {
          id: `img_${Date.now()}_${i}`,
          file,
          preview,
          fileType: isImage ? 'image' : 'pdf'
        };
        
        newImages.push(imageData);
      }

      // Show errors if any
      if (errors.length > 0) {
        setSendResult(`❌ Upload errors:\n${errors.join('\n')}`);
        // Clear the input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setUploadingImages(false);
        return;
      }

      // Show warnings if any
      if (warnings.length > 0) {
        setSendResult(`⚠️ Upload warnings:\n${warnings.join('\n')}\n\nFiles were uploaded successfully, but consider optimizing them for better performance.`);
      }

      setUploadedImages(prev => [...prev, ...newImages]);
      
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error processing uploaded files:', error);
      setSendResult('Error processing uploaded files. Please try again.');
    } finally {
      setUploadingImages(false);
    }
  };





  // Enhanced function to process with AI Chat (combining old functionality with new chat)
  const processWithAIChat = async (inputText?: string) => {
    const textToProcess = inputText || transcript;
    if (!textToProcess.trim() || !defaultSpreadsheetId) {
      setSendResult("Please provide input and select a spreadsheet in the navigation.");
      return;
    }
    
    // Stop listening if currently active
    if (listening) {
      setListening(false);
    }
    
    setChatProcessing(true);
    
    try {
      // Add user message to chat
      const userIntent = detectIntent(textToProcess);
      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content: textToProcess,
        timestamp: new Date(),
        hasImages: uploadedImages.length > 0,
        imageCount: uploadedImages.length,
        messageType: 'text' as const, // Always text since voice converts to text
        attachments: uploadedImages.map(img => ({
          id: img.id,
          name: img.file.name,
          type: img.file.type,
          fileType: img.fileType,
          preview: img.preview
        }))
      };
      setChatMessages(prev => [...prev, userMessage]);
      
      // Clear transcript
      setTranscript("");

      // Prepare images for the API call
      const imageData: Array<{ data: string; mimeType: string; }> = [];
      
      if (uploadedImages.length > 0) {
        try {
          for (const img of uploadedImages) {
            // Convert with compression for images
            if (img.fileType === 'image') {
              try {
                const { compressImageFile } = await import('../lib/imageCompression');
                const compressed = await compressImageFile(img.file, 1600, 0.7);
                imageData.push({ data: compressed.base64, mimeType: compressed.mimeType });
              } catch {
                const reader = new FileReader();
                const base64Data = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1];
                    resolve(base64);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(img.file);
                });
                imageData.push({ data: base64Data, mimeType: img.file.type });
              }
            } else {
              const reader = new FileReader();
              const base64Data = await new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                  const result = reader.result as string;
                  const base64 = result.split(',')[1];
                  resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(img.file);
              });
              imageData.push({ data: base64Data, mimeType: img.file.type });
            }
          }
        } catch (error) {
          console.error('Error processing images:', error);
          setSendResult("Error processing images. Please try again.");
          setChatProcessing(false);
          return;
        }
      }
      
      // Call the chat API with enhanced context
      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToProcess,
          userIntent: userIntent,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetNames: selectedSheetNames, // allow multiple focused sheets
            // hydrate chat with prefetched sheet info so server can avoid refetches
            sheetData: Object.fromEntries(
              (selectedSheetNames && selectedSheetNames.length > 0
                ? selectedSheetNames
                : Object.keys(sheetDataCache)
              ).map(name => [name, sheetDataCache[name]]).filter(([, v]) => Array.isArray(v))
            ),
            allSheetNames,
            availableTools: ['update_sheet_cells', 'insert_sheet_row', 'analyze_sheet_data', 'bulk_update_cells'],
          },
          conversationHistory: chatMessages.slice(-5),
          images: imageData // Include processed images
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Chat processing failed';
        let errorDetails = '';
        
        try {
          const errorData = await response.json();
          
          if (response.status === 413) {
            // File size limit exceeded
            errorMessage = '📁 File Size Limit Exceeded';
            errorDetails = errorData.details || errorData.error || 'Your files are too large for processing.';
            
            // Add specific guidance based on the error
            if (errorData.fileSize) {
              errorDetails += `\n\n📊 File Size: ${errorData.fileSize}`;
            }
            if (errorData.maxSize) {
              errorDetails += `\n📏 Maximum Size: ${errorData.maxSize}`;
            }
            if (errorData.totalSize) {
              errorDetails += `\n📦 Total Size: ${errorData.totalSize}`;
            }
            if (errorData.maxTotalSize) {
              errorDetails += `\n📦 Maximum Total: ${errorData.maxTotalSize}`;
            }
            
            errorDetails += '\n\n💡 Tips:';
            errorDetails += '\n• Compress your files before uploading';
            errorDetails += '\n• Split large PDFs into smaller sections';
            errorDetails += '\n• Use lower resolution images';
            errorDetails += '\n• Upload fewer files at once';
            
            setSendResult(`${errorMessage}\n\n${errorDetails}`);
            setChatProcessing(false);
            return;
          } else {
            errorMessage = errorData.error || 'Chat processing failed';
            errorDetails = errorData.details || errorData.message || '';
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          errorMessage = `HTTP ${response.status}: Chat processing failed`;
        }
        
        throw new Error(`${errorMessage}\n\n${errorDetails}`);
      }

      const data = await response.json();
      
      // Update context with any changes from the API
      if (data.context) {
        // Update sheet names if provided
        if (data.context.sheetNames) {
          setSelectedSheetNames(data.context.sheetNames);
        }
      }
      
      {
        // Regular AI response with optional quick replies
        const aiMessage = {
          id: `msg_${Date.now()}_ai`,
          role: 'assistant' as const,
          content: data.response || 'I processed your request.',
          timestamp: new Date(),
          messageType: 'ai_response' as const,
          toolCalls: data.toolCalls || [],
          toolResults: data.toolResults || [],
          quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies.slice(0, 3) : undefined
        };
        setChatMessages(prev => [...prev, aiMessage]);
      }

      // Check for missed sheet update intent
      if (detectMissedSheetIntent(textToProcess, data.response || '')) {
        setMissedIntentSuggestion(`Did you want me to update your spreadsheet with this data? You said: "${textToProcess.slice(0, 50)}..."`);
        // Auto-clear the suggestion after 10 seconds
        setTimeout(() => setMissedIntentSuggestion(null), 10000);
      }

      // Handle tool results from automatic execution
      if (data.toolResults && data.toolResults.length > 0) {
        console.log(`🔍 [CHAT] Received ${data.toolResults.length} tool results from automatic execution`);
        
        // Add tool results to chat
        const toolResultMessage = {
          id: `msg_${Date.now()}_tool_results`,
          role: 'system' as const,
          content: `Tool execution completed`,
          timestamp: new Date(),
          toolResults: data.toolResults.map((result: { toolId?: string; result: string; success: boolean; details?: unknown }, index: number) => ({
            id: result.toolId || `tool_result_${index}`,
            result: result.result,
            success: result.success,
            details: result.details
          }))
        };
        setChatMessages(prev => [...prev, toolResultMessage]);
      }

      console.log(`🔍 [CHAT] Final state - uploadedImages: ${uploadedImages.length}, pendingToolCalls: ${pendingToolCalls.length}`);
      
      // Clear uploaded images after successful processing
      if (uploadedImages.length > 0) {
        console.log(`🧹 [CHAT] Clearing ${uploadedImages.length} uploaded images after automatic tool execution`);
        uploadedImages.forEach(img => {
          URL.revokeObjectURL(img.preview);
        });
        setUploadedImages([]);
      }
      
      setSendResult("AI response added to chat above.");
      
    } catch (error) {
      console.error('Chat processing error:', error);
      
      // Simplified error message (n8n integration removed)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setSendResult(`Error: ${errorMessage}`);
      
      // Add error message to chat
      const errorMessageObj = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `Error: ${errorMessage}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessageObj]);
    } finally {
      setChatProcessing(false);
    }
  };



  // Function to execute tool after confirmation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const executeTool = async (toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } }) => {


    // Set background operation state for sheet updates
    if (toolCall.function.name === 'update_sheet') {
      setBackgroundOperation({
        isRunning: true,
        operation: 'Updating sheets',
        progress: 'Preparing updates...'
      });
    }

    setChatProcessing(true);
    // Don't remove from pendingToolCalls yet - we need the images to be preserved
    console.log(`🔍 [EXECUTE_TOOL] Keeping tool call ${toolCall.id} in pendingToolCalls for image processing`);
    
    // Add processing message
    const processingMessage = {
      id: `msg_${Date.now()}_processing`,
      role: 'system' as const,
      content: `🔄 Executing ${toolCall.function.name}...`,
      timestamp: new Date(),
      isProcessing: true
    };
    setChatMessages(prev => [...prev, processingMessage]);
    
    try {
      // Prepare images for tool execution if available
      const imageData: Array<{ data: string; mimeType: string; }> = [];
      
      console.log(`🔍 [EXECUTE_TOOL] Tool name: ${toolCall.function.name}`);
      console.log(`🔍 [EXECUTE_TOOL] Uploaded images count: ${uploadedImages.length}`);
      console.log(`🔍 [EXECUTE_TOOL] Uploaded images:`, uploadedImages.map(img => ({ name: img.file.name, type: img.file.type })));
      
      // Check if we have uploaded images that should be passed to the tool
      const shouldProcessImages = uploadedImages.length > 0 && 
          (toolCall.function.name === 'analyze_images' || toolCall.function.name === 'analyze_files' || 
           toolCall.function.name === 'extract_data_from_images' || toolCall.function.name === 'extract_data_from_files');
      
      console.log(`🔍 [EXECUTE_TOOL] Should process images: ${shouldProcessImages}`);
      
      if (shouldProcessImages) {
        try {
          for (const img of uploadedImages) {
            const reader = new FileReader();
            const base64Data = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(img.file);
            });
            
            imageData.push({
              data: base64Data,
              mimeType: img.file.type
            });
          }
        } catch (error) {
          console.error('Error processing images for tool execution:', error);
          // Continue without images if processing fails
        }
      } else {
        console.log(`🔍 [EXECUTE_TOOL] No images to process or tool doesn't require images`);
      }

      // Use the original tool call since we no longer have confirmation modal
      const finalToolCall = toolCall;

      console.log(`🔍 [EXECUTE_TOOL] Sending ${imageData.length} images for tool: ${finalToolCall.function.name}`);
      console.log(`🔍 [EXECUTE_TOOL] Image types:`, imageData.map(img => img.mimeType));
      
      const response = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCall: finalToolCall,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetNames: selectedSheetNames
          },
          images: imageData
        }),
      });

      // Handle specific error responses
      if (!response.ok) {
        let errorMessage = 'Tool execution failed';
        let errorDetails = '';
        
        try {
          const errorData = await response.json();
          
          if (response.status === 413) {
            // File size limit exceeded
            errorMessage = '📁 File Size Limit Exceeded';
            errorDetails = errorData.details || errorData.error || 'Your files are too large for processing.';
            
            // Add specific guidance based on the error
            if (errorData.fileSize) {
              errorDetails += `\n\n📊 File Size: ${errorData.fileSize}`;
            }
            if (errorData.maxSize) {
              errorDetails += `\n📏 Maximum Size: ${errorData.maxSize}`;
            }
            if (errorData.totalSize) {
              errorDetails += `\n📦 Total Size: ${errorData.totalSize}`;
            }
            if (errorData.maxTotalSize) {
              errorDetails += `\n📦 Maximum Total: ${errorData.maxTotalSize}`;
            }
            
            errorDetails += '\n\n💡 Tips:';
            errorDetails += '\n• Compress your files before uploading';
            errorDetails += '\n• Split large PDFs into smaller sections';
            errorDetails += '\n• Use lower resolution images';
            errorDetails += '\n• Upload fewer files at once';
          } else {
            errorMessage = errorData.error || 'Tool execution failed';
            errorDetails = errorData.details || errorData.message || '';
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          errorMessage = `HTTP ${response.status}: Tool execution failed`;
        }
        
        throw new Error(`${errorMessage}\n\n${errorDetails}`);
      }

      const data = await response.json();
      
      // Remove processing message
      setChatMessages(prev => prev.filter(msg => !msg.isProcessing));
      
      // Now remove the tool call from pendingToolCalls after execution
      console.log(`🔍 [EXECUTE_TOOL] Removing tool call ${toolCall.id} from pendingToolCalls after execution`);
      setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
      
      // Add tool result to chat
      const resultMessage = {
        id: `msg_${Date.now()}_tool`,
        role: 'system' as const,
        content: data.success ? `✅ ${data.result}` : `❌ Error: ${data.error}`,
        timestamp: new Date(),
        toolResults: [{
          id: toolCall.id,
          result: data.result || 'Tool executed',
          success: data.success || false,
          details: data.details || null
        }]
      };
      setChatMessages(prev => [...prev, resultMessage]);

      // If this was an image analysis or extraction, clear the uploaded images
      if (imageData.length > 0 && data.success) {
        console.log(`🧹 [TOOL] Clearing ${uploadedImages.length} uploaded images after successful tool execution`);
        uploadedImages.forEach(img => {
          URL.revokeObjectURL(img.preview);
        });
        setUploadedImages([]);
      }

    } catch (error) {
      console.error('Tool execution error:', error);
      
      // Remove processing message
      setChatMessages(prev => prev.filter(msg => !msg.isProcessing));
      
      // Remove the tool call from pendingToolCalls even on error
      console.log(`🔍 [EXECUTE_TOOL] Removing tool call ${toolCall.id} from pendingToolCalls after error`);
      setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
      
      const errorMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `❌ Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatProcessing(false);
      // Clear background operation state
      setBackgroundOperation({
        isRunning: false,
        operation: '',
        progress: undefined
      });
    }
  };



  // Function to clear chat
  const clearChat = () => {
    setChatMessages([]);
    setPendingToolCalls([]);
    setSendResult("");
  };

  // Prefetch all sheet names and data once per selected spreadsheet
  useEffect(() => {
    let cancelled = false;
    const doPrefetch = async () => {
      if (!defaultSpreadsheetId) {
        setAllSheetNames([]);
        setSheetDataCache({});
        setSheetsPrefetched(false);
        return;
      }
      // Reset caches when spreadsheet changes
      setAllSheetNames([]);
      setSheetDataCache({});
      setSheetsPrefetched(false);
      try {
        const namesRes = await fetch('/api/get-sheet-names', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId })
        });
        const namesJson = await namesRes.json();
        const names: string[] = namesJson.sheetNames || namesJson.data || [];
        if (cancelled) return;
        setAllSheetNames(names);

        for (const name of names) {
          try {
            const dataRes = await fetch('/api/get-sheet-data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: name })
            });
            const dataJson = await dataRes.json();
            if (cancelled) return;
            setSheetDataCache(prev => ({ ...prev, [name]: dataJson.data || [] }));
          } catch (e) {
            console.warn('Prefetch sheet data failed for', name, e);
          }
        }
        if (!cancelled) setSheetsPrefetched(true);
      } catch (e) {
        console.warn('Prefetch sheet names failed', e);
      }
    };
    void doPrefetch();
    return () => { cancelled = true; };
  }, [defaultSpreadsheetId]);





  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedImages.forEach(img => {
        URL.revokeObjectURL(img.preview);
      });
    };
  }, [uploadedImages]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b0b0e] via-[#0c0c10] to-[#0a0a0d]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.12]" aria-hidden>
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-sky-500/30 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-fuchsia-500/20 blur-3xl rounded-full" />
        </div>

        <div className="w-full max-w-md px-5">
          <div className="glass gloss rounded-2xl p-6 border border-white/10 shadow-2xl animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/10 rounded-xl p-2">
                <Image src="/logo.png" alt="Sheety AI" width={28} height={28} className="dark:invert" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300">Sheety AI</h1>
                <p className="text-xs text-white/70">Sheets, automated by AI</p>
              </div>
            </div>
            <p className="text-sm text-white/80 mb-6 leading-relaxed">
              Speak or type updates and let AI structure, validate, and write them to your Google Sheets. Built for speed on mobile.
            </p>
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 hover:bg-white/90 active:scale-[0.98] transition-all px-4 py-3 rounded-xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12 c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.042,6.053,28.761,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20 s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,14,24,14c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.042,6.053,28.761,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c4.695,0,8.964-1.797,12.207-4.743l-5.641-4.758C28.565,35.091,26.392,36,24,36 c-5.202,0-9.616-3.317-11.277-7.946l-6.563,5.057C9.482,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-3.997,5.571 c0.001-0.001,0.003-0.002,0.004-0.003l6.571,4.819C36.695,39.644,44,35,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
              Sign in with Google
            </button>
            {authError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                <p className="font-medium">Authentication Error</p>
                <p className="mt-1">{authError}</p>
              </div>
            )}
            <div className="mt-6 grid grid-cols-3 gap-2 text-[10px] text-white/60">
              <div className="glass-soft rounded-lg p-2 text-center">Google Sign-In</div>
              <div className="glass-soft rounded-lg p-2 text-center">Voice + Text</div>
              <div className="glass-soft rounded-lg p-2 text-center">Write to Sheets</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PWAInstaller />
      <div className="min-h-screen w-full bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] p-3 sm:p-4 overflow-x-hidden">
        <div className="w-full max-w-2xl mx-auto space-y-6 sm:space-y-8 pb-32 sm:pb-40 pt-2">
          {/* Main Voice/Text Input Section - Mobile optimized */}
          <section className="glass rounded-2xl p-4 sm:p-6 space-y-4 border border-white/10 animate-fade-in-up">
            {/* Chat Messages Display */}
            {chatMessages.length > 0 && (
              <div className="mb-6">
                <div className="space-y-3 max-h-80 overflow-y-auto bg-black/20 rounded-lg p-4 border border-white/10">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow ${
                         message.role === 'user'
                           ? 'bg-sky-500/80 text-white'
                           : message.role === 'system'
                           ? 'bg-white/10 text-white/80 border border-white/10'
                           : 'bg-white/5 text-white/90 border border-white/10'
                      }`}>
                        <div className="flex items-center gap-2 mb-1 opacity-80">
                          <span className={`text-xs ${getMessageTypeColor(message.messageType)}`}>
                            {getMessageTypeIcon(message.messageType)}
                          </span>
                          <span className="text-xs">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                          {message.messageType === 'voice' && (
                            <span className="text-xs bg-sky-500/20 px-2 py-0.5 rounded text-sky-200 border border-sky-400/30">
                              Voice
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        {/* Quick reply chips (assistant messages only) */}
                        {message.role === 'assistant' && message.quickReplies && message.quickReplies.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.quickReplies.map((qr, idx) => (
                              <button
                                key={`${message.id}_qr_${idx}`}
                                onClick={() => processWithAIChat(qr)}
                                className="px-2.5 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20 border border-white/15 text-white/90"
                                aria-label={`Quick reply: ${qr}`}
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => (
                              <div key={attachment.id} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                                <div className="flex-shrink-0">
                                  {attachment.fileType === 'image' ? (
                                    <Image src={attachment.preview || ''} alt={attachment.name} width={32} height={32} className="w-8 h-8 object-cover rounded border" />
                                  ) : (
                                    <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate text-white/90">{attachment.name}</p>
                                  <p className="text-xs opacity-75">{attachment.fileType === 'image' ? 'Image' : 'PDF Document'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {message.toolResults && message.toolResults.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.toolResults.map((result, index) => (
                              <div key={`${result.id}-${index}`} className={`text-xs p-2 rounded border ${
                                result.success ? 'bg-green-500/10 text-green-300 border-green-400/30' : 'bg-red-500/10 text-red-300 border-red-400/30'
                              }`}>
                                <p>{result.result}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 text-white/80 p-3 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-sky-400 border-t-transparent rounded-full"></div>
                          <span className="text-sm">AI is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upfront spreadsheet selection nudges and sheet selector */}
            {chatMessages.length === 0 && !defaultSpreadsheetId && (
              <div className="mb-4 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
                <p className="text-sm mb-2">No spreadsheet selected.</p>
                <p className="text-xs opacity-80 mb-3">Please add or select a spreadsheet to enable smart updates.</p>
                <div className="flex gap-2">
                  <a href={process.env.NEXT_PUBLIC_SHEETS_LINK || '#'} target="_blank" className="px-3 py-1.5 text-xs rounded-lg bg-sky-600 hover:bg-sky-700 text-white">Open Google Sheets</a>
                </div>
              </div>
            )}

            {chatMessages.length === 0 && defaultSpreadsheetId && !sheetsPrefetched && (
              <div className="mb-4 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
                <p className="text-sm">Preparing your sheets…</p>
                <p className="text-xs opacity-80">Fetching sheet names and data so chat can answer quickly.</p>
              </div>
            )}

            {defaultSpreadsheetId && allSheetNames.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {allSheetNames.map(name => {
                    const active = selectedSheetNames?.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() => {
                          const set = new Set(selectedSheetNames || []);
                          if (set.has(name)) set.delete(name); else set.add(name);
                          setSelectedSheetNames(Array.from(set));
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-all duration-200 ${
                          active
                            ? 'bg-gradient-to-r from-sky-600 to-fuchsia-600 text-white border-transparent shadow-sm ring-2 ring-sky-400/40'
                            : 'bg-white/5 text-white/90 border-white/15 hover:bg-white/10'
                        }`}
                        aria-pressed={active}
                        aria-label={`Select sheet ${name}`}
                        title={name}
                      >
                        <span className="inline-flex items-center gap-1">
                          {active && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                          )}
                          {name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Chat Input Section - Mobile optimized */}
            <div className="relative w-full overflow-visible px-4">
              <div className="relative w-full">
                <div className="w-full mb-4">
                  <div className="relative rounded-2xl glass-soft border border-white/10 focus-within:ring-0 transition-all duration-200">
                    {uploadedImages.length > 0 && (
                      <div className="p-3 border-b border-white/10">
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const progress = getFileSizeProgress();
                            return uploadedImages.map((image, index) => {
                              const fileInfo = progress.fileSizes[index];
                              const isLarge = fileInfo.percentage > 80;
                              const isOverLimit = fileInfo.percentage > 100;
                              return (
                                <div key={image.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                                  isOverLimit ? 'bg-red-500/10 border-red-400/30 text-red-300' :
                                  isLarge ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-200' :
                                  'bg-sky-500/10 border-sky-400/30 text-sky-200'
                                }`}>
                                  {image.fileType === 'image' ? (
                                    <svg className="w-4 h-4 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium truncate max-w-[120px]">
                                      {image.file.name}
                                    </span>
                                    <span className="text-xs">
                                      {fileInfo.sizeMB}MB ({fileInfo.percentage.toFixed(0)}% of limit)
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => { URL.revokeObjectURL(image.preview); setUploadedImages(prev => prev.filter(img => img.id !== image.id)); }}
                                    className="ml-1 text-white/40 hover:text-white/80"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <line x1="4" y1="4" x2="16" y2="16" />
                                      <line x1="16" y1="4" x2="4" y2="16" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        {(() => {
                          const progress = getFileSizeProgress();
                          const maxFileSizeMB = (progress.maxFileSize / 1024 / 1024).toFixed(0);
                          const totalSizeMB = progress.totalSizeMB;
                          const fileCount = uploadedImages.length;
                          return (
                            <div className="mt-2 px-3 py-2 rounded-lg text-xs bg-black/20 border border-white/10">
                              <div className="flex items-center justify-between">
                                <span className="text-white/80 font-medium">
                                  📦 Total: {totalSizeMB}MB ({fileCount} file{fileCount !== 1 ? 's' : ''})
                                </span>
                                <span className="text-white/60">
                                  Max: {maxFileSizeMB}MB each
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="relative">
                      {/* Clean input: no recording badges or debug overlays */}
                      <textarea
                        value={displayText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editingText.trim() || uploadedImages.length > 0) {
                              processWithAIChat(editingText.trim() || 'Analyze these files');
                              setEditingText('');
                            }
                          }
                        }}
                        placeholder={uploadedImages.length > 0 
                          ? `Add context about your ${uploadedImages.length} attached file${uploadedImages.length !== 1 ? 's' : ''} or press Enter to analyze...`
                          : getSmartPlaceholder(uploadedImages, defaultSpreadsheetId, selectedSheetNames && selectedSheetNames.length > 0 ? selectedSheetNames[0] : null)
                        }
                        rows={3}
                        className={`w-full p-4 pr-20 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-white/50 text-white ${
                          listening ? 'border-l-4 border-l-sky-500' : ''
                        }`}
                        style={{
                          color: listening && (transcript || interimText) ? '#e5e7eb' : 'inherit',
                          backgroundColor: listening ? 'rgba(56, 189, 248, 0.06)' : 'transparent'
                        }}
                      />

                      <div className="absolute right-2 bottom-2 flex items-center gap-2">
                        {listening && (transcript || interimText) && (
                          <button
                            onClick={() => { setTranscript(""); setInterimText(""); }}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
                            title="Clear voice input"
                            aria-label="Clear voice input"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="6" y1="6" x2="18" y2="18" />
                              <line x1="18" y1="6" x2="6" y2="18" />
                            </svg>
                          </button>
                        )}
                        {/* Removed dev-only test button for cleaner UI */}

                        <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" onChange={handleImageUpload} className="hidden" id="text-area-upload" />
                        <label
                          htmlFor="text-area-upload"
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition duration-200 cursor-pointer ${
                            uploadingImages ? 'bg-sky-500/10 text-sky-300 border border-sky-400/30' : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                          title="Add images or PDFs"
                          aria-label="Add images or PDFs"
                        >
                          {uploadingImages ? (
                            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05L12 20.49a5.5 5.5 0 11-7.78-7.78l10-10a3.5 3.5 0 114.95 4.95l-10 10a1.5 1.5 0 11-2.12-2.12l9-9" />
                            </svg>
                          )}
                        </label>

                        <button
                          onClick={() => {
                            if (listening) {
                              const currentTranscript = transcript.trim();
                              const currentInterimText = interimText.trim();
                              const finalTranscript = currentTranscript + (currentInterimText ? ` ${currentInterimText}` : '');
                              setListening(false);
                              if (finalTranscript) {
                                const newEditingText = editingText.trim() ? `${editingText} ${finalTranscript}` : finalTranscript;
                                setEditingText(newEditingText);
                              }
                              setTimeout(() => { setTranscript(""); setInterimText(""); }, 50);
                            } else {
                              setTranscript("");
                              setInterimText("");
                              setListening(true);
                            }
                          }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                            listening ? 'bg-red-600 text-white shadow ring-2 ring-red-400/30 animate-pulse' : 'bg-sky-600 hover:bg-sky-700 text-white shadow'
                          }`}
                          title={listening ? "Stop recording" : "Start voice recording"}
                          aria-label={listening ? "Stop recording" : "Start voice recording"}
                        >
                          {listening ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <rect x="9" y="9" width="6" height="6" rx="1" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m0 0H9m3 0h3" />
                            </svg>
                          )}
                        </button>

                        {(editingText.trim() || uploadedImages.length > 0) && (
                          <button
                            onClick={() => { processWithAIChat(editingText.trim() || 'Analyze these files'); setEditingText(''); }}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 shadow"
                            title="Send"
                            aria-label="Send"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5l16.5 7.5-16.5 7.5 3.75-7.5-3.75-7.5z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 12h9.75" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full text-center" />

                {sendResult && (
                  <div className="text-xs sm:text-sm text-center text-white/80 px-4">
                    {sendResult}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Stepper modal remains unchanged */}
        </div>
      </div>
    </>
  );
}

// Helper functions for Phase 2 - Smart Intent Detection
const detectDataEntry = (text: string): boolean => {
  const dataEntryKeywords = [
    'add', 'update', 'insert', 'create', 'save', 'record', 'log', 'enter',
    'total', 'amount', 'quantity', 'date', 'name', 'email', 'phone', 'address',
    'expense', 'income', 'payment', 'sale', 'order', 'customer', 'item'
  ];
  
  const hasNumbers = /\d/.test(text);
  const hasDataKeywords = dataEntryKeywords.some(keyword => 
    text.toLowerCase().includes(keyword)
  );
  
  // Consider it data entry if it has numbers AND data keywords, or specific patterns
  const hasDataPattern = /(\$\d+|\d+\.\d+|\d+\/\d+\/\d+|\w+@\w+\.\w+)/.test(text);
  
  return (hasNumbers && hasDataKeywords) || hasDataPattern;
};

const detectIntent = (text: string): 'data_entry' | 'question' | 'instruction' | 'general' => {
  const questionWords = ['what', 'how', 'when', 'where', 'why', 'who', 'which', 'can you', 'do you'];
  const instructionWords = ['please', 'can you', 'help me', 'i need', 'show me'];
  
  if (questionWords.some(word => text.toLowerCase().startsWith(word))) {
    return 'question';
  }
  if (detectDataEntry(text)) {
    return 'data_entry';
  }
  if (instructionWords.some(word => text.toLowerCase().includes(word))) {
    return 'instruction';
  }
  return 'general';
};

const getSmartPlaceholder = (uploadedImages: UploadedImage[], defaultSpreadsheetId: string | null, selectedSheetName: string | null): string => {
  if (!defaultSpreadsheetId) return "First, select a spreadsheet above...";
  if (uploadedImages.length > 0) return `Describe what to do with these ${uploadedImages.length} file${uploadedImages.length !== 1 ? 's' : ''}...`;
  if (!selectedSheetName) return "Ask me about your spreadsheet or add data...";
  return "Add data, ask questions, or give instructions...";
};

const getMessageTypeIcon = (messageType?: string): string => {
  switch (messageType) {
    case 'voice': return '🎤';
    case 'text': return '💬';
    case 'sheet_update': return '📊';
    case 'tool_execution': return '⚙️';
    case 'ai_response': return '🤖';
    default: return '💬';
  }
};

const getMessageTypeColor = (messageType?: string): string => {
  switch (messageType) {
    case 'voice': return 'text-blue-600';
    case 'text': return 'text-blue-600';
    case 'sheet_update': return 'text-green-600';
    case 'tool_execution': return 'text-orange-600';
    case 'ai_response': return 'text-gray-600';
    default: return 'text-blue-600';
  }
};

const detectMissedSheetIntent = (userMessage: string, aiResponse: string): boolean => {
  const hasDataPattern = detectDataEntry(userMessage);
  const aiDidntMentionSheet = !aiResponse.toLowerCase().includes('sheet') && 
                              !aiResponse.toLowerCase().includes('spreadsheet') &&
                              !aiResponse.toLowerCase().includes('update') &&
                              !aiResponse.toLowerCase().includes('add');
  
  return hasDataPattern && aiDidntMentionSheet;
};

const filterMessages = (messages: ChatMessage[], filter: 'all' | 'conversation' | 'sheet_updates') => {
  switch (filter) {
    case 'conversation':
      return messages.filter(msg => 
        msg.messageType === 'voice' || 
        msg.messageType === 'text' || 
        msg.messageType === 'ai_response'
      );
    case 'sheet_updates':
      return messages.filter(msg => 
        msg.messageType === 'sheet_update' || 
        msg.messageType === 'tool_execution' ||
        (msg.toolCalls && msg.toolCalls.length > 0) ||
        (msg.toolResults && msg.toolResults.length > 0)
      );
    default:
      return messages;
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const suggestRelevantActions = (message: string, uploadedImages: UploadedImage[], hasSpreadsheet: boolean) => {
  const suggestions = [];
  
  if (detectDataEntry(message) && hasSpreadsheet) {
    suggestions.push({
      icon: "📊",
      text: "Add to spreadsheet",
      action: "data_entry"
    });
  }
  
  if (message.toLowerCase().includes('analyze') || message.toLowerCase().includes('report')) {
    suggestions.push({
      icon: "📈",
      text: "Analyze data",
      action: "analyze"
    });
  }
  
  if (uploadedImages.length > 0) {
    suggestions.push({
      icon: "👁️",
      text: "Extract data from files",
      action: "extract_data"
    });
  }
  
  if (message.toLowerCase().includes('question') || message.includes('?')) {
    suggestions.push({
      icon: "❓",
      text: "Answer question",
      action: "question"
    });
  }
  
  return suggestions;
};