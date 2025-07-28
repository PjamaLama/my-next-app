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
import VoiceRecorder from './components/VoiceRecorder';


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

  
  // New state for Genkit-based actions
  const [genkitActions, setGenkitActions] = useState<Array<{
    type: 'insertRow' | 'updateCell';
    sheet: string;
    row: number;
    column: string;
    value?: string | number;
    confidence: 'high' | 'medium' | 'low';
  }>>([]);
  const [showGenkitPreview, setShowGenkitPreview] = useState(false);
  const [genkitLoading, setGenkitLoading] = useState(false);
  const [genkitCleaning, setGenkitCleaning] = useState(false);
  
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
  }>>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>([]);
  const [chatProcessing, setChatProcessing] = useState(false);

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
  const processWithAIChat = async (inputText?: string, isVoiceInput: boolean = false) => {
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
      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content: textToProcess,
        timestamp: new Date(),
        isVoice: isVoiceInput,
        hasImages: uploadedImages.length > 0,
        imageCount: uploadedImages.length,
        attachments: uploadedImages.map(img => ({
          id: img.id,
          name: img.file.name,
          type: img.file.type,
          fileType: img.fileType,
          preview: img.preview
        }))
      };
      setChatMessages(prev => [...prev, userMessage]);
      
      // Clear transcript if it was voice input
      if (isVoiceInput) {
        setTranscript("");
      }

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
      
      // Call the chat API
      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToProcess,
          isVoice: isVoiceInput,
          context: {
            spreadsheetId: defaultSpreadsheetId,
            sheetName: selectedSheetName,
          },
          conversationHistory: chatMessages.slice(-5),
          images: imageData // Include processed images
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      // Add AI response to chat
      const aiMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant' as const,
        content: data.response || 'I processed your request.',
        timestamp: new Date(),
        toolCalls: data.toolCalls || [],
        toolResults: data.toolResults || []
      };
      setChatMessages(prev => [...prev, aiMessage]);

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

  // New function to send transcript to Genkit API
  const sendToGenkitApi = async () => {
    if (!transcript || !defaultSpreadsheetId) {
      setSendResult("Please provide transcript and select a spreadsheet in the navigation.");
      return;
    }
    
    // Stop listening if currently active
    if (listening) {
      setListening(false);
    }
    
    // Find an available sheet if none is selected
    let sheetNameToUse = selectedSheetName;
    if (!sheetNameToUse) {
      const currentSpreadsheet = spreadsheetOptions.find(o => o.spreadsheetId === defaultSpreadsheetId);
      if (currentSpreadsheet && currentSpreadsheet.sheetNames.length > 0) {
        sheetNameToUse = currentSpreadsheet.sheetNames[0];
        setSelectedSheetName(sheetNameToUse);
      }
    }
    
    setGenkitLoading(true);
    setGenkitCleaning(true);
    setSendResult(null);
    
    try {
      console.log("Sending to Genkit API:", {
        transcript: transcript,
        sheetId: defaultSpreadsheetId,
        sheetName: sheetNameToUse
      });
      
      const res = await fetch('/api/updateSheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          sheetId: defaultSpreadsheetId,
          sheetName: sheetNameToUse
        }),
      });
      
      const data = await res.json();
      console.log("Genkit API response:", data);
      
      if (res.ok && data.success && data.actions) {
        setGenkitActions(data.actions);
        setShowGenkitPreview(true);
        setSendResult(`AI generated ${data.actions.length} action${data.actions.length !== 1 ? 's' : ''}. Review and approve below.`);
      } else {
        setSendResult(data.error || "Failed to get AI response.");
      }
    } catch (error) {
      console.error('Error calling Genkit API:', error);
      setSendResult("Error: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setGenkitLoading(false);
      setGenkitCleaning(false);
    }
  };

  // Function to approve Genkit actions
  const approveGenkitActions = async () => {
    try {
      setGenkitLoading(true);
      
      console.log("Committing actions to Genkit API...");
      
      const res = await fetch('/api/updateSheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          sheetId: defaultSpreadsheetId,
          sheetName: selectedSheetName,
          commit: true
        }),
      });
      
      const data = await res.json();
      console.log("Genkit commit response:", data);
      
      if (res.ok && data.success) {
        setShowGenkitPreview(false);
        setGenkitActions([]);
        
        // Show success message with execution details
        const executedCount = data.executedActions || genkitActions.length;
        setSendResult(`Successfully executed ${executedCount} action${executedCount !== 1 ? 's' : ''}!`);
        
        // Add activity
        await addActivity({
          type: 'add',
          entity: 'sheet',
          label: `Executed ${executedCount} AI-generated action${executedCount !== 1 ? 's' : ''}`,
          timestamp: Date.now(),
          sheetsAffected: [...new Set(genkitActions.map(action => action.sheet))],
          rowsAffected: [...new Set(genkitActions.map(action => action.row))].length
        });
      } else {
        setSendResult(data.error || "Failed to execute actions.");
      }
    } catch (error) {
      console.error('Error approving actions:', error);
      setSendResult("Error executing actions: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setGenkitLoading(false);
    }
  };

  // Function to reject Genkit actions
  const rejectGenkitActions = () => {
    setGenkitActions([]);
    setShowGenkitPreview(false);
    setSendResult("Actions rejected. Try again with a different transcript.");
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
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Conversation</h3>
                  <button
                    onClick={clearChat}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded"
                  >
                    Clear Chat
                  </button>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  {chatMessages.map((message) => (
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
                          {message.role === 'user' && message.isVoice && (
                            <span className="text-xs">🎤</span>
                          )}
                          <span className="text-xs opacity-75">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        
                        {/* Attachments display */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => (
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
                            {message.toolResults.map((result) => (
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
                              processWithAIChat(editingText.trim() || 'Analyze these files', false);
                              setEditingText('');
                            }
                          }
                        }}
                        placeholder={uploadedImages.length > 0 
                          ? `Add context about your ${uploadedImages.length} attached file${uploadedImages.length !== 1 ? 's' : ''} or press Enter to analyze...`
                          : "Type your message or use voice input below..."
                        }
                        rows={3}
                        className="w-full p-4 pr-20 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-gray-500 dark:placeholder-gray-400"
                      />
                      
                      {/* Input controls */}
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
                        
                        {/* Send button */}
                        <button
                          onClick={() => {
                            if (editingText.trim() || uploadedImages.length > 0) {
                              processWithAIChat(editingText.trim() || 'Analyze these files', false);
                              setEditingText('');
                            }
                          }}
                          disabled={!editingText.trim() && uploadedImages.length === 0}
                          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 text-white rounded-lg transition-all duration-200"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
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
                  
                  {/* Input Controls - Mobile optimized */}
                  <div className="w-full flex flex-col items-center gap-4 mt-4">
                    {/* Voice Recorder Component */}
                    <VoiceRecorder
                      onTranscriptChange={setTranscript}
                      onInterimTextChange={setInterimText}
                      onListeningChange={setListening}
                      onTranscriptComplete={(completedTranscript) => {
                        setEditingText(prev => {
                          const newText = prev.trim() ? `${prev} ${completedTranscript}` : completedTranscript;
                          return newText;
                        });
                      }}
                      listening={listening}
                      transcript={transcript}
                      interimText={interimText}
                    />
                      
                      {/* Process with Genkit Button - Mobile optimized */}
                      {transcript.trim() && (
                        <button
                          onClick={sendToGenkitApi}
                          disabled={genkitLoading || !defaultSpreadsheetId}
                          className={`h-12 sm:h-12 px-4 sm:px-6 rounded-xl flex items-center gap-2 transition-all duration-200 text-sm sm:text-base font-medium flex-1 justify-center min-h-[50px]
                                    ${genkitLoading 
                                      ? 'bg-green-600 text-white cursor-not-allowed opacity-70'
                                      : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'}`}
                        >
                          {genkitLoading ? (
                            <>
                              <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="hidden sm:inline">
                                {genkitCleaning ? 'Cleaning transcript...' : 'Processing...'}
                              </span>
                              <span className="sm:hidden">
                                {genkitCleaning ? 'Cleaning...' : '...'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>Process with Genkit</span>
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Processing Result Message */}
                    {sendResult && (
                      <div className="text-xs sm:text-sm text-center text-gray-600 dark:text-gray-300 px-4">
                        {sendResult}
                      </div>
                    )}

                    {/* Genkit Actions Preview */}
                    {showGenkitPreview && genkitActions.length > 0 && (
                      <div className="w-full max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            AI Actions Preview
                          </h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {genkitActions.length} action{genkitActions.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {genkitActions.map((action, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                action.confidence === 'high' ? 'bg-green-500' :
                                action.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {action.type === 'insertRow' ? `Insert row ${action.row}` : `Update cell ${action.column}${action.row}`}
                                </div>
                                {action.value && (
                                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    Value: &quot;{action.value}&quot;
                                  </div>
                                )}
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Sheet: {action.sheet} • Confidence: {action.confidence}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={approveGenkitActions}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                          >
                            Approve All
                          </button>
                          <button
                            onClick={rejectGenkitActions}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                          >
                            Reject
                          </button>
                        </div>
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


