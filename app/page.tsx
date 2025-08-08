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
import { useChat, ChatMessage } from './providers/ChatProvider';



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

// ChatMessage type is imported from ChatProvider





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
  // const [spreadsheetsLoading, setSpreadsheetsLoading] = useState(true);
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
  
  // Chat functionality state (from provider)
  const { chatMessages, setChatMessages, ensureSession } = useChat();
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>([]);
  const [chatProcessing, setChatProcessing] = useState(false);

  // Ensure a session exists when page mounts for logged-in users
  useEffect(() => { void ensureSession(); }, [ensureSession]);
  
  // Visual feedback state for voice-to-chat transitions
  // const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  
  // State for missed intent detection and fallback UI
  const [missedIntentSuggestion, setMissedIntentSuggestion] = useState<string | null>(null);
  
  // State for message filtering and grouping
  const [messageFilter, setMessageFilter] = useState<'all' | 'conversation' | 'sheet_updates'>('all');
  
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
      // setSpreadsheetsLoading(false);
      return;
    }
    // setSpreadsheetsLoading(true);
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setHasSpreadsheets(snapshot.docs.length > 0);
      // setSpreadsheetsLoading(false);
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



  // Fetch sheet data when spreadsheet and sheet are selected
  useEffect(() => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) return;
    
    console.log(`🔍 Validating sheet data fetch: spreadsheet="${defaultSpreadsheetId}", sheets="${selectedSheetNames.join(', ')}"`);
    
    // Add a small delay to prevent race conditions during rapid selection changes
    const timeoutId = setTimeout(async () => {
      try {
        // Double-check that the selection is still valid
        if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
          console.log('⚠️ Selection cleared during timeout, skipping fetch');
          return;
        }
        
        console.log(`📡 Fetching data for sheet "${selectedSheetNames[0]}" in spreadsheet ${defaultSpreadsheetId}`);
        
        const res = await fetch('/api/get-sheet-data/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: selectedSheetNames[0] }),
        });
        
        if (res.ok) {
          const { data } = await res.json();
          console.log(`✅ Successfully fetched ${data?.length || 0} rows from "${selectedSheetNames[0]}"`);
        } else {
          // Parse the enhanced error response
          console.log(`📍 Response status: ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
          console.log(`📍 Response headers:`, Object.fromEntries(res.headers.entries()));
          
          try {
            // Clone the response to avoid "body already read" error
            const responseClone = res.clone();
            const responseText = await responseClone.text();
            console.log(`📄 Raw response body: "${responseText}"`);
            console.log(`📄 Response body length: ${responseText.length}`);
            console.log(`📄 Response body type: ${typeof responseText}`);
            
            if (!responseText.trim()) {
              console.error(`❌ Empty response body for ${res.status} error`);
              console.error(`❌ This suggests the API returned an empty response`);
              return;
            }
            
            let errorData;
            try {
              errorData = JSON.parse(responseText);
              console.log(`📋 Parsed error data:`, errorData);
              console.log(`📋 Error data type: ${typeof errorData}`);
              console.log(`📋 Error data keys:`, Object.keys(errorData || {}));
            } catch (jsonError) {
              console.error(`❌ JSON parse failed:`, jsonError);
              console.error(`❌ Attempting to parse: "${responseText}"`);
              return;
            }
            
            console.error(`❌ Failed to fetch sheet data: ${res.status} -`, errorData);
            
            // Handle specific sheet not found errors with helpful feedback
            if (res.status === 404 && errorData && errorData.availableSheets) {
              console.warn(`🔧 Sheet "${errorData.requestedSheet}" not found.`);
              console.warn(`📋 Available sheets: [${errorData.availableSheets.join(', ')}]`);
              
              if (errorData.availableSheets.length > 0) {
                console.log(`💡 Auto-correcting to first available sheet: "${errorData.availableSheets[0]}"`);
                // Auto-correct to the first available sheet
                setSelectedSheetNames([errorData.availableSheets[0]]);
              } else {
                console.error(`❌ No sheets available in this spreadsheet`);
              }
            } else if (res.status === 404) {
              // Handle 404 errors without available sheets (might be old format)
              console.warn(`🔧 404 error without enhanced response structure`);
              console.warn(`🔄 This might be from cached/stale data. The system should auto-correct soon.`);
              console.warn(`🔄 Error data received:`, errorData);
            }
          } catch (parseError) {
            console.error(`❌ Failed to parse error response: ${parseError}`);
            console.error(`❌ Parse error details:`, parseError);
            console.error(`❌ Original error: ${res.status} - Unable to parse response`);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching sheet data:', error);
      }
    }, 300); // 300ms delay to allow selection to stabilize
    
    return () => clearTimeout(timeoutId);
  }, [defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames]);



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
            sheetNames: selectedSheetNames,
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
        // Regular AI response
        const aiMessage = {
          id: `msg_${Date.now()}_ai`,
          role: 'assistant' as const,
          content: data.response || 'I processed your request.',
          timestamp: new Date(),
          messageType: 'ai_response' as const,
          toolCalls: data.toolCalls || [],
          toolResults: data.toolResults || []
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



  // Function to clear chat (current session)
  const clearChat = () => {
    setChatMessages([]);
    setPendingToolCalls([]);
    setSendResult("");
  };





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
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-[#18181b] px-4">
        <div className="text-center space-y-6">
          <Image src="/logo.png" alt="Logo" width={48} height={48} className="mx-auto dark:invert" />
          <button
            onClick={signInWithGoogle}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 min-h-[50px]"
          >
            Sign in with Google
          </button>
          {authError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm max-w-md mx-auto">
              <p className="font-medium">Authentication Error</p>
              <p className="mt-1">{authError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

      return (
      <>
        <PWAInstaller />
        <div className="min-h-screen w-full bg-gray-100 dark:bg-[#18181b] p-3 sm:p-4 overflow-x-hidden">
          <div className="w-full max-w-2xl mx-auto space-y-6 sm:space-y-8 pb-32 sm:pb-40 pt-2">
          
          {/* Main Voice/Text Input Section - Mobile optimized */}
          <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-4 sm:p-6 space-y-4 border border-gray-200 dark:border-gray-800">
            {!hasSpreadsheets ? (
              /* No Spreadsheets - Show Setup Prompt */
              <div className="text-center py-8 sm:py-12 space-y-6">
                <div className="w-20 h-20 mx-auto bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="space-y-3">
                  <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base max-w-md mx-auto">
                    Add a Google Spreadsheet using the input in the top-right.
                  </p>
                </div>
                {/* Removed Gemini API key prompt since user keys are no longer used */}
                {!serviceAccountLoading && serviceAccountEmail && (
                  <div className="max-w-md mx-auto">
                    <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
                  </div>
                )}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-md mx-auto">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-500 rounded-full p-1 flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-left text-xs text-blue-700 dark:text-blue-300">
                      Share your sheet with the service account email above, then paste the link into the selector.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Has spreadsheets - Show main UI */
              <>
                <SheetChipSelector />
                {/* Removed Gemini API key prompt since user keys are no longer used */}
                <div className="flex items-center justify-between">
                  {defaultSpreadsheetId && selectedSheetNames && selectedSheetNames.length > 0 ? (
                    // Removed "Ready" status as per user request
                    <></>
                  ) : (
                    <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-xs sm:text-sm">Select sheet above</span>
                    </div>
                  )}
                </div>
            
            {/* Chat Messages Display */}
            {chatMessages.length > 0 && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Conversation</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setMessageFilter('all')}
                        className={`px-2 py-1 text-xs rounded ${
                          messageFilter === 'all' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setMessageFilter('conversation')}
                        className={`px-2 py-1 text-xs rounded ${
                          messageFilter === 'conversation' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => setMessageFilter('sheet_updates')}
                        className={`px-2 py-1 text-xs rounded ${
                          messageFilter === 'sheet_updates' 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        Updates
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={clearChat}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded"
                  >
                    Clear Chat
                  </button>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  {filterMessages(chatMessages, messageFilter).map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg text-sm ${
                          message.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : message.role === 'system'
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            : 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs ${getMessageTypeColor(message.messageType)}`}>
                            {getMessageTypeIcon(message.messageType)}
                          </span>
                          <span className="text-xs opacity-75">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                          {message.messageType === 'voice' && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300">
                              Voice
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        
                        {/* Attachments display */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment: {
                              id: string;
                              name: string;
                              type: string;
                              fileType: 'image' | 'pdf';
                              preview?: string;
                            }) => (
                              <div key={attachment.id} className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg">
                                {attachment.fileType === 'image' ? (
                                  <>
                                    <div className="flex-shrink-0">
                                      <Image 
                                        src={attachment.preview || ''} 
                                        alt={attachment.name}
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 object-cover rounded border"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{attachment.name}</p>
                                      <p className="text-xs opacity-75">Image</p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex-shrink-0">
                                      <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{attachment.name}</p>
                                      <p className="text-xs opacity-75">PDF Document</p>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Tool results display */}
                        {message.toolResults && message.toolResults.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.toolResults.map((result: {
                              id: string;
                              result: string;
                              success: boolean;
                              details?: unknown;
                            }, index) => (
                              <div key={`${result.id}-${index}`} className={`text-xs p-2 rounded ${
                                result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                <p>{result.result}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Processing indicator */}
                  {chatProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                          <span className="text-sm">AI is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Missed Intent Suggestion */}
            {missedIntentSuggestion && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="bg-yellow-500 rounded-full p-1 flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      {missedIntentSuggestion}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Re-process with explicit sheet update intent
                          const lastUserMessage = chatMessages.filter(m => m.role === 'user').slice(-1)[0];
                          if (lastUserMessage) {
                            processWithAIChat(`Please update my spreadsheet with this data: ${lastUserMessage.content}`);
                          }
                          setMissedIntentSuggestion(null);
                        }}
                        className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition-colors"
                      >
                        Yes, update spreadsheet
                      </button>
                      <button
                        onClick={() => setMissedIntentSuggestion(null)}
                        className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 transition-colors"
                      >
                        No, thanks
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* AI Chat Input Section - Mobile optimized */}
            <div className="relative w-full overflow-visible px-4">
              <div className="relative w-full">
                {/* Text Input Field with File Attachments */}
                <div className="w-full mb-4">
                  <div className="relative border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all duration-200">
                    {/* File Attachments Display */}
                    {uploadedImages.length > 0 && (
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const progress = getFileSizeProgress();
                            return uploadedImages.map((image, index) => {
                              const fileInfo = progress.fileSizes[index];
                              const isLarge = fileInfo.percentage > 80;
                              const isOverLimit = fileInfo.percentage > 100;
                              
                              return (
                                <div key={image.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                  isOverLimit ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800' :
                                  isLarge ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800' :
                                  'bg-blue-50 dark:bg-blue-900/30'
                                }`}>
                                  {image.fileType === 'image' ? (
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <span className={`font-medium truncate max-w-[120px] ${
                                      isOverLimit ? 'text-red-700 dark:text-red-300' :
                                      isLarge ? 'text-yellow-700 dark:text-yellow-300' :
                                      'text-blue-700 dark:text-blue-300'
                                    }`}>
                                      {image.file.name}
                                    </span>
                                    <span className={`text-xs ${
                                      isOverLimit ? 'text-red-600 dark:text-red-400' :
                                      isLarge ? 'text-yellow-600 dark:text-yellow-400' :
                                      'text-blue-600 dark:text-blue-400'
                                    }`}>
                                      {fileInfo.sizeMB}MB ({fileInfo.percentage.toFixed(0)}% of limit)
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      URL.revokeObjectURL(image.preview);
                                      setUploadedImages(prev => prev.filter(img => img.id !== image.id));
                                    }}
                                    className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        
                        {/* Total files size indicator */}
                        {(() => {
                          const progress = getFileSizeProgress();
                          const maxFileSizeMB = (progress.maxFileSize / 1024 / 1024).toFixed(0);
                          const totalSizeMB = progress.totalSizeMB;
                          const fileCount = uploadedImages.length;
                          
                          return (
                            <div className="mt-2 px-3 py-2 rounded-lg text-xs bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">
                                  📦 Total: {totalSizeMB}MB ({fileCount} file{fileCount !== 1 ? 's' : ''})
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                  Max: {maxFileSizeMB}MB each
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    
                    {/* Text Input */}
                    <div className="relative">
                      {/* Voice recording indicator */}
                      {listening && (
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-xs text-blue-700 dark:text-blue-300">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          <span>Recording...</span>
                        </div>
                      )}
                      
                      {/* Debug info - only show in development */}
                      {process.env.NODE_ENV === 'development' && listening && (
                        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-700 dark:text-yellow-300">
                          T: &quot;{transcript}&quot; | I: &quot;{interimText}&quot;
                        </div>
                      )}
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
                        className={`w-full p-4 pr-20 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-gray-500 dark:placeholder-gray-400 ${
                          listening ? 'border-l-4 border-l-blue-500' : ''
                        }`}
                        style={{
                          color: listening && (transcript || interimText) ? '#1f2937' : 'inherit',
                          backgroundColor: listening ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                        }}
                      />
                      

                      
                      {/* Input controls - WhatsApp style */}
                      <div className="absolute right-2 bottom-2 flex items-center gap-1">
                        {/* Clear transcript button - only show when recording */}
                        {listening && (transcript || interimText) && (
                          <button
                            onClick={() => {
                              setTranscript("");
                              setInterimText("");
                            }}
                            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                            title="Clear voice input"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="4" y1="4" x2="16" y2="16" />
                              <line x1="16" y1="4" x2="4" y2="16" />
                            </svg>
                          </button>
                        )}
                        
                        {/* Test button to manually set transcript */}
                        {listening && (
                          <button
                            onClick={() => {
                              setTranscript("Test transcript ");
                              setInterimText("interim test");
                            }}
                            className="p-1 rounded text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-700 transition-all"
                            title="Test transcript"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L10 17.77l-8.18 3.25L3 14.14 8 9.27l8.91-1.01L10 2z" />
                            </svg>
                          </button>
                        )}
                        {/* File upload button */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="text-area-upload"
                        />

                        <label
                          htmlFor="text-area-upload"
                          className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                            uploadingImages 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                          title="Add images or PDFs"
                        >
                          {uploadingImages ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          )}
                        </label>
                        
                        {/* Voice button - WhatsApp style */}
                        <button
                          onClick={() => {
                            console.log('Voice button clicked, current listening state:', listening);
                            
                            if (listening) {
                              console.log('Stopping voice recording...');
                              
                              // Capture the current transcript before stopping
                              const currentTranscript = transcript.trim();
                              const currentInterimText = interimText.trim();
                              const finalTranscript = currentTranscript + (currentInterimText ? ` ${currentInterimText}` : '');
                              
                              console.log('Final transcript to add:', finalTranscript);
                              console.log('Current editingText:', editingText);
                              
                              // Stop listening first
                              setListening(false);
                              
                              // Add the transcript to the editing text immediately
                              if (finalTranscript) {
                                const newEditingText = editingText.trim() ? `${editingText} ${finalTranscript}` : finalTranscript;
                                console.log('Setting new editingText:', newEditingText);
                                setEditingText(newEditingText);
                              }
                              
                              // Clear the transcript state after a small delay
                              setTimeout(() => {
                                setTranscript("");
                                setInterimText("");
                              }, 50);
                            } else {
                              console.log('Starting voice recording...');
                              // Clear any previous transcript and start fresh
                              setTranscript("");
                              setInterimText("");
                              setListening(true);
                            }
                          }}
                          className={`p-2 rounded-lg transition-all duration-200 ${
                            listening 
                              ? 'bg-red-500 text-white animate-pulse' 
                              : (editingText.trim() ? 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white')
                          }`}
                          title={listening ? "Stop recording" : "Voice input"}
                        >
                          {listening ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          )}
                        </button>
                        
                        {/* Send button - only show if there's text or voice */}
                        {(editingText.trim() || uploadedImages.length > 0) && (
                          <button
                            onClick={() => {
                              processWithAIChat(editingText.trim() || 'Analyze these files');
                              setEditingText('');
                            }}
                            className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>


                  
                  {/* Status Messages */}
                  <div className="w-full text-center">
                    {/* {voiceTransitioning && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        ✨ Processing voice → chat...
                      </p>
                    )} */}
                  </div>

                    {/* Processing Result Message */}
                    {sendResult && (
                      <div className="text-xs sm:text-sm text-center text-gray-600 dark:text-gray-300 px-4">
                        {sendResult}
                      </div>
                    )}




                  </div>
                </div>
              </>
            )}
          </section>

          {/* Enhanced Stepper UI for multi-sheet, multi-row editing - Mobile optimized */}
          {stepperModalOpen && stepperFields.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
              <section className="w-full max-w-4xl mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-3 sm:p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[95vh] overflow-hidden">
                <button
                  onClick={() => {
                    setStepperFields([]);
                    setStepperComplete(false);
                    setStepperIndex(0);
                    setStepperValues({});
                    setStepperModalOpen(false);
                  }}
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold focus:outline-none z-10 bg-transparent min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close"
                >&times;</button>
                <div className="w-full overflow-y-auto scrollbar-none" style={{ maxHeight: '70vh', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {/* Add custom CSS for Webkit browsers to hide scrollbar */}
                  <style>{`
                    .scrollbar-none::-webkit-scrollbar { display: none; }
                  `}</style>
                {!stepperComplete ? (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold mb-4 text-center pr-8">Review & Edit Multi-Sheet Updates</h2>
                    <div className="w-full flex flex-col items-center">
                      <div className="mb-6 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs sm:text-sm text-gray-500">Field {stepperIndex + 1} of {stepperFields.length}</span>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {stepperFields[stepperIndex].sheetName && (
                              <span className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded text-xs">
                                Sheet: {stepperFields[stepperIndex].sheetName}
                              </span>
                            )}
                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono text-xs">
                              {stepperFields[stepperIndex].cell}
                            </span>
                          </div>
                        </div>
                        <label className="block text-base sm:text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200">
                          {stepperFields[stepperIndex].column}
                          {stepperFields[stepperIndex].row && (
                            <span className="text-sm text-gray-500 ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              Row {stepperFields[stepperIndex].row}
                            </span>
                          )}
                        </label>
                        <input
                          className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-sm sm:text-base mb-2 min-h-[50px]"
                          value={stepperValues[stepperFields[stepperIndex].cell] ?? stepperFields[stepperIndex].value ?? ''}
                          onChange={e => handleStepperChange(stepperFields[stepperIndex].cell, e.target.value)}
                          placeholder={`Enter value for ${stepperFields[stepperIndex].column}...`}
                        />
                        {stepperFields[stepperIndex].value && (
                          <div className="text-xs text-gray-500 mt-1">
                            AI suggested: <span className="italic">&quot;{stepperFields[stepperIndex].value}&quot;</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 w-full">
                        <button
                          onClick={handleStepperBack}
                          disabled={stepperIndex === 0}
                          className="px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:text-gray-600 transition text-sm font-medium disabled:opacity-50 min-h-[50px]"
                        >Back</button>
                        <button
                            onClick={handleStepperAcceptAll}
                          className="px-4 py-3 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium transition text-sm min-h-[50px] flex-1"
                          >Accept All AI Suggestions</button>
                        {stepperIndex < stepperFields.length - 1 ? (
                          <button
                            onClick={handleStepperNext}
                            className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition text-sm min-h-[50px]"
                          >Next</button>
                        ) : (
                          <button
                            onClick={handleStepperFinish}
                            className="px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition text-sm min-h-[50px]"
                          >Finish</button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold mb-4 text-center pr-8">Review Multi-Sheet Updates</h2>
                    
                    {/* Group fields by sheet for better organization - Mobile optimized */}
                    <div className="w-full max-h-64 sm:max-h-80 overflow-y-auto">
                      {Object.entries(
                        stepperFields.reduce((groups, field) => {
                          const sheetName = field.sheetName || 'Unknown Sheet';
                          if (!groups[sheetName]) groups[sheetName] = [];
                          groups[sheetName].push(field);
                          return groups;
                        }, {} as { [sheetName: string]: StepperField[] })
                      ).map(([sheetName, fields]) => (
                        <div key={sheetName} className="mb-4 sm:mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm sm:text-base">
                              {sheetName} ({fields.length} update{fields.length !== 1 ? 's' : ''})
                            </h3>
                          </div>
                          <div className="p-3 sm:p-4">
                            <div className="space-y-3">
                              {fields.map(field => (
                                <div key={field.cell} className="flex justify-between items-start py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                                  <div className="flex-1 pr-2">
                                                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {field.column}
                        {field.row && (
                          <span className="text-xs text-gray-500 ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                            Row {field.row}
                          </span>
                        )}
                      </div>
                                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 break-words">
                                    {stepperValues[field.cell] ?? field.value ?? <span className='italic text-gray-400'>(empty)</span>}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-400 font-mono ml-2 flex-shrink-0">
                                  {field.cell}
                                </div>
                              </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full">
                      <button
                        onClick={() => { setStepperComplete(false); setStepperIndex(0); setFinalSubmitStatus(null); }}
                        className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition text-sm sm:text-base min-h-[50px]"
                      >Edit Again</button>
                      <button
                        onClick={saveToSheet}
                        disabled={finalSubmitStatus === 'sending'}
                        className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition text-sm sm:text-base disabled:opacity-50 flex-1 min-h-[50px]"
                      >
                        {finalSubmitStatus === 'sending' ? (
                          <div className="flex items-center gap-2 justify-center">
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Saving...</span>
                          </div>
                        ) : (
                          `Save to ${Object.keys(stepperFields.reduce((groups, field) => {
                            const sheetName = field.sheetName || 'Unknown Sheet';
                            groups[sheetName] = true;
                            return groups;
                          }, {} as { [sheetName: string]: boolean })).length} Sheet${Object.keys(stepperFields.reduce((groups, field) => {
                            const sheetName = field.sheetName || 'Unknown Sheet';
                            groups[sheetName] = true;
                            return groups;
                          }, {} as { [sheetName: string]: boolean })).length !== 1 ? 's' : ''}`
                        )}
                      </button>
                    </div>
                    {finalSubmitStatus && finalSubmitStatus !== 'sending' && (
                      <p className={`mt-2 text-sm ${finalSubmitStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {finalSubmitStatus === 'success' ? 'Data saved successfully!' : 'Failed to save data.'}
                      </p>
                    )}
                  </>
                )}
                </div>
              </section>
            </div>
          )}


          <RecentActivity activity={activity} activityError={activityError} />
      </div>
    </div>

    {/* Background Operation Loading Indicator */}
    {backgroundOperation.isRunning && (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {backgroundOperation.operation}
              </p>
              {backgroundOperation.progress && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {backgroundOperation.progress}
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )}
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