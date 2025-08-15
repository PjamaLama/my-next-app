"use client";
import React, { useState, useRef, useEffect } from "react";
import { useChat, ChatMessage as ProviderChatMessage } from './providers/ChatProvider';
import ColumnChooser from './components/ColumnChooser';
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
  limit,
  doc
} from "firebase/firestore";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

import { motion } from 'framer-motion';
import Image from 'next/image';
import PWAInstaller from './components/PWAInstaller';
import RecentActivity from './components/RecentActivity';
import SheetChipSelector from './components/SheetChipSelector';
import EditRowModal from './components/EditRowModal';
// Dialog not used on landing to avoid provider coupling issues
import dynamic from 'next/dynamic';





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
    sheetsUsed?: string[];
    tables?: Array<{ title?: string; headers: string[]; rows: string[][]; footer?: string[]; summary?: string }>;
    charts?: Array<{ kind: 'bar'|'line'|'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }>; options?: Record<string, unknown> }>;
    insights?: string[];
    approved?: boolean; // Track if this message's table updates have been approved
  };

  // Ephemeral file-analysis context shared across a few turns
  interface FileAnalysisContext {
    files: Array<{
      mimeType: string;
      extractedData?: unknown;
      timestamp: number;
    }>;
    lastUpdated: number;
  }





export default function Home() {
  // All hooks must be called before any return!
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const { user, loading, signInWithGoogle, joinBeta, authError, betaTester, betaWaitlist, continueWithGoogle } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames, allSheetNames, sheetDataCache, sheetsPrefetched, setSheetDataCache, sheetStructureCache, unstructuredOverrides, setDefaultSpreadsheetId } = useSheet();
  const { serviceAccountEmail, isLoading: serviceAccountLoading } = useServiceAccount();

  // Track user's available spreadsheets
  const [hasSpreadsheets, setHasSpreadsheets] = useState(false);
  const [spreadsheetsLoading, setSpreadsheetsLoading] = useState(true);
  // Prefetched sheet metadata and cache
  // moved to provider
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(listening);
  const [editingText, setEditingText] = useState("");
  const [sendResult, setSendResult] = useState<string | null>(null);
  // Transient toast for prominent error/success notifications
  const [toast, setToast] = useState<{ type: 'error'|'success'; message: string } | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  // Onboarding state for first-time setup
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false); // Used in onboarding
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1); // Used in onboarding

  // Initialize onboarding for new users without a connected spreadsheet
  // Wait for spreadsheets to load before deciding whether to show onboarding
  useEffect(() => {
    if (!user) { setShowOnboarding(false); return; }
    if (spreadsheetsLoading) { return; } // Wait for spreadsheets to finish loading
    if (defaultSpreadsheetId) { setShowOnboarding(false); return; }
    try {
      const done = typeof window !== 'undefined' ? localStorage.getItem('onboardingDone') === '1' : false;
      setShowOnboarding(!done);
    } catch { setShowOnboarding(true); }
  }, [user, defaultSpreadsheetId, spreadsheetsLoading]);

  // Advance to Step 2 after a spreadsheet is connected
  useEffect(() => {
    if (showOnboarding && onboardingStep === 1 && defaultSpreadsheetId) {
      setOnboardingStep(2);
    }
  }, [showOnboarding, onboardingStep, defaultSpreadsheetId]);

  const completeOnboarding = () => { // Used in onboarding
    try { localStorage.setItem('onboardingDone', '1'); } catch {}
    setShowOnboarding(false);
  };
  const dismissOnboarding = () => { // Used in onboarding
    setShowOnboarding(false);
  };

  // Stay on '/', which renders the chat UI when authenticated
  // Helper to show a transient error toast
  const showErrorToast = (message: string) => {
    setToast({ type: 'error', message });
    // Auto-dismiss after 5 seconds
    setTimeout(() => setToast(null), 5000);
  };

  // Promote tool error messages to toast for visibility
  useEffect(() => {
    if (!sendResult) return;
    if (/^Tool error:/i.test(sendResult) || /Sheet update failed/i.test(sendResult)) {
      showErrorToast(sendResult);
    }
  }, [sendResult]);

  // Beta program live count
  const [betaLimit, setBetaLimit] = useState<number>(100);
  const [betaCount, setBetaCount] = useState<number>(0);
  const [betaOpen, setBetaOpen] = useState<boolean>(false);
  const spotsLeft = Math.max(0, betaLimit - betaCount);
  const betaFull = betaOpen ? false : spotsLeft <= 0;

  

  
  // Inline spreadsheet add UI state
  const [newSheetId, setNewSheetId] = useState<string>("");
  const [addingSheet, setAddingSheet] = useState<boolean>(false);
  const [serviceAccountChecked, setServiceAccountChecked] = useState<boolean>(false);
  // Chat provider hooks to ensure session and persist messages for AI title generation
  const { ensureSession, setChatMessages: setProviderChatMessages, chatMessages: providerChatMessages } = useChat();
  // Add state for available spreadsheet options


  // Add state for image upload functionality
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  
  // Chat functionality state
  const chatMessages = providerChatMessages as unknown as ChatMessage[];
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [showCharts, setShowCharts] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  // Toggle per message id whether we show only combined table (if present) or all per-file tables
  const [combinedTablePref, setCombinedTablePref] = useState<Record<string, boolean>>({});
  const [responsePrefs, setResponsePrefs] = useState<{ charts: boolean; stats: boolean }>({ charts: false, stats: false });
  const [previewModal, setPreviewModal] = useState<{ open: boolean; rows: Array<{ row: number; updates: Record<string, string>; confidence: number; reason?: string }> | null; summary?: string }>({ open: false, rows: null });

  // Keep recent file-analysis results so follow-up turns can reference them
  const [recentFileAnalysis, setRecentFileAnalysis] = useState<FileAnalysisContext | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [tableActionState, setTableActionState] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});
  // Last Google identity for "Continue as" UX
  const [lastGoogle, setLastGoogle] = useState<{ email?: string; name?: string; photo?: string } | null>(null);
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const email = localStorage.getItem('lastGoogleEmail') || undefined;
      const name = localStorage.getItem('lastGoogleName') || undefined;
      const photo = localStorage.getItem('lastGooglePhoto') || undefined;
      if (email || name || photo) setLastGoogle({ email, name, photo });
    } catch (_) {
      // ignore
    }
  }, []);
  const isFileAnalysisFresh = (fa: FileAnalysisContext | null) => {
    if (!fa || !fa.lastUpdated) return false;
    const FIVE_MINUTES = 5 * 60 * 1000;
    return Date.now() - fa.lastUpdated < FIVE_MINUTES;
  };

  const ChartRenderer = dynamic(() => import('./components/ChartRenderer'), { ssr: false });
  const ChartExplorer = dynamic(() => import('./components/ChartExplorer'), { ssr: false });
  
  // State for missed intent detection and fallback UI
  const [missedIntentSuggestion, setMissedIntentSuggestion] = useState<string | null>(null);
  
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
      console.warn('Speech recognition not supported in this browser');
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

  // DEBUG: Debug transcript changes - add these right after the speech recognition useEffect
  // useEffect(() => {
  //   console.log('Transcript changed:', transcript);
  // }, [transcript]);

  // useEffect(() => {
  //   console.log('Interim text changed:', interimText);
  // }, [interimText]);

  // Note: We keep the textarea bound only to editingText to preserve caret position while listening.

  // DEBUG: Debug editingText changes
  // useEffect(() => {
  //   console.log('editingText changed:', editingText);
  // }, [editingText]);

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

  // Live subscribe to centralized beta meta document
  useEffect(() => {
    const metaRef = doc(db, 'meta', 'beta');
    const unsub = onSnapshot(metaRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { capacity?: number; testerCount?: number; open?: boolean };
        setBetaLimit(typeof data.capacity === 'number' ? data.capacity : 100);
        setBetaCount(typeof data.testerCount === 'number' ? data.testerCount : 0);
        setBetaOpen(!!data.open);
      } else {
        setBetaLimit(100);
        setBetaCount(0);
        setBetaOpen(false);
      }
    });
    return () => unsub();
  }, []);

  // Trigger a secure server refresh of testerCount on first load
  useEffect(() => {
    fetch('/api/beta-stats').catch(() => {});
  }, []);

  // Load service account email once for add-sheet helper
  useEffect(() => {
    if (serviceAccountChecked) return;
    fetch('/api/get-service-account')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { /* useServiceAccount provides email; no local state update needed */ })
      .catch(() => {})
      .finally(() => setServiceAccountChecked(true));
  }, [serviceAccountChecked]);

  const normalizeSheetId = (input: string): string => {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const dIndex = segments.findIndex((seg) => seg === 'd');
      if (dIndex !== -1 && segments[dIndex + 1]) {
        return segments[dIndex + 1];
      }
    } catch {
      // Not a full URL; fall through
    }
    if (trimmed.includes('/d/')) {
      const afterD = trimmed.split('/d/')[1] || '';
      return afterD.split('/')[0] || trimmed;
    }
    return trimmed;
  };

  const handleAddSpreadsheet = async () => {
    const parsedId = normalizeSheetId(newSheetId);
    if (!parsedId || !user) return;
    setAddingSheet(true);
    try {
      // Try to capture spreadsheet title for UX
      const meta = await fetch(`/api/get-sheet-names?spreadsheetId=${encodeURIComponent(parsedId)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .catch(() => ({} as any));
      const title = (meta && (meta as any).spreadsheetTitle) || undefined;
      await addDoc(collection(db, 'users', user.uid, 'options'), { spreadsheetId: parsedId, title });
      setDefaultSpreadsheetId(parsedId);
      setNewSheetId("");
    } finally {
      setAddingSheet(false);
    }
  };







  // Fetch selected sheet if not cached (avoid duplicate with prefetch)
  useEffect(() => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) return;
    const focus = selectedSheetNames[0];
    // If focus is not present in latest known sheet list, skip fetch
    if (allSheetNames.length > 0 && !allSheetNames.includes(focus)) return;
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
        } else if (res.status === 404) {
          // Sheet no longer exists: drop it from selection
          const remaining = selectedSheetNames.filter(n => n !== focus);
          setSelectedSheetNames(remaining);
        }
      } catch (error) {
        console.error('❌ Error fetching sheet data:', error);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [defaultSpreadsheetId, selectedSheetNames, allSheetNames, sheetsPrefetched, sheetDataCache, setSheetDataCache]);



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
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    const newImages: UploadedImage[] = [];

    try {
      // Check file sizes and get warnings/errors
      const { warnings, errors } = checkFileSizes(files as FileList);

      // Process files
      const arr = Array.from(files as unknown as File[]);
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        
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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await handleFiles(files);
  };

  // Quick add helper (extract + insert/update into selected sheet)
  const performQuickAdd = async () => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
      setSendResult('Select a spreadsheet and sheet first.');
      return;
    }
    if (uploadedImages.length === 0) {
      setSendResult('Attach a file first.');
      return;
    }
    setQuickAddLoading(true);
    try {
      const filesPayload: Array<{ data: string; mimeType: string }> = [];
      for (const img of uploadedImages) {
        const reader = new FileReader();
        // eslint-disable-next-line no-await-in-loop
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(img.file);
        });
        filesPayload.push({ data: base64Data, mimeType: img.file.type });
      }

      const toolCall = {
        id: `tool_${Date.now()}_quick_add`,
        type: 'function' as const,
        function: { name: 'extract_data_from_files', arguments: JSON.stringify({ transcript: 'Add data from these files to the selected sheet' }) }
      };
      const resp = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCall,
          context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames },
          images: filesPayload
        })
      });
      const data = await resp.json();
      if (resp.ok && data?.success) {
        setSendResult(data.result || 'Added extracted data to sheet');
        uploadedImages.forEach(img => URL.revokeObjectURL(img.preview));
        setUploadedImages([]);
      } else {
        setSendResult(data?.error || 'Quick add failed');
      }
    } catch (e) {
      setSendResult('Quick add failed');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const addExtractedTableToSheet = async (messageId: string, tableIndex: number, table: { headers: string[]; rows: string[][]; title?: string }) => {
    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
      setSendResult('Select a spreadsheet and sheet first.');
      return;
    }
    const key = `${messageId}_${tableIndex}`;
    setTableActionState(prev => ({ ...prev, [key]: 'loading' }));
    try {
      // Convert the displayed table back into structured rows keyed by headers
      const structuredRows = table.rows.map(r => {
        const obj: Record<string, string> = {};
        table.headers.forEach((h, i) => { obj[String(h || '').trim()] = String(r[i] ?? ''); });
        return obj;
      });
      const toolCall = {
        id: `tool_${Date.now()}_add_extracted_${tableIndex}`,
        type: 'function' as const,
        function: { name: 'apply_structured_rows', arguments: JSON.stringify({ rows: structuredRows }) }
      };
      const resp = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCall,
          context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames },
          images: []
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.success) throw new Error(data?.error || 'Failed');
      setTableActionState(prev => ({ ...prev, [key]: 'done' }));
      setSendResult(data.result || 'Extracted data added to sheet');
    } catch (e) {
      setTableActionState(prev => ({ ...prev, [key]: 'idle' }));
      setSendResult('Failed to add extracted data');
    }
  };





  // Enhanced function to process with AI Chat (combining old functionality with new chat)
  const processWithAIChat = async (inputText?: string) => {
    const textToProcess = inputText || transcript;
    // Snapshot files immediately so we can safely clear UI state without losing them
    const filesToSend = uploadedImages.slice();
    const hasFilesToProcess = filesToSend.length > 0;
    // Allow sending with only files (no text). Only require spreadsheet when no files are attached.
    if (!textToProcess.trim() && !hasFilesToProcess) {
      setSendResult("Please provide input or attach files.");
      return;
    }
    if (!defaultSpreadsheetId && !hasFilesToProcess) {
      setSendResult("Please select a spreadsheet in the navigation.");
      return;
    }
    
    // Stop listening if currently active
    if (listening) {
      setListening(false);
    }
    
    setChatProcessing(true);
    
    try {
      // Ensure there is an active chat session before adding messages
      await ensureSession();

      // Add user message to chat
      const userIntent = detectIntent(textToProcess);
      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content: textToProcess,
        timestamp: new Date(),
        hasImages: filesToSend.length > 0,
        imageCount: filesToSend.length,
        messageType: 'text' as const, // Always text since voice converts to text
        attachments: filesToSend.map(img => ({
          id: img.id,
          name: img.file.name,
          type: img.file.type,
          fileType: img.fileType,
          preview: img.preview
        }))
      };
      setProviderChatMessages(prev => [...prev, userMessage as unknown as ProviderChatMessage]);
      // Clear the upload area immediately after sending so files aren't pinned there
      if (filesToSend.length > 0) {
        setUploadedImages([]);
      }
      
      // Clear transcript
      setTranscript("");

      // Prepare images for the API call
      const imageData: Array<{ data: string; mimeType: string; name?: string; }> = [];
      
      if (filesToSend.length > 0) {
        try {
          for (const img of filesToSend) {
            // Convert with compression for images
            if (img.fileType === 'image') {
              try {
                const { compressImageFile } = await import('../lib/imageCompression');
                const compressed = await compressImageFile(img.file, 1600, 0.7);
                imageData.push({ data: compressed.base64, mimeType: compressed.mimeType, name: img.file.name });
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
                imageData.push({ data: base64Data, mimeType: img.file.type, name: img.file.name });
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
              imageData.push({ data: base64Data, mimeType: img.file.type, name: img.file.name });
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
      const focus = selectedSheetNames?.[0];
      const cachedTable = focus ? sheetDataCache[focus] : undefined;
      const isNonTabular = !!focus && (unstructuredOverrides[focus] ?? (sheetStructureCache[focus] ? !sheetStructureCache[focus].isStructured : false));
      const contextForChat = {
        spreadsheetId: defaultSpreadsheetId,
        sheetNames: selectedSheetNames,
        sheetName: focus,
        debug: true,
        allSheetNames,
        responsePrefs,
        ...(cachedTable && cachedTable.length > 0 ? { sheetData: { [focus as string]: cachedTable }, sheetHeaders: cachedTable[0] } : {}),
        ...(isNonTabular ? { isNonTabular: true } : {}),
        // Keep request small: server will hydrate sheets as needed
        fileAnalysis: isFileAnalysisFresh(recentFileAnalysis) ? recentFileAnalysis : undefined,
      };
      console.log('🔍 [CHAT] Sending context:', contextForChat);
      const response = await fetch('/api/genkit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToProcess,
          userIntent: userIntent,
          context: contextForChat,
          conversationHistory: chatMessages.slice(-5),
          images: imageData // Include processed images
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Chat processing failed';
        let errorDetails = '';
        
        // Handle 413 up front even if response body isn't JSON
        if (response.status === 413) {
          const friendly = [
            '📁 File Size Limit Exceeded',
            'Your upload exceeded the current limits (8MB per file, 20MB total).',
            'Tips:',
            '• Compress images before uploading',
            '• Split large PDFs into smaller sections',
            '• Use lower resolution images',
            '• Upload fewer files at once'
          ].join('\n');
          setSendResult(friendly);
          setChatProcessing(false);
          return;
        }

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
        // Persist recent file analyses for a few minutes for follow-up turns
        if (data.context.fileAnalysis && data.context.fileAnalysis.lastUpdated) {
          try {
            const fa = data.context.fileAnalysis as FileAnalysisContext;
            setRecentFileAnalysis(fa);
          } catch {}
        }
      }
      
      {
        // Regular AI response with optional quick replies and structured tables
        const suppressResponseText = Boolean((data as any).suppressResponseText);
        const aiMessage = {
          id: `msg_${Date.now()}_ai`,
          role: 'assistant' as const,
          content: suppressResponseText ? '' : (data.response || 'I processed your request.'),
          timestamp: new Date(),
          messageType: 'ai_response' as const,
          toolCalls: data.toolCalls || [],
          toolResults: data.toolResults || [],
          quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies.slice(0, 3) : undefined,
          sheetsUsed: Array.isArray(data.sheetsUsed) ? (data.sheetsUsed as string[]) : (selectedSheetNames || []),
          // Attach tables for rendering
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tables: Array.isArray((data as any).dataTables) ? (data as any).dataTables : undefined,
          charts: Array.isArray((data as any).charts) ? (data as any).charts : undefined,
          insights: Array.isArray((data as any).insights) ? (data as any).insights : undefined
        };
        setProviderChatMessages(prev => [...prev, aiMessage as unknown as ProviderChatMessage]);
      }

      // Check for missed sheet update intent
      if (detectMissedSheetIntent(textToProcess, data.response || '')) {
        setMissedIntentSuggestion(`Did you want me to update your spreadsheet with this data? You said: "${textToProcess.slice(0, 50)}..."`);
        // Auto-clear the suggestion after 10 seconds
        setTimeout(() => setMissedIntentSuggestion(null), 10000);
      }

      // Handle tool results from automatic execution (skip noisy system message for file-only uploads)
      if (!(data as any).suppressResponseText && data.toolResults && data.toolResults.length > 0) {
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
        setProviderChatMessages(prev => [...prev, toolResultMessage as unknown as ProviderChatMessage]);
        // Surface failure details as a toast
        try {
          const failures = (data.toolResults as Array<{ success: boolean; result: string; details?: unknown }>).filter(tr => tr && tr.success === false);
          if (failures.length > 0) {
            const detailText = failures.map((f, i) => {
              const d = typeof f.details === 'string' ? f.details : (f.details ? JSON.stringify(f.details) : '');
              return `${i + 1}. ${f.result}${d ? `\n   Details: ${d}` : ''}`;
            }).join('\n');
            const msg = `Tool error: One or more actions failed.\n${detailText}`;
            setSendResult(msg);
            // Promote to toast
            setToast({ type: 'error', message: msg });
            setTimeout(() => setToast(null), 5000);
          }
        } catch { /* noop */ }
      }

      console.log(`🔍 [CHAT] Final state - uploadedImages: ${uploadedImages.length}, pendingToolCalls: ${pendingToolCalls.length}`);
      
      // Uploaded files already cleared from the input area upon send
      
      setSendResult("AI response added to chat above.");
      
    } catch (error) {
      console.error('Chat processing error:', error);
      
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setSendResult(`Error: ${errorMessage}`);
      
      // Add error message to chat
      const errorMessageObj = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `Error: ${errorMessage}`,
        timestamp: new Date()
      };
      setProviderChatMessages(prev => [...prev, errorMessageObj as unknown as ProviderChatMessage]);
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
    setProviderChatMessages(prev => [...prev, processingMessage as unknown as ProviderChatMessage]);
    
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
            sheetNames: selectedSheetNames,
            unstructuredSheets: selectedSheetNames.filter(n => (unstructuredOverrides[n] ?? (sheetStructureCache[n] ? !sheetStructureCache[n].isStructured : false))),
            fileAnalysis: isFileAnalysisFresh(recentFileAnalysis) ? recentFileAnalysis : undefined
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
      setProviderChatMessages(prev => prev.filter(msg => !(msg as any).isProcessing) as unknown as ProviderChatMessage[]);
      
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
      setProviderChatMessages(prev => [...prev, resultMessage as unknown as ProviderChatMessage]);

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
      setProviderChatMessages(prev => prev.filter(msg => !(msg as any).isProcessing) as unknown as ProviderChatMessage[]);
      
      // Remove the tool call from pendingToolCalls even on error
      console.log(`🔍 [EXECUTE_TOOL] Removing tool call ${toolCall.id} from pendingToolCalls after error`);
      setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
      
      const errorMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system' as const,
        content: `❌ Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setProviderChatMessages(prev => [...prev, errorMessage as unknown as ProviderChatMessage]);
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
    setProviderChatMessages([] as unknown as ProviderChatMessage[]);
    setPendingToolCalls([]);
    setSendResult("");
  };

  // Prefetch moved into provider to avoid reloading on new chats





  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      uploadedImages.forEach(img => {
        URL.revokeObjectURL(img.preview);
      });
    };
  }, [uploadedImages]);

  // Handle confirm for structured preview commits
  const handleConfirmPreview = async (preview: { headers: string[]; rows: Array<Array<{ column: string; value: unknown }>> }) => {
    try {
      if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
        setSendResult('Select a spreadsheet and sheet first.');
        return;
      }
      const rows = preview.rows.map((r) => {
        const obj: Record<string, unknown> = {};
        r.forEach(({ column, value }) => { obj[String(column)] = value; });
        return obj;
      });
      const toolCall = {
        id: `tool_${Date.now()}_apply_structured_rows_confirm`,
        type: 'function' as const,
        function: {
          name: 'apply_structured_rows',
          arguments: JSON.stringify({ rows, commit: true })
        }
      };
      const resp = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCall,
          context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames },
          images: []
        })
      });
      const data = await resp.json();
      if (resp.ok && data?.success) {
        setSendResult(data.message || data.result || 'Update applied.');
      } else {
        setSendResult(data?.error || data?.result || 'Apply failed');
      }
    } catch (e) {
      setSendResult('Apply failed');
    }
  };

  const openEditModal = (preview: { headers: string[]; rows: Array<Array<{ column: string; value: unknown }>>; message?: string }) => {
    try {
      const converted = (preview.rows || []).map((row, idx) => ({
        row: idx + 2,
        updates: row.reduce((acc, cur) => { acc[cur.column] = String(cur.value ?? ''); return acc; }, {} as Record<string, string>),
        confidence: 0.8
      }));
      setPreviewModal({ open: true, rows: converted, summary: preview.message || 'Review and confirm updates.' } as any);
    } catch {
      setPreviewModal({ open: true, rows: null });
    }
  };

  // Commit from a rendered table (headers:string[], rows:string[][])
  const handleCommitFromTable = async (headers: string[], tableRows: string[][], messageId?: string, tableIndex?: number) => {
    try {
      if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
        setSendResult('Select a spreadsheet and sheet first.');
        return;
      }
      const key = messageId != null && tableIndex != null ? `${messageId}_${tableIndex}_approve` : undefined;
      if (key) setTableActionState(prev => ({ ...prev, [key]: 'loading' }));
      
      // Handle Action column if present (for Proposed Sheet Updates tables)
      const hasActionColumn = headers[0] === 'Action';
      const effectiveHeaders = hasActionColumn ? headers.slice(1) : headers;
      const effectiveRows = hasActionColumn ? tableRows.map(r => r.slice(1)) : tableRows;
      
      const rows = effectiveRows.map((r) => {
        const obj: Record<string, unknown> = {};
        effectiveHeaders.forEach((h, i) => { obj[h] = r[i] ?? ''; });
        return obj;
      });
      const toolCall = {
        id: `tool_${Date.now()}_apply_structured_rows_confirm_table`,
        type: 'function' as const,
        function: { name: 'apply_structured_rows', arguments: JSON.stringify({ rows, commit: true }) }
      };
      const resp = await fetch('/api/genkit-tool-execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCall, context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames }, images: [] })
      });
      const data = await resp.json();
      if (resp.ok && data?.success) {
        setSendResult(data.message || data.result || 'Update applied.');
        
        // Mark the message as approved to hide the buttons
        if (messageId) {
          setProviderChatMessages(prev => prev.map((msg: any) => 
            msg.id === messageId ? { ...msg, approved: true } : msg
          ));
        }
        
        // Re-hydrate current sheet on success to reflect changes immediately
        try {
          const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
          if (defaultSpreadsheetId && activeSheet) {
            const dataRes = await fetch('/api/get-sheet-data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: activeSheet })
            });
            const json = await dataRes.json();
            if (json && json.data) setSheetDataCache((prev) => ({ ...prev, [activeSheet]: json.data }));
          }
        } catch {}
        if (key) setTableActionState(prev => ({ ...prev, [key]: 'done' }));
      } else {
        setSendResult(data?.error || data?.result || 'Apply failed');
        if (key) setTableActionState(prev => ({ ...prev, [key]: 'idle' }));
      }
    } catch {
      setSendResult('Apply failed');
      const key = messageId != null && tableIndex != null ? `${messageId}_${tableIndex}_approve` : undefined;
      if (key) setTableActionState(prev => ({ ...prev, [key]: 'idle' }));
    }
  };

  const openEditModalFromTable = (headers: string[], tableRows: string[][], message?: string) => {
    // Handle Action column if present (for Proposed Sheet Updates tables)
    const hasActionColumn = headers[0] === 'Action';
    const effectiveHeaders = hasActionColumn ? headers.slice(1) : headers;
    const effectiveRows = hasActionColumn ? tableRows.map(r => r.slice(1)) : tableRows;
    
    const rows = (effectiveRows || []).map((r) => effectiveHeaders.map((h, i) => ({ column: h, value: r[i] ?? '' })));
    openEditModal({ headers: effectiveHeaders, rows, message });
  };

  // Auto-scroll messages container to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [chatMessages, chatProcessing]);

  // Observe bottom bar height to prevent overlap and keep layout compact
  useEffect(() => {
    const element = bottomBarRef.current;
    if (!element || typeof window === 'undefined') return;

    const updateHeight = () => {
      setBottomBarHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    // ResizeObserver to react to content changes (chips, uploads, etc.)
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(element);

    // Also respond to window resizes
    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If logged in but on waitlist, show gated waitlist page
  if (user && !betaTester && betaWaitlist) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b0b0e] via-[#0c0c10] to-[#0a0a0d]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.12]" aria-hidden>
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-sky-500/30 blur-3xl rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-fuchsia-500/20 blur-3xl rounded-full" />
        </div>
        <div className="w-full max-w-2xl px-6">
          <div className="glass gloss rounded-2xl p-8 border border-white/10 shadow-2xl animate-fade-in-up text-white/90">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/10 rounded-xl p-2">
               <Image src="/logo.png" alt="Sheety AI" width={28} height={28} className="invert" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300">Sheety AI</h1>
                <p className="text-xs text-white/70">Private Beta</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${betaFull ? 'border-red-400/40 text-red-200 bg-red-500/10' : 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10'}`}>
                {betaFull ? 'Beta full' : `${spotsLeft} spots left`}
              </span>
              <span className="text-xs text-white/60">{betaCount}/{betaLimit}</span>
            </div>
            <p className="text-sm text-white/80 mb-6 leading-relaxed">
              Thanks for joining! Our first {betaLimit} seats are full. You're on the waitlist and will get access as soon as we open more spots. We'll notify you via email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-y-auto no-scrollbar bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="aurora">
            <span className="a1" />
            <span className="a2" />
            <span className="a3" />
          </div>
          <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        </div>

        {/* Top centered beta status */}
        <div className="relative">
          <div className="mx-auto max-w-6xl px-6 pt-14">
            <div className="flex items-center justify-center">
              <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-2xl border text-sm shadow-sm ${betaFull ? 'border-red-400/40 text-red-200 bg-red-500/10' : 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10'}`}>
                <span className="font-semibold">Private Beta</span>
                <span className="opacity-80">{betaFull ? 'Beta full' : `${spotsLeft} spots left`}</span>
                <span className="opacity-60 text-xs">{betaCount}/{betaLimit}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <section className="relative isolate">
          <div className="mx-auto max-w-6xl px-6 pt-20 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Hero copy */}
              <div>
                <h1 className="text-[38px] sm:text-6xl leading-tight font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white drop-shadow-[0_2px_16px_rgba(255,255,255,0.08)]">
                  Speak data. Sheety AI writes it to your Sheets.
                </h1>
                <p className="mt-4 text-white/90 leading-relaxed text-[15px]">
                  Turn voice or text into structured, validated spreadsheet updates. Fast, accurate, and built for mobile.
                </p>
                {/* CTA moved to the Get started card */}
                {/* Compact feature hints removed to reduce redundancy */}
              </div>
              {/* Login card (kept) */}
              <div className="w-full max-w-md mx-auto md:mx-0 tilt-hover relative z-30">
                  <div className="card-gradient relative z-[20000] pointer-events-auto">
                  <div className="glass gloss rounded-2xl p-6 border border-white/10 shadow-2xl animate-fade-in-up relative z-[20000] pointer-events-auto">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-white/10 rounded-xl p-2">
                      <Image src="/logo.png" alt="Sheety AI" width={28} height={28} className="invert" />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold tracking-tight">Get started</h2>
                      <p className="text-xs text-white/70">Private beta access</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/80 mb-6 leading-relaxed">
                    Sign in with Google to secure your spot. If we're full, you'll be added to the waitlist automatically.
                  </p>
                  {/* Primary CTAs */}
                  <div className="mt-4 flex flex-col items-center sm:flex-row sm:items-center justify-center gap-4 flex-wrap">
                    {!user && lastGoogle?.email && (
                      <button
                        type="button"
                        onClick={() => continueWithGoogle?.(lastGoogle.email)}
                        className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-gray-900 hover:bg-white/90 active:scale-[0.98] pointer-events-auto"
                      >
                        {lastGoogle?.photo ? (
                          <img
                            src={lastGoogle.photo}
                            alt={lastGoogle.name || lastGoogle.email || 'User'}
                            className="w-6 h-6 rounded-full border border-black/10"
                          />
                        ) : (
                          <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7h2a5 5 0 0 1 10 0h2c0-3.866-3.134-7-7-7z"/></svg>
                        )}
                        Continue as {lastGoogle.name || lastGoogle.email}
                      </button>
                    )}
                    <button
                      id="cta-join-beta"
                      type="button"
                      onClick={() => {
                        try { console.log('Join Beta clicked'); } catch {}
                        try {
                          if (user) {
                            // Already signed in; stay on home and show app
                            return;
                          } else {
                            try { setJoining(true); } catch {}
                            void continueWithGoogle?.();
                          }
                        } catch (e) { try { console.error('Join Beta error', e); } catch {} }
                      }}
                      disabled={joining}
                      className={`relative z-[10000] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 border border-emerald-300/30 pointer-events-auto ${joining ? 'bg-emerald-700/60 text-white/80 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98]'}`}
                      aria-label={user ? 'Open App' : 'Join Beta'}
                    >
                      {joining ? (
                        <>
                          <span className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                          <span>{user ? 'Opening…' : 'Redirecting…'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          <span>{user ? 'Open App' : 'Join Beta'}</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  {authError && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                      <p className="font-medium">Authentication Error</p>
                      <p className="mt-1">{authError}</p>
                    </div>
                  )}
                  {/* Redundant badges removed to keep the card clean */}
                </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative">
          <div className="mx-auto max-w-6xl px-6 pb-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10 tilt-hover">
                <div className="text-lg float-slow">🎤</div>
                <h3 className="mt-2 font-semibold">Speak or type</h3>
                <p className="mt-1 text-sm text-white/70">Capture updates quickly with voice or text on any device.</p>
              </div>
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10 tilt-hover">
                <div className="text-lg float-slow">🤖</div>
                <h3 className="mt-2 font-semibold">AI structures it</h3>
                <p className="mt-1 text-sm text-white/70">We validate, map fields, and prepare the right cells automatically.</p>
              </div>
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10 tilt-hover">
                <div className="text-lg float-slow">📊</div>
                <h3 className="mt-2 font-semibold">Written to Sheets</h3>
                <p className="mt-1 text-sm text-white/70">Approve and commit updates to your Google Sheets in seconds.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Sheety AI */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-6 pb-14">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10">
                <div className="text-sm text-white/70">Accuracy</div>
                <p className="mt-2 text-[13px] text-white/80">Field-aware mapping reduces mistakes and rework.</p>
              </div>
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10">
                <div className="text-sm text-white/70">Speed</div>
                <p className="mt-2 text-[13px] text-white/80">From idea to committed rows in seconds.</p>
              </div>
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10">
                <div className="text-sm text-white/70">Mobile-first</div>
                <p className="mt-2 text-[13px] text-white/80">Optimized for on-the-go updates and quick approvals.</p>
              </div>
              <div className="glass-soft card-gradient rounded-2xl p-5 border border-white/10">
                <div className="text-sm text-white/70">Private</div>
                <p className="mt-2 text-[13px] text-white/80">Google sign-in and explicit approvals before writes.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 pb-10 text-center text-xs text-white/50">
          <span>
            © {new Date().getFullYear()} Sheety AI — Private beta
          </span>
          <span className="mx-2">•</span>
          <a href="/privacy" className="underline hover:text-white">Privacy Policy</a>
          <span className="mx-1">·</span>
          <a href="/terms" className="underline hover:text-white">Terms of Service</a>
          <span className="mx-1">·</span>
          <a href="/feedback" className="underline hover:text-white">Contact</a>
        </footer>
      </div>
    );
  }

  return (
    <>
      <PWAInstaller />
      <div className="min-h-screen w-full bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] p-0 overflow-hidden">
        <div className="w-full max-w-none mx-0 space-y-6 sm:space-y-8 pb-0 sm:pb-0 pt-0">
          {/* Show loading state while spreadsheets are being fetched */}
          {spreadsheetsLoading && (
            <div className="mx-3 sm:mx-4 mt-4 mb-2 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                <span className="text-sm">Loading your spreadsheets...</span>
              </div>
            </div>
          )}
          
          {/* Only show a lightweight nudge if no spreadsheet is selected, onboarding is not showing, and spreadsheets have finished loading */}
          {chatMessages.length === 0 && !defaultSpreadsheetId && !showOnboarding && !spreadsheetsLoading && (
            <div className="mx-3 sm:mx-4 mt-4 mb-2 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
              <p className="text-sm mb-2">No spreadsheet connected yet.</p>
              <p className="text-xs opacity-80 mb-3">Paste a Google Sheets URL or ID to connect, then you can select sheets and start updating.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={newSheetId}
                  onChange={(e) => setNewSheetId(e.target.value)}
                  placeholder="Paste full Google Sheets URL or ID"
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-white/50 focus:outline-none"
                />
                <button
                  onClick={handleAddSpreadsheet}
                  disabled={addingSheet || !newSheetId.trim()}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                >
                  {addingSheet ? 'Adding…' : 'Add spreadsheet'}
                </button>
                <a
                  href={process.env.NEXT_PUBLIC_SHEETS_LINK || 'https://sheets.google.com'}
                  target="_blank"
                  className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white"
                >
                  Open Google Sheets
                </a>
              </div>
              {serviceAccountEmail && (
                <div className="mt-3 text-[12px] text-white/80 bg-black/20 border border-white/10 rounded-lg p-2 flex items-center justify-between gap-2">
                  <span>Make sure to share this spreadsheet with the service account as Editor:</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-white/90 text-[11px] select-all">{serviceAccountEmail}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(serviceAccountEmail)}
                      className="px-2 py-1 rounded bg-white/10 border border-white/10 text-white/90 text-[11px] hover:bg-white/20"
                      title="Copy service account email"
                      aria-label="Copy service account email"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {showOnboarding && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={dismissOnboarding} aria-hidden />
              <div className="relative w-[92%] max-w-lg rounded-2xl border border-white/10 glass-soft shadow-2xl bg-black/60">
                <div className="px-5 py-4 border-b border-white/10">
                  <div className="text-base font-semibold text-white/90">Get set up</div>
                  <div className="text-xs text-white/70">Step {onboardingStep} of 3</div>
                </div>
                <div className="px-5 py-4 text-sm text-white/90">
                  {onboardingStep === 1 && (
                    <div className="space-y-3">
                      <div className="text-white/90 font-medium">Add your first spreadsheet</div>
                      <div className="text-white/70 text-sm">Paste a Google Sheets URL or ID. We'll use it for updates.</div>
                      <div className="flex gap-2">
                        <input
                          value={newSheetId}
                          onChange={(e) => setNewSheetId(e.target.value)}
                          placeholder="Paste full Google Sheets URL or ID"
                          className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-white/50 focus:outline-none"
                        />
                        <button
                          onClick={handleAddSpreadsheet}
                          disabled={addingSheet || !newSheetId.trim()}
                          className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {addingSheet ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                      <div className="text-xs text-white/60">Need a new sheet? <a className="underline" href={process.env.NEXT_PUBLIC_SHEETS_LINK || 'https://sheets.google.com'} target="_blank">Open Google Sheets</a></div>
                    </div>
                  )}
                  {onboardingStep === 2 && (
                    <div className="space-y-3">
                      <div className="text-white/90 font-medium">Share access</div>
                      <div className="text-white/70 text-sm">Share your spreadsheet with the service account as Editor.</div>
                      {serviceAccountEmail ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-white/90 text-[11px] select-all">{serviceAccountEmail}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(serviceAccountEmail)}
                            className="px-2 py-1 rounded bg-white/10 border border-white/10 text-white/90 text-[11px] hover:bg-white/20"
                          >
                            Copy
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-white/60">Fetching service account…</div>
                      )}
                    </div>
                  )}
                  {onboardingStep === 3 && (
                    <div className="space-y-3">
                      <div className="text-white/90 font-medium">Select sheets</div>
                      <div className="text-white/70 text-sm">Use the chips above the input bar to pick which sheets you want to update.</div>
                      <div className="text-white/70 text-sm">Then send a message or speak to start updating.</div>
                    </div>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-white/10 bg-black/30 rounded-b-2xl flex items-center justify-between">
                  <button
                    onClick={dismissOnboarding}
                    className="px-3 py-1.5 rounded-lg text-xs border border-white/15 text-white/80 hover:bg-white/10"
                  >
                    Skip for now
                  </button>
                  <div className="flex items-center gap-2">
                    {onboardingStep > 1 && (
                      <button
                        onClick={() => setOnboardingStep((s) => (s === 2 ? 1 : 2))}
                        className="px-3 py-1.5 rounded-lg text-xs border border-white/15 text-white/80 hover:bg-white/10"
                      >
                        Back
                      </button>
                    )}
                    {onboardingStep < 3 && (
                      <button
                        onClick={() => setOnboardingStep((s) => (s === 1 ? 2 : 3))}
                        className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={onboardingStep === 1 && !defaultSpreadsheetId}
                        title={onboardingStep === 1 && !defaultSpreadsheetId ? 'Add a spreadsheet to continue' : ''}
                      >
                        Next
                      </button>
                    )}
                    {onboardingStep === 3 && (
                      <button
                        onClick={completeOnboarding}
                        className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Finish
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full chat history area */}
          <div
            ref={messagesContainerRef}
            className="px-3 sm:px-4 pt-2 overflow-y-auto"
            style={{ height: 'calc(100vh - 120px)', paddingBottom: bottomBarHeight + 16, paddingTop: 8 }}
          >
            <div className="space-y-3">
              {chatMessages.map((message, idx) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={
                      `max-w-[85%] px-3 py-2 rounded-2xl text-sm ` +
                      (message.role === 'user'
                        ? 'matte-emerald text-white shadow'
                        : message.role === 'system'
                        ? 'text-white/70 italic'
                        : 'text-white/90')
                    }
                  >
                    <div className="flex items-center gap-2 mb-1 opacity-70">
                      <span className={`${getMessageTypeColor(message.messageType)} text-[11px]`}>{getMessageTypeIcon(message.messageType)}</span>
                      <span className="text-[11px]">{message.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                    {/* Column options as clickable chips */}
                    {message.role === 'assistant' && (() => {
                      const columnOptions = extractColumnOptions(message.content);
                      if (columnOptions.length === 0) return null;
                      
                      return (
                        <div className="mt-3">
                          <div className="text-xs text-white/70 mb-2">Select a column:</div>
                          <div className="flex flex-wrap gap-2">
                            {columnOptions.map((option, optionIdx) => (
                              <button
                                key={optionIdx}
                                onClick={() => {
                                  const synth: ChatMessage = {
                                    id: `msg_${Date.now()}_column_select`,
                                    role: 'user',
                                    content: `Use column: ${option}`,
                                    timestamp: new Date(),
                                  } as any;
                                  setProviderChatMessages(prev => [...prev, synth as unknown as ProviderChatMessage]);
                                }}
                                className="px-3 py-1.5 rounded-full text-xs border border-sky-400/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 hover:border-sky-400/60 transition-all duration-200"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Column chooser for aggregate clarification */}
                    {message.role === 'assistant' && /Which column contains the sales amounts\?/i.test(message.content) && (
                      <div className="mt-2">
                        {(() => {
                          try {
                            // Pull headers from last fetched sheet in cache
                            const sheetNames = selectedSheetNames && selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(sheetDataCache || {});
                            const first = sheetNames && sheetNames.length > 0 ? sheetNames[0] : undefined;
                            const table = first ? sheetDataCache[first] : undefined;
                            const headers = Array.isArray(table) && table.length > 0 ? (table[0] as string[]) : [];
                            if (!headers || headers.length === 0) return null;
                            return (
                              <ColumnChooser
                                headers={headers}
                                title="Pick a column"
                                onSelect={(header) => {
                                  const h = (header || '').trim();
                                  if (!h) return;
                                  const synth: ChatMessage = {
                                    id: `msg_${Date.now()}_column_select`,
                                    role: 'user',
                                    content: `Use column: ${h}`,
                                    timestamp: new Date(),
                                  } as any;
                                  setProviderChatMessages(prev => [...prev, synth as unknown as ProviderChatMessage]);
                                }}
                              />
                            );
                          } catch { return null; }
                        })()}
                      </div>
                    )}

                    {/* Render user attachments inside the bubble, WhatsApp-style */}
                    {message.role === 'user' && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {message.attachments.map(att => (
                          <div key={att.id} className="relative overflow-hidden rounded-lg border border-white/20 bg-black/20">
                            {att.fileType === 'image' && att.preview ? (
                              // Use img for object URLs to avoid Next Image domain issues
                              <img src={att.preview} alt={att.name} className="block w-full h-24 object-cover" />
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                                <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="truncate">{att.name}</span>
                              </div>
                            )}
                            {/* Sending indicator on the most recent user message while processing */}
                            {idx === chatMessages.length - 1 && chatProcessing && (
                              <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
                                <span className="inline-flex items-center gap-2 text-xs text-white/90">
                                  <span className="inline-block w-3 h-3 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                                  Sending…
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                     {/* Render assistant data tables as rich tables (includes proposed update previews) */}
                    {message.role === 'assistant' && Array.isArray(message.tables) && message.tables.length > 0 && (
                      <div className="mt-2 space-y-3">
                        {/* Tiny toggle: if a combined table exists, allow switching view */}
                        {message.tables.some(t => (t as any).meta?.combined) && (
                          <div className="flex items-center justify-end mb-1">
                            <button
                              className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 inline-flex items-center gap-1"
                              onClick={() => setCombinedTablePref(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                              title={combinedTablePref[message.id] ? 'Show separate tables' : 'Show combined table'}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                              </svg>
                              <span>{combinedTablePref[message.id] ? 'Combined view' : 'Split view'}</span>
                            </button>
                          </div>
                        )}

                        {(combinedTablePref[message.id]
                          ? message.tables.filter(t => (t as any).meta?.combined)
                          : message.tables.filter(t => !(t as any).meta?.combined)
                        ).map((t, tIdx) => (
                          <div key={`${message.id}_table_${tIdx}`} className="relative overflow-x-auto max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
                            {t.title && (
                              <div className="px-3 py-2 border-b border-white/10 text-[12px] font-semibold text-white/90">
                                {t.title}
                              </div>
                            )}
                            {t.summary && (
                              <div className="px-3 pt-2 text-[12px] text-white/80">{t.summary}</div>
                            )}
                            <table className="min-w-full text-[12px]">
                              <thead className="bg-sky-500/10">
                                <tr>
                                  {t.headers.map((h, hIdx) => (
                                    <th key={hIdx} className="px-3 py-2 text-left font-semibold text-sky-200 whitespace-nowrap border-b border-white/10">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {t.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.03]'}>
                                    {row.map((cell, cIdx) => {
                                      // Check if this is a Proposed Sheet Updates table with Action column
                                      const isProposedUpdates = t.title && /Proposed Sheet Updates/i.test(String(t.title));
                                      const isActionColumn = cIdx === 0 && isProposedUpdates;
                                      const isUpdateRow = isProposedUpdates && row[0] === 'Update';
                                      
                                      // Style Action column differently
                                      if (isActionColumn) {
                                        return (
                                          <td key={cIdx} className="px-3 py-2 text-white/90 font-semibold border-b border-white/10">
                                            <span className={`px-2 py-1 rounded text-[10px] ${isUpdateRow ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30' : 'bg-green-500/20 text-green-200 border border-green-500/30'}`}>
                                              {String(cell)}
                                            </span>
                                          </td>
                                        );
                                      }
                                      
                                      // Highlight updated cells in Update rows (make them bold)
                                      const shouldHighlight = isUpdateRow && isProposedUpdates && cIdx > 0;
                                      
                                      return (
                                        <td key={cIdx} className={`px-3 py-2 text-white/90 ${t.headers.length === 1 ? 'whitespace-pre-wrap break-words' : 'whitespace-nowrap'} border-b border-white/10 ${shouldHighlight ? 'font-bold' : ''}`}>
                                          {String(cell)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                              {Array.isArray(t.footer) && t.footer.length > 0 && (
                                <tfoot>
                                  <tr className="bg-white/[0.04]">
                                    {t.footer.map((cell, fIdx) => (
                                      <td key={fIdx} className="px-3 py-2 text-white/95 font-semibold border-t border-white/10">
                                        {String(cell)}
                                       </td>)
                                    )}
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                            {/* Sticky quick action bar (always visible while scrolling) */}
                            <div className="sticky bottom-0 right-0 w-full">
                              <div className="pointer-events-none bg-gradient-to-t from-black/40 to-transparent px-2 pt-6 pb-2">
                                    <div className="pointer-events-auto flex items-center justify-end gap-2">
                                      {/* Show Approve/Reject/Edit buttons for both proposed updates AND extracted data tables, but only if not approved */}
                                      {!message.approved && ((t.title && /Proposed Sheet Updates/i.test(String(t.title))) || ((t as any).meta?.fileIndex || (t as any).meta?.combined)) ? (
                                        <>
                                          <button
                                            className="bg-green-500 text-white px-4 py-2 mr-2 rounded inline-flex items-center gap-2"
                                            onClick={() => handleCommitFromTable(t.headers, t.rows, message.id, tIdx)}
                                            disabled={tableActionState[`${message.id}_${tIdx}_approve`] === 'loading'}
                                          >
                                            {tableActionState[`${message.id}_${tIdx}_approve`] === 'loading' ? (
                                              <span className="inline-block w-3 h-3 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                                            ) : null}
                                            <span>{tableActionState[`${message.id}_${tIdx}_approve`] === 'loading' ? 'Applying...' : 'Approve'}</span>
                                          </button>
                                          <button className="bg-red-500 text-white px-4 py-2 mr-2 rounded" onClick={() => setSendResult('Update canceled.')}>Reject</button>
                                          <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={() => openEditModalFromTable(t.headers, t.rows, t.summary)}>Edit</button>
                                        </>
                                      ) : message.approved && (t.title && /Proposed Sheet Updates/i.test(String(t.title))) ? (
                                        /* Show approved status for approved updates */
                                        <div className="text-green-400 text-sm font-medium px-3 py-2">
                                          ✓ Approved and applied
                                        </div>
                                      ) : (
                                        /* No buttons for existing sheet data tables */
                                        null
                                      )}
                                    </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Render assistant charts inline */}
                    {message.role === 'assistant' && Array.isArray(message.charts) && message.charts.length > 0 && (
                      <div className="mt-2 space-y-3">
                        {message.charts.map((chart, cIdx) => (
                          <motion.div
                            key={`${message.id}_chart_${cIdx}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: cIdx * 0.1 }}
                            className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            {chart.title && (
                              <div className="mb-2 text-[12px] font-semibold text-white/90">
                                {chart.title}
                              </div>
                            )}
                            <ChartRenderer spec={chart} />
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* Insights toggle and render */}
                    {message.role === 'assistant' && Array.isArray(message.insights) && message.insights.length > 0 && (
                      <div className="mt-2">
                        <button
                          className="ml-2 text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
                          onClick={() => setShowStats(prev => !prev)}
                        >
                          {showStats ? 'Hide stats' : 'Show stats'}
                        </button>
                        {showStats && (
                          <ul className="mt-2 text-[12px] text-white/90 list-disc pl-5 space-y-1">
                            {message.insights.map((it, i) => (
                              <li key={`${message.id}_ins_${i}`}>{it}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {message.role === 'assistant' && Array.isArray(message.sheetsUsed) && message.sheetsUsed.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.sheetsUsed.map((name) => (
                          <span
                            key={name}
                            className="px-2 py-0.5 rounded-full text-[10px] border border-sky-400/40 text-sky-200 bg-sky-500/10 inline-flex items-center gap-1"
                            title={name}
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                            <span className="truncate max-w-[120px]">{name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatProcessing && (
                <div className="flex justify-start">
                  <div className="text-white/80 px-3 py-2 rounded-2xl text-sm">AI is thinking...</div>
                </div>
              )}
            </div>
          </div>

          {/* Docked input bar pinned to bottom of viewport with stacked chat list above chips/input */}
          <div
            ref={bottomBarRef}
            className="fixed bottom-0 right-0 z-50 w-auto overflow-visible px-3 sm:px-4"
            style={{ left: 'var(--sidebar-width, 300px)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div
              className={`relative w-full ${dragOver ? 'ring-2 ring-sky-400 rounded-2xl' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                const dtFiles = e.dataTransfer?.files;
                if (dtFiles && dtFiles.length > 0) {
                  await handleFiles(dtFiles);
                }
              }}
            >
              <div className="w-full mb-2">
                <div className="relative rounded-2xl glass-soft border border-white/10 focus-within:ring-0 transition-all duration-200 overflow-visible">
                  {defaultSpreadsheetId && (
                    <div className="px-2 pt-2 pb-1 border-b border-white/10 bg-black/20 rounded-t-2xl">
                      <SheetChipSelector />
                    </div>
                  )}
                  {uploadedImages.length > 0 && (
                    <div className="p-2 border-b border-white/10">
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const progress = getFileSizeProgress();
                          return uploadedImages.map((image, index) => {
                            const fileInfo = progress.fileSizes[index];
                            const isLarge = fileInfo.percentage > 80;
                            const isOverLimit = fileInfo.percentage > 100;
                            return (
                              <div key={image.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs border ${
                                isOverLimit ? 'bg-red-500/10 border-red-400/30 text-red-300' :
                                isLarge ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-200' :
                                'bg-sky-500/10 border-sky-400/30 text-sky-200'
                              }`}>
                                {image.fileType === 'image' ? (
                                  <svg className="w-3.5 h-3.5 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium truncate max-w-[110px]">
                                    {image.file.name}
                                  </span>
                                  <span className="text-[10px]">
                                    {fileInfo.sizeMB}MB ({fileInfo.percentage.toFixed(0)}% of limit)
                                  </span>
                                </div>
                                <button
                                  onClick={() => { URL.revokeObjectURL(image.preview); setUploadedImages(prev => prev.filter(img => img.id !== image.id)); }}
                                  className="ml-1 text-white/40 hover:text-white/80"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          <div className="mt-1 px-2 py-1 rounded-lg text-[11px] bg-black/20 border border-white/10">
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
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          // Include any active transcript snippets before sending
                          const voiceSuffix = listening ? (transcript + interimText) : '';
                          const toSend = (editingText + (voiceSuffix ? ` ${voiceSuffix}` : '')).trim();
                          if (toSend || uploadedImages.length > 0) {
                            processWithAIChat(toSend);
                            setEditingText('');
                            // Clear voice buffers if we consumed them
                            if (voiceSuffix) { setTranscript(""); setInterimText(""); }
                          }
                        }
                      }}
                      placeholder={uploadedImages.length > 0 
                        ? `Add context about your ${uploadedImages.length} attached file${uploadedImages.length !== 1 ? 's' : ''} or press Enter to analyze...`
                        : getSmartPlaceholder(uploadedImages, defaultSpreadsheetId, selectedSheetNames && selectedSheetNames.length > 0 ? selectedSheetNames[0] : null)
                      }
                      rows={2}
                      className={`w-full p-3 pr-20 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-white/50 text-white ${
                        listening ? 'border-l-4 border-l-sky-500' : ''
                      }`}
                      style={{
                        color: listening && (transcript || interimText) ? '#e5e7eb' : 'inherit',
                        backgroundColor: listening ? 'rgba(56, 189, 248, 0.06)' : 'transparent'
                      }}
                    />

                    <div className="absolute right-2 bottom-2 flex items-center gap-3">
                      {listening && (transcript || interimText) && (
                        <button
                          onClick={() => { setTranscript(""); setInterimText(""); }}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
                          title="Clear voice input"
                          aria-label="Clear voice input"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="6" y1="6" x2="18" y2="18" />
                            <line x1="18" y1="6" x2="6" y2="18" />
                          </svg>
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" onChange={handleImageUpload} className="hidden" id="text-area-upload" />
                        <label
                          htmlFor="text-area-upload"
                          className={`w-11 h-11 rounded-full flex items-center justify-center transition duration-200 cursor-pointer ${
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

                        {/* Quick add button removed from input area; use per-table action in chat */}
                      </div>

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
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
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
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m0 0H9m3 0h3" />
                          </svg>
                        )}
                      </button>

                      {(editingText.trim() || (listening && (transcript || interimText)) || uploadedImages.length > 0) && (
                        <button
                          onClick={() => {
                            const voiceSuffix = listening ? (transcript + interimText) : '';
                            const toSend = (editingText + (voiceSuffix ? ` ${voiceSuffix}` : '')).trim();
                            processWithAIChat(toSend);
                            setEditingText('');
                            if (voiceSuffix) { setTranscript(""); setInterimText(""); }
                          }}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 shadow"
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
                    {/* Increase right padding of textarea to make room for bigger controls */}
                    <style jsx>{`
                      textarea { padding-right: 5.5rem; }
                      @media (min-width: 640px) { textarea { padding-right: 6rem; } }
                    `}</style>
                  </div>
                </div>
              </div>

              {toast && (
                <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-md shadow-lg border ${toast.type === 'error' ? 'bg-red-600/90 border-red-400/50 text-white' : 'bg-emerald-600/90 border-emerald-400/50 text-white'}`} role="status" aria-live="polite">
                  {toast.message}
                </div>
              )}

              {sendResult && (
                <div className="text-xs sm:text-sm text-center text-white/80 px-4">
                  {sendResult}
                </div>
              )}
            </div>
          </div>

          {/* Preview Modal */}
          {previewModal.open && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
              <div className="w-[90vw] max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] text-white shadow-2xl">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="text-sm font-semibold">Preview updates</div>
                  <button className="text-white/60 hover:text-white" onClick={() => setPreviewModal({ open: false, rows: null })} aria-label="Close preview">✕</button>
                </div>
                <div className="p-4 overflow-auto" style={{ maxHeight: '65vh' }}>
                  {previewModal.summary && (
                    <div className="mb-3 text-[12px] text-white/80">{previewModal.summary}</div>
                  )}
                  {Array.isArray(previewModal.rows) && previewModal.rows.length > 0 ? (
                    <table className="min-w-full text-[12px]">
                      {/* Removed confidence UI for simplicity; focus on exact previews. */}
                      <thead>
                        <tr className="bg-white/5">
                          <th className="px-3 py-2 text-left">Row</th>
                          <th className="px-3 py-2 text-left">Updates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewModal.rows.map((r, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.03]'}>
                            <td className="px-3 py-2">{r.row}</td>
                            <td className="px-3 py-2">
                              <div className="space-y-1">
                                {Object.entries(r.updates).map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-2"><span className="text-white/60">{k}:</span> <span className="text-white/90">{String(v)}</span></div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-white/70 text-sm">No changes detected.</div>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                  <button className="px-3 py-1.5 rounded-md border border-white/15 text-[12px]" onClick={() => setPreviewModal({ open: false, rows: null })}>Close</button>
                  <button className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-[12px]" onClick={async () => {
                    if (!defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0) {
                      setSendResult('Select a spreadsheet and sheet first.');
                      return;
                    }
                    setChatProcessing(true);
                    try {
                      const toolCall = {
                        id: `tool_${Date.now()}_apply_direct`,
                        type: 'function' as const,
                        function: { name: 'update_sheet', arguments: JSON.stringify({
                          transcript: editingText || transcript || 'Apply updates',
                          preview: false,
                          forceCommit: true
                        }) }
                      };
                      const resp = await fetch('/api/genkit-tool-execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ toolCall, context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames }, images: [] })
                      });
                      const data = await resp.json();
                      if (resp.ok && data?.success) {
                        setSendResult(data.result || 'Applied updates');
                        setPreviewModal({ open: false, rows: null });
                      } else {
                        setSendResult(data?.error || data?.result || 'Apply failed');
                      }
                    } catch (e) {
                      setSendResult('Apply failed');
                    } finally {
                      setChatProcessing(false);
                    }
                  }}>Apply changes</button>
                </div>
                      </div>
                      {/* Quick Add to selected sheet */}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                        <div className="text-white/70">{uploadedImages.length} file{uploadedImages.length !== 1 ? 's' : ''} ready</div>
                        <button
                          disabled={quickAddLoading || !defaultSpreadsheetId || !selectedSheetNames || selectedSheetNames.length === 0}
                          onClick={performQuickAdd}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${quickAddLoading ? 'bg-white/10 text-white/60' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400/40'}`}
                          title="Extract and add data from these files to the selected sheet"
                        >
                          {quickAddLoading ? (
                            <>
                              <span className="inline-block w-3 h-3 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                              Adding…
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M6 20h12" />
                              </svg>
                              Add to selected sheet
                            </>
                          )}
                        </button>
                      </div>
            </div>
          )}

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
    case 'voice': return 'text-emerald-700';
    case 'text': return 'text-emerald-700';
    case 'sheet_update': return 'text-green-600';
    case 'tool_execution': return 'text-orange-600';
    case 'ai_response': return 'text-gray-600';
    default: return 'text-emerald-700';
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



// Add this function near the top of the component, after the state declarations
const extractColumnOptions = (content: string): string[] => {
  const optionsMatch = content.match(/Options include:\s*'([^']+)'(?:,\s*'([^']+)')*(?:,\s*and\s*'([^']+)')?/i);
  if (!optionsMatch) return [];
  
  // Extract all quoted strings after "Options include:"
  const quotedStrings = content.match(/'([^']+)'/g);
  if (!quotedStrings) return [];
  
  return quotedStrings.map(str => str.replace(/'/g, ''));
};