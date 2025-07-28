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
import GeminiKeyPrompt from './components/GeminiKeyPrompt';
import RecentActivity from './components/RecentActivity';



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





export default function Home() {
  // All hooks must be called before any return!
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const { user, loading, signInWithGoogle, geminiApiKey, authError } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetName, setSelectedSheetName } = useSheet();
  const { serviceAccountEmail, isLoading: serviceAccountLoading } = useServiceAccount();
  // Removed: const { settingsOpen, setSettingsOpen } = useSettings();
  // Track user's available spreadsheets
  const [hasSpreadsheets, setHasSpreadsheets] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [listening, setListening] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);

  

  
  // Add state for available spreadsheet options
  const [spreadsheetOptions, setSpreadsheetOptions] = useState<Array<{id: string; spreadsheetId: string; sheetNames: string[]}>>([]);

  // Add state for image upload functionality
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Chat functionality state
  const [chatMessages, setChatMessages] = useState<Array<{
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
  }>>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  
  // Visual feedback state for voice-to-chat transitions
  const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  
  // State for missed intent detection and fallback UI
  const [missedIntentSuggestion, setMissedIntentSuggestion] = useState<string | null>(null);
  
  // State for message filtering and grouping
  const [messageFilter, setMessageFilter] = useState<'all' | 'conversation' | 'sheet_updates'>('all');
  
  // User context and preferences system
  const [userContext, setUserContext] = useState<{
    businessType: string;
    workflowDescription: string;
    sheetPurpose: string;
    preferredBehavior: string;
    formulaRows: number[];
    insertionPreference: 'above_formulas' | 'append' | 'custom';
  } | null>(null);
  const [showContextSetup, setShowContextSetup] = useState(false);
  
  // Voice recognition ref
  const recognitionRef = useRef<any>(null);

  // Speech recognition effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.error('Speech recognition not supported in this browser');
      return;
    }
    
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
      recognition.continuous = false; // Changed to false to prevent infinite loops
      recognition.interimResults = true;
      recognition.lang = "en-US";
      
      recognition.onstart = () => {
        console.log('Speech recognition started successfully!');
      };
      
      recognition.onresult = (event: any) => {
        console.log('Speech recognition result received:', event);
        
        let interimTranscript = '';
        let finalTranscript = '';

        // Process all results from the beginning
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          console.log(`Result ${i}:`, result[0].transcript, 'isFinal:', result.isFinal);
          
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
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
      
      recognition.onerror = (event: any) => {
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
        // Don't auto-restart - let the user control it
        recognitionRef.current = null;
        // Only stop listening if we're not supposed to be listening
        if (!listening) {
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

  // Debug transcript changes - add these right after the speech recognition useEffect
  useEffect(() => {
    console.log('Transcript changed:', transcript);
  }, [transcript]);

  useEffect(() => {
    console.log('Interim text changed:', interimText);
  }, [interimText]);

  // Check if user has any spreadsheets configured
  useEffect(() => {
    if (!user) {
      setHasSpreadsheets(false);
      return;
    }
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setHasSpreadsheets(snapshot.docs.length > 0);
    });
    return () => unsubOptions();
  }, [user]);



  // Subscribe to user's spreadsheet options
  useEffect(() => {
    if (!user) return;
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setSpreadsheetOptions(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as {id: string; spreadsheetId: string; sheetNames: string[]})));
    });
    return () => unsubOptions();
  }, [user]);



  // Fetch sheet data when spreadsheet and sheet are selected
  useEffect(() => {
    if (!defaultSpreadsheetId || !selectedSheetName) return;
    
    console.log(`🔍 Validating sheet data fetch: spreadsheet="${defaultSpreadsheetId}", sheet="${selectedSheetName}"`);
    
    // Add a small delay to prevent race conditions during rapid selection changes
    const timeoutId = setTimeout(async () => {
      try {
        // Double-check that the selection is still valid
        if (!defaultSpreadsheetId || !selectedSheetName) {
          console.log('⚠️ Selection cleared during timeout, skipping fetch');
          return;
        }
        
        console.log(`📡 Fetching data for sheet "${selectedSheetName}" in spreadsheet ${defaultSpreadsheetId}`);
        
        const res = await fetch('/api/get-sheet-data/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: selectedSheetName }),
        });
        
        if (res.ok) {
          const { data } = await res.json();
          console.log(`✅ Successfully fetched ${data?.length || 0} rows from "${selectedSheetName}"`);
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
                setSelectedSheetName(errorData.availableSheets[0]);
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
  }, [defaultSpreadsheetId, selectedSheetName, setSelectedSheetName]);



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
    if (!defaultSpreadsheetId || !selectedSheetName) {
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
          sheetName: selectedSheetName,
          actions: stepperFields.map(field => ({
            type: 'updateCell',
            sheet: field.sheetName || selectedSheetName,
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
          label: `Updated ${stepperFields.length} cells in ${selectedSheetName}`,
          timestamp: Date.now(),
          sheetsAffected: [selectedSheetName],
          rowsAffected: stepperFields.length
        });

        // Show success message
        setSendResult(`Successfully saved ${stepperFields.length} update${stepperFields.length !== 1 ? 's' : ''} to ${selectedSheetName}.`);
        
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



  // Image upload handlers
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    const newImages: UploadedImage[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf';
        
        if (!isImage && !isPdf) {
          console.warn(`Skipping unsupported file type: ${file.type}`);
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

      setUploadedImages(prev => [...prev, ...newImages]);
      
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error processing uploaded files:', error);
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
            // Convert file to base64
            const reader = new FileReader();
            const base64Data = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const result = reader.result as string;
                // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
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
            sheetName: selectedSheetName,
            availableTools: ['update_sheet_cells', 'insert_sheet_row', 'analyze_sheet_data', 'bulk_update_cells'],
          },
          conversationHistory: chatMessages.slice(-5),
          images: imageData // Include processed images
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Add AI response to chat with appropriate message type
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

      // Check for missed sheet update intent
      if (detectMissedSheetIntent(textToProcess, data.response || '')) {
        setMissedIntentSuggestion(`Did you want me to update your spreadsheet with this data? You said: "${textToProcess.slice(0, 50)}..."`);
        // Auto-clear the suggestion after 10 seconds
        setTimeout(() => setMissedIntentSuggestion(null), 10000);
      }

      // Handle pending tool calls
      if (data.pendingToolCalls && data.pendingToolCalls.length > 0) {
        setPendingToolCalls(data.pendingToolCalls);
      }

      // Clear uploaded images after successful processing
      if (uploadedImages.length > 0) {
        uploadedImages.forEach(img => {
          URL.revokeObjectURL(img.preview);
        });
        setUploadedImages([]);
      }
      
      setSendResult("AI response added to chat above.");
      
    } catch (error) {
      console.error('Chat processing error:', error);
      setSendResult(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
      
      // Add error message to chat
      const errorMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatProcessing(false);
    }
  };

  // Function to approve a tool call
  const approveTool = async (toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } }) => {
    setChatProcessing(true);
    setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
    
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
      
      // Check if we have uploaded images that should be passed to the tool
      if (uploadedImages.length > 0 && 
          (toolCall.function.name === 'analyze_images' || toolCall.function.name === 'extract_data_from_images')) {
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
      }

      const response = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCall,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetName: selectedSheetName
          },
          images: imageData // Include images for supported tools
        }),
      });

      const data = await response.json();
      
      // Remove processing message
      setChatMessages(prev => prev.filter(msg => !msg.isProcessing));
      
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
        uploadedImages.forEach(img => {
          URL.revokeObjectURL(img.preview);
        });
        setUploadedImages([]);
      }

             // Note: Consider adding sheet data refresh here if needed

    } catch (error) {
      console.error('Tool execution error:', error);
      
      // Remove processing message
      setChatMessages(prev => prev.filter(msg => !msg.isProcessing));
      
      const errorMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `❌ Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatProcessing(false);
    }
  };

  // Function to reject a tool call
  const rejectTool = (toolCall: { id: string; function: { name: string } }) => {
    setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
    
    const rejectionMessage = {
      id: `msg_${Date.now()}_reject`,
      role: 'system' as const,
      content: `Tool call rejected: ${toolCall.function.name}`,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, rejectionMessage]);
  };

  // Function to clear chat
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-[#18181b] px-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 sm:p-8 flex flex-col items-center max-w-md w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 mb-4">
            <Image src="/logo.png" alt="Logo" width={48} height={48} className="dark:invert" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">Welcome to Report AI</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6 text-center text-sm sm:text-base">Sign in with Google to get started and manage your spreadsheets with AI assistance.</p>
          <button
            onClick={signInWithGoogle}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-purple-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-semibold shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 w-full min-h-[50px]"
          >
            Sign in with Google
          </button>
          
          {authError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">Authentication Error</p>
                  <p className="mt-1">{authError}</p>
                  {authError.includes('unauthorized-domain') && (
                    <div className="mt-2 text-xs">
                      <p className="font-medium">How to fix:</p>
                      <ol className="list-decimal ml-4 mt-1 space-y-1">
                        <li>Go to the <a href="https://console.firebase.google.com/project/report-ai-23599/authentication/settings" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console</a></li>
                        <li>Navigate to Authentication → Settings → Authorized domains</li>
                        <li>Add &quot;{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}&quot; to the list</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
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
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Welcome to Report AI! 🎉
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base max-w-md mx-auto">
                    To get started, you&apos;ll need to add a Google Spreadsheet. Simply paste the share link from your Google Sheet in the navigation bar above.
                  </p>
                </div>
                {!geminiApiKey && (
                  <div className="max-w-md mx-auto">
                    <GeminiKeyPrompt />
                  </div>
                )}
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
                    <div className="text-left">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                        How to add a spreadsheet:
                      </p>
                      <ol className="list-decimal text-xs text-blue-700 dark:text-blue-300 pl-4 space-y-1">
                        <li>Open your Google Sheet</li>
                        <li>Click &quot;Share&quot; in the top-right</li>
                        <li>Share with the service account email above</li>
                        <li>Copy the share link</li>
                        <li>Paste it in the dropdown menu above</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Has spreadsheets - Show main UI */
              <>
                {!geminiApiKey && (
                  <GeminiKeyPrompt />
                )}
                <div className="flex items-center justify-between">
                  {defaultSpreadsheetId && selectedSheetName ? (
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
                            }) => (
                              <div key={result.id} className={`text-xs p-2 rounded ${
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

            {/* Pending tool approvals */}
            {pendingToolCalls.length > 0 && (
              <div className="mb-6 p-4 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-3 text-sm">Tool Approval Required</h3>
                {pendingToolCalls.map((toolCall) => (
                  <div key={toolCall.id} className="bg-white dark:bg-gray-700 p-3 rounded border mb-2 last:mb-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{toolCall.function.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">
                      {JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => approveTool(toolCall)}
                        className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                        disabled={chatProcessing}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectTool(toolCall)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
                        disabled={chatProcessing}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
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
                          {uploadedImages.map((image) => (
                            <div key={image.id} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-lg text-sm">
                              {image.fileType === 'image' ? (
                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              <span className="text-blue-700 dark:text-blue-300 font-medium truncate max-w-[120px]">
                                {image.file.name}
                              </span>
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
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Text Input */}
                    <div className="relative">
                      <textarea
                        value={editingText}
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
                          : getSmartPlaceholder(uploadedImages, defaultSpreadsheetId, selectedSheetName)
                        }
                        rows={3}
                        className="w-full p-4 pr-20 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-gray-500 dark:placeholder-gray-400"
                      />
                      
                      {/* Smart Action Suggestions */}
                      {editingText.trim() && editingText.length > 3 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                          <div className="p-2">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggested actions:</div>
                            <div className="flex flex-wrap gap-2">
                              {suggestRelevantActions(editingText, uploadedImages, !!(defaultSpreadsheetId && selectedSheetName)).map((suggestion, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    let enhancedMessage = editingText;
                                    switch (suggestion.action) {
                                      case 'data_entry':
                                        enhancedMessage = `Please add this data to my spreadsheet: ${editingText}`;
                                        break;
                                      case 'analyze':
                                        enhancedMessage = `Please analyze this data: ${editingText}`;
                                        break;
                                      case 'extract_data':
                                        enhancedMessage = `Please extract data from these files and add to spreadsheet: ${editingText}`;
                                        break;
                                      case 'question':
                                        enhancedMessage = `Please help me with this question: ${editingText}`;
                                        break;
                                    }
                                    processWithAIChat(enhancedMessage);
                                    setEditingText('');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs transition-colors"
                                >
                                  <span>{suggestion.icon}</span>
                                  <span>{suggestion.text}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Input controls - WhatsApp style */}
                      <div className="absolute right-2 bottom-2 flex items-center gap-1">
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
                              setListening(false);
                              
                              // Small delay to ensure transcript is captured
                              setTimeout(() => {
                                if (transcript.trim()) {
                                  console.log('Adding transcript to text input:', transcript);
                                  setEditingText(prev => prev.trim() ? `${prev} ${transcript}` : transcript);
                                  setTranscript("");
                                  setInterimText("");
                                }
                              }, 100);
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

                {/* Voice transcript display (read-only) */}
                {(transcript || interimText) && (
                  <div className="w-full min-h-[80px] mb-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {listening ? "🎤 Listening..." : "Voice Input"}
                      </span>
                      {transcript && (
                        <button
                          type="button"
                          onClick={() => { setTranscript(""); setListening(false); }}
                          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="4" x2="16" y2="16" />
                            <line x1="16" y1="4" x2="4" y2="16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                      {transcript}
                      {interimText && (
                        <span className="text-gray-400 dark:text-gray-500 italic"> {interimText}</span>
                      )}
                    </p>
                  </div>
                )}
                  
                  {/* Status Messages */}
                  <div className="w-full text-center">
                    {voiceTransitioning && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        ✨ Processing voice → chat...
                      </p>
                    )}
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

const filterMessages = (messages: any[], filter: 'all' | 'conversation' | 'sheet_updates') => {
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


