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
import VerticalTicker from './VerticalTicker';
import Image from 'next/image';
import PWAInstaller from './components/PWAInstaller';
import GeminiKeyPrompt from './components/GeminiKeyPrompt';
// import { useSettings } from './providers/SettingsProvider'; // Corrected import path

// Types
// Add minimal interfaces for SpeechRecognition and SpeechRecognitionEvent
interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface MinimalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: MinimalSpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart?: () => void;
}
interface SpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  [index: number]: { 
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface MinimalSpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

// Add interface for uploaded images
interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  geminiFileUri?: string;
  fileType: 'image' | 'pdf'; // Added to distinguish between images and PDFs
}

// TypeScript: Add SpeechRecognition types if missing (for browser compatibility)
declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): MinimalSpeechRecognition;
    };
    SpeechRecognition?: {
      new (): MinimalSpeechRecognition;
    };
  }
  type SpeechRecognitionEvent = MinimalSpeechRecognitionEvent;
  var SpeechRecognition: unknown;
  var webkitSpeechRecognition: unknown;
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

interface AiApiResponse {
  aiResponse: {
    updates?: StepperField[];
    sheetsToUpdate?: string[];
  };
  error?: string;
}

function playBeep() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    )();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    o.onended = () => ctx.close();
  } catch {}
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
  const [paused, setPaused] = useState(false);
  const listeningRef = useRef(listening);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const interimTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);
  
  const [editingTranscript, setEditingTranscript] = useState(false);
  // Add state for AI APIs (replaces webhooks)
  const [aiApis, setAiApis] = useState<{ id: string; url: string; name: string }[]>([]);
  const [selectedAiApi] = useState<string>("gemini"); // Re-added selectedAiApi
  // Add state for available spreadsheet options
  const [spreadsheetOptions, setSpreadsheetOptions] = useState<Array<{id: string; spreadsheetId: string; sheetNames: string[]}>>([]);

  // Add state for image upload functionality
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default Gemini API (non-removable)
  const GEMINI_API = {
    id: "gemini",
    url: "/api/parse-and-fill-multi/",
    name: "Google Gemini (default)"
  };

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

  // Load user's AI APIs from Firebase
  useEffect(() => {
    if (!user) return;
    const aiApisRef = collection(db, "users", user.uid, "aiApis");

    const unsubAiApis = onSnapshot(aiApisRef, (snapshot) => {
      setAiApis(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; url: string; name: string }));
    });

    return () => {
      unsubAiApis();
    };
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

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

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

  const startListening = (clearTranscript = true) => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    
    console.log('SpeechRecognition class found:', SpeechRecognitionClass); // Debug log
    
    // Play beep when starting to record
    playBeep();
    // Create a new instance every time
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: MinimalSpeechRecognitionEvent) => {
      console.log('Speech recognition result received:', event); // Debug log
      
      let interimTranscript = '';
      let finalTranscript = '';

      // Process only the newest results to avoid duplication
      // Get the latest result only
      const latestResultIndex = event.results.length - 1;
      const latestResult = event.results[latestResultIndex];
      
      if (latestResult.isFinal) {
        finalTranscript = latestResult[0].transcript;
        console.log('Final result:', finalTranscript); // Debug log
      } else {
        interimTranscript = latestResult[0].transcript;
        console.log('Interim result:', interimTranscript); // Debug log
      }

      // Update transcript immediately to test if it works at all
      if (finalTranscript) {
        console.log('Setting final transcript:', finalTranscript); // Debug log
        setTranscript(prev => prev + finalTranscript + ' ');
        setInterimText('');
      }
      
      if (interimTranscript) {
        console.log('Setting interim transcript:', interimTranscript); // Debug log
        setInterimText(interimTranscript);
      }
    };
    recognition.onstart = () => {
      console.log('Speech recognition started successfully!');
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setListening(false);
    };
    recognition.onend = () => {
      if (listeningRef.current && !paused) {
        try {
          recognition.start();
        } catch {
          // ignore
        }
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    if (clearTranscript) {
      setTranscript("");
      setInterimText("");
    }
    setListening(true);
    setPaused(false);
    console.log('Starting speech recognition...'); // Debug log
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {}; // Prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // Clear any pending interim updates
    if (interimTimeoutRef.current) {
      clearTimeout(interimTimeoutRef.current);
      interimTimeoutRef.current = null;
    }
    setListening(false);
    setInterimText(""); // Clear interim text when stopping
  };

  const pauseListening = () => {
    setPaused(true);
    setInterimText(""); // Clear interim text when pausing
    stopListening();
  };

  const resumeListening = () => {
    setPaused(false);
    startListening(false); // Do not clear transcript
  };

  // Mic button handler (single button for all states)
  const handleMicButton = () => {
    if (listening && !paused) {
      pauseListening();
    } else if (paused) {
      resumeListening();
    } else {
      startListening(); // New recording, clear transcript
    }
  };

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
    if (!user || !defaultSpreadsheetId || Object.keys(stepperValues).length === 0) {
      setFinalSubmitStatus('error');
      return;
    }
    setFinalSubmitStatus('sending');
    try {
      // Prepare updates array for multi-sheet API: [{ sheetName, cell, value }]
      const updates = stepperFields.map(field => ({
        sheetName: field.sheetName || selectedSheetName || 'Sheet1',
        cell: field.cell,
        value: stepperValues[field.cell] ?? '',
      }));

              const res = await fetch('/api/save-sheet-data-multi/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: defaultSpreadsheetId,
          updates,
        }),
      });

      const result = await res.json();
      
      if (res.ok && result.success) {
        setFinalSubmitStatus('success');
        
        // Group updates by sheet for activity tracking
        const sheetGroups = updates.reduce((groups, update) => {
          if (!groups[update.sheetName]) groups[update.sheetName] = [];
          groups[update.sheetName].push(update);
          return groups;
        }, {} as { [sheetName: string]: typeof updates });

        // Enhanced activity tracking for multi-sheet/multi-row operations
        for (const [sheetName, sheetUpdates] of Object.entries(sheetGroups)) {
          // Count unique rows affected in this sheet
          const uniqueRowsInSheet = [...new Set(sheetUpdates.map(update => {
            const field = stepperFields.find(f => f.cell === update.cell);
            return field?.row;
          }).filter(Boolean))].length;
          
          const updateLabel = `${sheetUpdates.length} update${sheetUpdates.length !== 1 ? 's' : ''} to ${sheetName}`;
          const rowLabel = uniqueRowsInSheet > 0 ? ` (${uniqueRowsInSheet} row${uniqueRowsInSheet !== 1 ? 's' : ''})` : '';
          
          await addActivity({
            type: 'add',
            entity: 'webhook', // Re-using webhook entity for compatibility
            label: updateLabel + rowLabel,
            timestamp: Date.now(),
            sheetName,
            rowData: sheetUpdates.map(({ cell, value }) => ({
              column: stepperFields.find(f => f.cell === cell)?.column || '',
              cell,
              value,
            })),
            sheetsAffected: Object.keys(sheetGroups),
            rowsAffected: result.totalRowsAffected || result.totalUpdated || 0,
          });
        }

        // Close modal, reset stepper state
        setTimeout(() => {
          setStepperModalOpen(false);
          setStepperFields([]);
          setStepperComplete(false);
          setStepperIndex(0);
          setStepperValues({});
          setFinalSubmitStatus(null);
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

  const sendToAiApi = async () => {
    if (!transcript || !defaultSpreadsheetId) {
      setSendResult("Please provide transcript and select a spreadsheet in the navigation.");
      return;
    }
    
    if (!geminiApiKey && selectedAiApi === "gemini") {
      setSendResult("Please add your Gemini API key in settings first.");
      return;
    }
    
    // Stop listening if currently active
    if (listening) {
      stopListening();
    }
    
    // Find an available sheet if none is selected
    let sheetNameToUse = selectedSheetName;
    if (!sheetNameToUse) {
      // Find the current spreadsheet option to get available sheets
      const currentSpreadsheet = spreadsheetOptions.find(o => o.spreadsheetId === defaultSpreadsheetId);
      if (currentSpreadsheet && currentSpreadsheet.sheetNames.length > 0) {
        // Use the first available sheet
        sheetNameToUse = currentSpreadsheet.sheetNames[0];
        // Update the selected sheet name in the context
        setSelectedSheetName(sheetNameToUse);
      }
    }
    
    setSending(true);
    setSendResult(null);
    const api = selectedAiApi === "gemini"
      ? GEMINI_API
      : aiApis.find(a => a.id === selectedAiApi);
    if (!api) {
      setSendResult("Invalid AI API selected.");
      setSending(false);
      return;
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
        setSending(false);
        return;
      }
    }

    try {
      console.log("Sending to AI API:", JSON.stringify({
        transcript,
        spreadsheetId: defaultSpreadsheetId,
        selectedSheetName: sheetNameToUse || undefined,
        hasImages: imageData.length > 0
      }, null, 2));
      const res = await fetch(api.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          spreadsheetId: defaultSpreadsheetId,
          selectedSheetName: sheetNameToUse || undefined, // Optional - let AI decide if not set
          geminiApiKey: geminiApiKey, // Pass the user's Gemini API key from the provider
          images: imageData
        }),
      });
      const text = await res.text();
      console.log("AI API raw response text:", text);
      console.log("AI API HTTP status:", res.status, res.statusText);
      let data: AiApiResponse;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse AI API response as JSON:", e);
        data = { error: "Failed to parse response.", aiResponse: {} };
      }
      console.log("AI API parsed response:", data);
      if (res.ok && data.aiResponse) {
          // Handle enhanced multi-sheet response
          const aiFields = Array.isArray(data.aiResponse)
            ? data.aiResponse
            : data.aiResponse.updates || [];
          
          setStepperFields(aiFields);
          // Initialize stepperValues with value for each field
          const initialStepperValues: { [cell: string]: string } = {};
          aiFields.forEach((field: StepperField) => {
            if (field.cell) {
              initialStepperValues[field.cell] = field.value ?? '';
            }
          });
          setStepperValues(initialStepperValues);
          setStepperModalOpen(true);
          // Enhanced feedback for multi-sheet/multi-row operations
          const sheetsCount = data.aiResponse.sheetsToUpdate?.length || 1;
          const updatesCount = aiFields.length;
          const rowsCount = [...new Set(aiFields.map((f: StepperField) => f.row).filter(Boolean))].length;
          
          let feedbackMsg = `AI suggestions ready: ${updatesCount} update${updatesCount !== 1 ? 's' : ''} across ${sheetsCount} sheet${sheetsCount !== 1 ? 's' : ''}`;
          if (rowsCount > 0) {
            feedbackMsg += ` (${rowsCount} row${rowsCount !== 1 ? 's' : ''})`;
          }
          
          // Count images and PDFs for feedback message
          const uploadedImageCount = imageData.filter(img => img.mimeType.startsWith('image/')).length;
          const uploadedPdfCount = imageData.filter(img => img.mimeType === 'application/pdf').length;
          
          if (uploadedImageCount > 0 || uploadedPdfCount > 0) {
            const imagePart = uploadedImageCount > 0 ? `${uploadedImageCount} image${uploadedImageCount !== 1 ? 's' : ''}` : '';
            const pdfPart = uploadedPdfCount > 0 ? `${uploadedPdfCount} PDF${uploadedPdfCount !== 1 ? 's' : ''}` : '';
            const separator = uploadedImageCount > 0 && uploadedPdfCount > 0 ? ' and ' : '';
            
            feedbackMsg += ` with ${imagePart}${separator}${pdfPart}`;
          }
          
          feedbackMsg += '. Confirm and edit as needed.';
          
          setSendResult(feedbackMsg);
          
          // Clear images after successful processing
          if (imageData.length > 0) {
            clearAllImages();
          }
        } else {
          setSendResult(data.error || "Failed to get AI response.");
        }
    } catch (e) {
      setSendResult("Error: " + (e instanceof Error ? e.message : String(e)));
    }
    setSending(false);
  };

  // Delete custom AI API
  // const deleteAiApi = async (id: string) => {
  //   if (!user) return;
  //   await deleteDoc(doc(db, "users", user.uid, "aiApis", id));
  //   if (selectedAiApi === id) setSelectedAiApi("gemini");
  // };

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
        const isPdf = file.type === 'application/pdf';
        const isImage = file.type.startsWith('image/');
        
        if (!isImage && !isPdf) {
          alert(`${file.name} is not a supported file type. Please use images or PDFs.`);
          continue;
        }

        // Validate file size (different limits for images and PDFs)
        const maxSizeInMB = isPdf ? 20 : 10; // 20MB for PDFs, 10MB for images
        const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
        
        if (file.size > maxSizeInBytes) {
          alert(`${file.name} is too large. Please use ${isPdf ? 'PDFs' : 'images'} under ${maxSizeInMB}MB.`);
          continue;
        }
        
        // For PDFs, validate page count limitation warning
        if (isPdf) {
          // We can't actually count PDF pages client-side easily,
          // so we'll just show a warning about the 20-page limitation
          alert(`Note: Gemini API will only process the first 20 pages of ${file.name}.`);
        }

        // Create preview URL
        const preview = URL.createObjectURL(file);
        
        const imageData: UploadedImage = {
          id: `img_${Date.now()}_${i}`,
          file,
          preview,
          fileType: isPdf ? 'pdf' : 'image'
        };

        newImages.push(imageData);
      }

      setUploadedImages(prev => [...prev, ...newImages]);
    } catch (error) {
      console.error('Error processing images:', error);
      alert('Error processing files. Please try again.');
    } finally {
      setUploadingImages(false);
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (imageId: string) => {
    setUploadedImages(prev => {
      const imageToRemove = prev.find(img => img.id === imageId);
      if (imageToRemove) {
        // Clean up preview URL
        URL.revokeObjectURL(imageToRemove.preview);
      }
      return prev.filter(img => img.id !== imageId);
    });
  };

  const clearAllImages = () => {
    uploadedImages.forEach(img => {
      URL.revokeObjectURL(img.preview);
    });
    setUploadedImages([]);
  };

  // Compute file counts for display
  const imageCount = uploadedImages.filter(img => img.fileType === 'image').length;
  const pdfCount = uploadedImages.filter(img => img.fileType === 'pdf').length;
  const uploadedFilesText = [
    imageCount > 0 ? `${imageCount} image${imageCount !== 1 ? 's' : ''}` : '',
    pdfCount > 0 ? `${pdfCount} PDF${pdfCount !== 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(', ');

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
            
            {/* Transcript/voice chat UI - Mobile optimized */}
            <div className="relative w-full overflow-visible px-4">
              {!editingTranscript ? (
                <div className="relative w-full">
                  {/* Editable VerticalTicker that combines input and display */}
                  <div className="w-full min-h-[120px] sm:min-h-[128px] flex items-center justify-center relative overflow-visible transition-all duration-500 my-2 mx-1">
                    <VerticalTicker 
                      transcript={transcript + (interimText ? ` ${interimText}` : '')} 
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTranscript(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          sendToAiApi();
                        }
                      }}
                      placeholder="Type or speak your message..."
                      disabled={listening}
                      isRecording={listening}
                    />
                    {/* Clear button overlay - Mobile optimized */}
                    {transcript && (
                      <button
                        type="button"
                        onClick={() => { setTranscript(""); stopListening(); setEditingTranscript(false); }}
                        className="absolute top-2 right-2 p-2 rounded-full z-30
                                 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                                 hover:bg-gray-100 dark:hover:bg-gray-700
                                 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm
                                 transition-all duration-200 border border-gray-200 dark:border-gray-600
                                 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="4" y1="4" x2="16" y2="16" />
                          <line x1="16" y1="4" x2="4" y2="16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* Input Controls - Mobile optimized */}
                  <div className="w-full flex flex-col items-center gap-4 mt-4">
                    {/* Voice Input Button - Enhanced for mobile */}
                    <div className="relative p-6 sm:p-8">
                      <button
                        onClick={handleMicButton}
                        className={`relative h-28 w-28 sm:h-32 sm:w-32 rounded-full flex items-center justify-center transition-all duration-500
                                  transform hover:scale-105 active:scale-95 group overflow-hidden
                                  ${listening 
                                    ? 'bg-gradient-to-br from-red-500 via-pink-500 to-red-600 shadow-2xl shadow-red-500/50' 
                                    : 'bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 shadow-2xl shadow-blue-500/30 animate-gradient-x'}
                                  before:absolute before:inset-0 before:rounded-full before:p-[3px]
                                  ${listening 
                                    ? 'before:bg-gradient-to-br before:from-red-400 before:via-pink-400 before:to-red-500 before:animate-pulse' 
                                    : 'before:bg-gradient-to-r before:from-yellow-300 before:via-pink-300 before:to-blue-300 before:animate-gradient-x'}`}
                      >
                        {/* Animated gradient border effect */}
                        <div className={`absolute inset-[3px] rounded-full transition-all duration-500
                                       ${listening 
                                         ? 'bg-gradient-to-br from-red-500 via-pink-500 to-red-600' 
                                         : 'bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 animate-gradient-x'}`} />
                        
                        {/* Inner button content */}
                        <div className="relative z-10 w-full h-full rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                          <svg 
                            className={`w-14 h-14 sm:w-16 sm:h-16 text-white transition-all duration-300 drop-shadow-lg
                                      ${listening ? 'animate-pulse' : 'group-hover:scale-110'}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2.5} 
                              d={listening 
                                ? "M6 6l12 12M6 18L18 6"
                                : "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"} 
                            />
                          </svg>
                        </div>
                        
                        {/* Animated pulse rings */}
                        {listening && (
                          <>
                            <div className="absolute inset-0 rounded-full border-4 border-yellow-300/50 animate-ping" />
                            <div className="absolute inset-0 rounded-full border-4 border-pink-300/50 animate-ping animation-delay-300" />
                            <div className="absolute inset-0 rounded-full border-4 border-blue-300/50 animate-ping animation-delay-700" />
                          </>
                        )}
                      </button>
                    </div>

                    <div className="w-full max-w-sm flex items-center gap-2 justify-center">
                      {/* Process with AI Button - Mobile optimized */}
                      {transcript.trim() && (
                        <button
                          onClick={sendToAiApi}
                          disabled={sending || !defaultSpreadsheetId}
                          className={`h-12 sm:h-12 px-4 sm:px-6 rounded-xl flex items-center gap-2 transition-all duration-200 text-sm sm:text-base font-medium flex-1 justify-center min-h-[50px]
                                    ${sending 
                                      ? 'bg-purple-600 text-white cursor-not-allowed opacity-70'
                                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'}`}
                        >
                          {sending ? (
                            <>
                              <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="hidden sm:inline">Processing...</span>
                              <span className="sm:hidden">...</span>
                            </>
                          ) : (
                            <>
                              <span>{listening ? "Stop & Process with AI" : "Process with AI"}</span>
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
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

                    {/* Image Upload Section - Mobile optimized */}
                    <div className="w-full max-w-md mx-auto space-y-4">
                      {/* Image Upload Button */}
                      <div className="flex items-center justify-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="image-upload"
                        />
                        <label
                          htmlFor="image-upload"
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed 
                                   ${uploadingImages 
                                     ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' 
                                     : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'}
                                   cursor-pointer transition-all duration-200 bg-white/50 dark:bg-gray-800/50
                                   hover:bg-blue-50 dark:hover:bg-gray-700/50 min-h-[50px]`}
                        >
                          {uploadingImages ? (
                            <>
                              <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span className="text-blue-600 dark:text-blue-400 text-sm">Processing images...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-gray-600 dark:text-gray-300 text-sm">Add images or PDFs (optional)</span>
                            </>
                          )}
                        </label>
                      </div>

                      {/* Uploaded Images Display */}
                      {uploadedImages.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {uploadedFilesText}
                            </span>
                            <button
                              onClick={clearAllImages}
                              className="text-xs px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors min-h-[32px]"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {uploadedImages.map((image) => (
                              <div key={image.id} className="relative group">
                                {image.fileType === 'image' ? (
                                  <Image
                                    src={image.preview}
                                    alt="Uploaded"
                                    width={96}
                                    height={96}
                                    className="w-full h-20 sm:h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                                  />
                                ) : (
                                  <div className="w-full h-20 sm:h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9h4m-2-2v6" />
                                    </svg>
                                  </div>
                                )}
                                <button
                                  onClick={() => removeImage(image.id)}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors opacity-80 group-hover:opacity-100"
                                >
                                  ×
                                </button>
                                <div className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs p-1 rounded truncate">
                                  {image.file.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* File Type Limitations Info */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="font-medium mb-1">File Upload Limitations:</div>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><span className="font-medium">Images:</span> JPEG, PNG, WebP, HEIC, HEIF (max 10MB)</li>
                          <li><span className="font-medium">PDFs:</span> Max 20MB, only first 20 pages processed</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative w-full">
                  <textarea
                    id="manual-transcript"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 
                             bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm
                             px-4 py-3 pr-12 text-sm sm:text-base text-gray-900 dark:text-gray-100 
                             focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                             transition-all duration-200 resize-none min-h-[50px]"
                    style={{ minHeight: 120, fontSize: '1.08rem', lineHeight: 1.5 }}
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="Type or speak your message..."
                  />
                  <button
                    type="button"
                    onClick={() => setEditingTranscript(false)}
                    className="absolute top-3 right-3 p-2 rounded-full
                             bg-blue-500 text-white hover:bg-blue-600
                             transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="5 10 9 14 15 7" />
                    </svg>
                  </button>
                </div>
              )}
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

          {/* Recent Activity section - Mobile optimized */}
          <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-800 mt-8 sm:mt-12">
            <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
              <svg width="20" height="20" className="sm:w-6 sm:h-6" fill="none" stroke="#6366f1" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
              Recent Activity
            </h2>
            {activityError && (
              <div className="text-xs text-red-600 mb-2">{activityError}</div>
            )}
            {activity.length === 0 ? (
              <div className="text-gray-400 text-xs">No recent edits yet.</div>
            ) : (
              <ul className="space-y-2 w-full">
                  {activity.slice(0, 5).map((item, i) => {
                    const expanded = expandedActivity === i;
                    return (
                      <li key={i} className="flex flex-col gap-1 text-xs w-full p-2 sm:p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <div className="flex items-start gap-2 sm:gap-3 cursor-pointer" onClick={() => setExpandedActivity(expanded ? null : i)}>
                    <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-100 dark:bg-gray-800 mt-0.5 flex-shrink-0">
                      {item.type === 'add' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>}
                      {item.type === 'edit' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#f59e42" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>}
                      {item.type === 'delete' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6m-6 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>}
                    </span>
                        <span className="truncate flex-1 text-xs sm:text-sm">
                    {item.entity === 'sheet' ? (
                      <>
                        <span className="font-medium text-gray-700 dark:text-gray-200">Sheet</span> <span className="capitalize">{item.type}</span> <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
                        {item.type === 'edit' && item.oldValue && item.newValue && (
                          <span className="ml-1 text-gray-500">(from <span className="italic">{item.oldValue}</span> to <span className="italic">{item.newValue}</span>)</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-purple-700 dark:text-purple-300">Webhook</span> <span className="capitalize">{item.type}</span> <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
                        {item.webhookType && (
                          <span className="ml-1 text-gray-500">({item.webhookType})</span>
                        )}
                        {item.type === 'edit' && item.oldValue && item.newValue && (
                          <span className="ml-1 text-gray-500">(from <span className="italic">{item.oldValue}</span> to <span className="italic">{item.newValue}</span>)</span>
                        )}
                      </>
                    )}
                    <span className="ml-2 text-gray-400">&middot; {dayjs(item.timestamp).fromNow()}</span>
                  </span>
                        <button
                          className="ml-2 text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none flex-shrink-0 min-h-[32px]"
                          onClick={e => { e.stopPropagation(); setExpandedActivity(expanded ? null : i); }}
                          aria-label={expanded ? "Collapse details" : "Expand details"}
                        >{expanded ? "Hide" : "Show"}</button>
                      </div>
                      {expanded && (
                        <div className="mt-2 ml-7 sm:ml-9">
                          {/* Show sheet and row info for webhook add */}
                          {item.type === 'add' && item.entity === 'webhook' && (
                            <div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                              {item.sheetName && <span>Sheet: <span className="font-semibold text-blue-700 dark:text-blue-300">{item.sheetName}</span></span>}
                              {item.rowNumber && <span className="ml-2">Row: <span className="font-semibold text-green-700 dark:text-green-300">{item.rowNumber}</span></span>}
                            </div>
                          )}
                          {/* Show row data for webhook add */}
                          {item.type === 'add' && item.entity === 'webhook' && item.rowData && item.rowData.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-[200px] border border-gray-200 dark:border-gray-700 rounded text-xs">
                                <thead>
                                  <tr>
                                    <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Column</th>
                                    <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Cell</th>
                                    <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.rowData.map((cell, idx) => (
                                    <tr key={idx}>
                                      <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.column}</td>
                                      <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.cell}</td>
                                      <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.value}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </div>
    </div>
    </>
  );
}


