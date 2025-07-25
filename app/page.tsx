"use client";
import React, { useState, useRef, useEffect } from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { db } from "./providers/FirebaseProvider";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
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
import NavBar from './NavBar';
import Image from 'next/image';

// Types
interface Option {
  id: string;
  label: string; // Spreadsheet label or user-friendly name
  spreadsheetId: string;
  sheetNames: string[];
}

// Add minimal interfaces for SpeechRecognition and SpeechRecognitionEvent
interface MinimalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: MinimalSpeechRecognitionEvent) => void;
  onerror: () => void;
  onend: () => void;
}
interface MinimalSpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
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

// Add type for stepper field
interface StepperField {
  column: string;
  cell: string;
  value?: string;
}

// Add activity tracking state
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
  const { user, loading, signInWithGoogle } = useFirebase();
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const listeningRef = useRef(listening);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [geminiApiKeySaved, setGeminiApiKeySaved] = useState<boolean>(false);
  
  const [flowStep, setFlowStep] = useState(0); // 0: input, 1: sheet, 2: webhook
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [selectedSheetName, setSelectedSheetName] = useState<string>("");
  const [defaultSpreadsheetId, setDefaultSpreadsheetId] = useState<string>("");
  // Add state for text input at the top of the Home component
  const [textInputValue, setTextInputValue] = useState("");
  // Add state for AI APIs (replaces webhooks)
  const [aiApis, setAiApis] = useState<{ id: string; url: string; name: string }[]>([]);
  const [newAiApiUrl, setNewAiApiUrl] = useState("");
  const [newAiApiName, setNewAiApiName] = useState("");
  const [selectedAiApi, setSelectedAiApi] = useState<string>("gemini");
  const [sheetData, setSheetData] = useState<(string | number)[][]>([]);

  // Default Gemini API (non-removable)
  const GEMINI_API = {
    id: "gemini",
    url: "/api/parse-and-fill",
    name: "Google Gemini (default)"
  };

  // All useEffect and other hooks remain here, before any return
  useEffect(() => {
    if (!user) return;
    const optionsRef = collection(db, "users", user.uid, "options");
    const aiApisRef = collection(db, "users", user.uid, "aiApis");
    const userDocRef = doc(db, "users", user.uid);

    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Option));
    });
    const unsubAiApis = onSnapshot(aiApisRef, (snapshot) => {
      setAiApis(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as { id: string; url: string; name: string }));
    });
    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
      }
    });

    return () => {
      unsubOptions();
      unsubAiApis();
      unsubUserDoc();
    };
  }, [user]);

  const saveGeminiApiKey = async () => {
    if (!user || !geminiApiKey.trim()) return;
    try {
      await setDoc(doc(db, "users", user.uid), { geminiApiKey: geminiApiKey.trim() }, { merge: true });
      setGeminiApiKeySaved(true);
      setTimeout(() => setGeminiApiKeySaved(false), 3000);
    } catch (e) {
      console.error("Error saving Gemini API key:", e);
    }
  };

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  // When a spreadsheet and a sheet are selected, advance to the voice-to-text section
  useEffect(() => {
    if (flowStep === 0 && defaultSpreadsheetId && selectedSheetName) {
      setFlowStep(1);
    }
  }, [flowStep, defaultSpreadsheetId, selectedSheetName]);

  // Fetch sheet data when spreadsheet and sheet are selected
  useEffect(() => {
    if (!defaultSpreadsheetId || !selectedSheetName) return;
    (async () => {
      try {
        const res = await fetch('/api/get-sheet-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: selectedSheetName }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setSheetData(data || []);
        } else {
          setSheetData([]);
        }
      } catch {
        setSheetData([]);
      }
    })();
  }, [defaultSpreadsheetId, selectedSheetName]);

  const startListening = (clearTranscript = true) => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return alert("Speech recognition not supported in this browser.");
    // Play beep when starting to record
    playBeep();
    // Create a new instance every time
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: MinimalSpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = transcript; // Use current transcript as base
      for (const [, result] of Object.entries(event.results)) {
        const transcriptPiece = result[0].transcript;
        if ((result as { isFinal?: boolean }).isFinal) {
          finalTranscript += transcriptPiece;
        } else {
          interimTranscript += transcriptPiece;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
    };
    recognition.onerror = () => setListening(false);
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
    if (clearTranscript) setTranscript("");
    setListening(true);
    setPaused(false);
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {}; // Prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const pauseListening = () => {
    setPaused(true);
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

  // Option management
  const addOption = async () => {
    console.log('addOption called');
    if (!newOption.trim() || !user) {
      console.log('addOption: missing newOption or user');
      return;
    }
    // newOption is expected to be the spreadsheetId
    // Call backend to fetch sheet names and spreadsheet title
    console.log('addOption: fetching /api/get-sheet-names', newOption.trim());
    const res = await fetch('/api/get-sheet-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: newOption.trim() }),
    });
    console.log('addOption: fetch response', res.status);
    if (!res.ok) {
      setActivityError('Failed to fetch sheet names. Make sure the spreadsheet is shared with the service account.');
      console.log('addOption: fetch failed');
      return;
    }
    const { sheetNames, spreadsheetTitle } = await res.json();
    console.log('addOption: fetched sheetNames', sheetNames, 'spreadsheetTitle', spreadsheetTitle);
    // Store spreadsheetId and sheetNames in Option, use spreadsheetTitle as label
    await addDoc(collection(db, 'users', user.uid, 'options'), {
      label: spreadsheetTitle || newOption.trim(),
      spreadsheetId: newOption.trim(),
      sheetNames,
    });
    console.log('addOption: added to Firestore');
    await addActivity({ type: 'add', entity: 'sheet', label: spreadsheetTitle || newOption.trim(), timestamp: Date.now() });
    setNewOption("");
  };
  const deleteOption = async (id: string) => {
    if (!user) return;
    const label = options.find(o => o.id === id)?.label || '';
    await deleteDoc(doc(db, "users", user.uid, "options", id));
    await addActivity({ type: 'delete', entity: 'sheet', label, timestamp: Date.now() });
    if (selectedOption === id) setSelectedOption("");
  };
  const editOption = async (id: string, label: string) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "options", id), { label });
    await addActivity({ type: 'edit', entity: 'sheet', label, timestamp: Date.now() });
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

  // When a spreadsheet is selected, set it as default
  const handleSelectSpreadsheet = (spreadsheetId: string) => {
    setDefaultSpreadsheetId(spreadsheetId);
    setSelectedOption(spreadsheetId);
    setSelectedSheetName("");
  };

  // Helper to build stepper fields for all columns
  function buildStepperFieldsForAllColumns(aiFields: StepperField[] = [], sheetData: (string | number)[][] = []): StepperField[] {
    if (!sheetData || sheetData.length === 0) return [];
    const headers: string[] = sheetData[0].map(String);
    // Map AI suggestions by exact column name for easy lookup
    const aiMap: { [col: string]: StepperField } = {};
    aiFields.forEach((f: StepperField) => {
      if (f.column) aiMap[f.column] = f;
    });
    // Find the next available row number
    const nextRowNum = sheetData.length + 1;
    return headers.map((header: string, idx: number) => {
      const aiField = aiMap[header];
      return {
        column: header,
        cell: aiField?.cell || `${String.fromCharCode(65 + idx)}${nextRowNum}`,
        value: aiField && typeof aiField.value !== 'undefined' ? aiField.value : '',
      };
    });
  }

  // Send to selected AI API
  const saveToSheet = async () => {
    if (!user || !defaultSpreadsheetId || !selectedSheetName || Object.keys(stepperValues).length === 0) {
      setFinalSubmitStatus('error');
      return;
    }
    setFinalSubmitStatus('sending');
    try {
      // Prepare updates array: [{ cell, value }]
      const updates = stepperFields.map(field => ({
        cell: field.cell,
        value: stepperValues[field.cell] ?? '',
      }));
      const res = await fetch('/api/save-sheet-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: defaultSpreadsheetId,
          sheetName: selectedSheetName,
          updates,
        }),
      });
      if (res.ok) {
        setFinalSubmitStatus('success');
        // Add activity for saving to sheet
        await addActivity({
          type: 'add',
          entity: 'webhook', // Re-using webhook entity for now, could be 'sheet_row'
          label: `Row added to ${selectedSheetName}`,
          timestamp: Date.now(),
          sheetName: selectedSheetName,
          rowData: updates.map(({ cell, value }) => ({
            column: stepperFields.find(f => f.cell === cell)?.column || '',
            cell,
            value,
          })),
        });
        // Close modal, reset stepper state, and return to main page
        setTimeout(() => {
          setStepperModalOpen(false);
          setStepperFields([]);
          setStepperComplete(false);
          setStepperIndex(0);
          setStepperValues({});
          setFinalSubmitStatus(null);
          setFlowStep(1); // Return to Sheet step
        }, 1000);
      } else {
        setFinalSubmitStatus('error');
      }
    } catch (e) {
      console.error('Error saving to sheet:', e);
      setFinalSubmitStatus('error');
    }
  };

  const sendToAiApi = async () => {
    if (!transcript || !defaultSpreadsheetId || !selectedSheetName) {
      setSendResult("Please provide transcript, select a spreadsheet, and a sheet.");
      return;
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
    try {
      console.log("Sending to AI API:", JSON.stringify({
        transcript,
        spreadsheetId: defaultSpreadsheetId,
        sheetName: selectedSheetName,
      }, null, 2));
      const res = await fetch(api.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          spreadsheetId: defaultSpreadsheetId,
          sheetName: selectedSheetName,
          geminiApiKey: geminiApiKey, // Pass the user's Gemini API key
        }),
      });
      const text = await res.text();
      console.log("AI API raw response text:", text);
      console.log("AI API HTTP status:", res.status, res.statusText);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse AI API response as JSON:", e);
        data = {};
      }
      console.log("AI API parsed response:", data);
      if (res.ok && data.aiResponse) {
        // Support both array and object response for aiResponse
        const aiFields = Array.isArray(data.aiResponse)
          ? data.aiResponse
          : [
              ...(data.aiResponse.cells_to_update || []),
              ...(data.aiResponse.missing_columns || []),
            ];
        // Always build fields for all columns, prefilled with AI suggestions if available
        const fields = buildStepperFieldsForAllColumns(aiFields, sheetData);
        setStepperFields(fields);
        // Initialize stepperValues with value for each field
        const initialStepperValues: { [cell: string]: string } = {};
        fields.forEach(field => {
          if (field.cell) {
            initialStepperValues[field.cell] = field.value ?? '';
          }
        });
        setStepperValues(initialStepperValues);
        setStepperModalOpen(true);
        setSendResult("AI suggestions ready. Confirm and edit as needed.");
      } else {
        setSendResult(data.error || "Failed to get AI response.");
      }
    } catch (e) {
      setSendResult("Error: " + (e instanceof Error ? e.message : String(e)));
    }
    setSending(false);
  };

  // Add custom AI API
  const addAiApi = async () => {
    if (!newAiApiUrl.trim() || !user) return;
    await addDoc(collection(db, "users", user.uid, "aiApis"), {
      url: newAiApiUrl.trim(),
      name: newAiApiName.trim() || newAiApiUrl.trim(),
    });
    setNewAiApiUrl("");
    setNewAiApiName("");
  };

  // Delete custom AI API
  const deleteAiApi = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "aiApis", id));
    if (selectedAiApi === id) setSelectedAiApi("gemini");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-[#18181b]">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 flex flex-col items-center">
          <Image src="/globe.svg" alt="Logo" width={64} height={64} className="mb-4" />
          <h1 className="text-3xl font-bold mb-2">Welcome to Report AI</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6 text-center">Sign in with Google to get started and manage your spreadsheets with AI assistance.</p>
          <button
            onClick={signInWithGoogle}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-purple-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-semibold shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* NavBar (only if user is signed in) */}
      <div className="min-h-screen w-full bg-gray-100 dark:bg-[#18181b] p-4">
          <div className="w-full max-w-2xl mx-auto space-y-8 pb-40 pt-2">
          {/* Stepper/flow indicator */}
          {/* Remove the stepper/flow indicator (the row showing Input and Sheet steps) */}

          {/* Step 1: Speech/Text Input */}
          {flowStep === 0 && (
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-3 sm:p-4 space-y-3 border border-gray-200 dark:border-gray-800">
          <h2 className="text-base sm:text-lg font-semibold mb-1">Sheet Selection</h2>
          {/* Always show add spreadsheet UI */}
          <div className="flex items-center gap-2 w-full max-w-xs mb-4 relative">
            <input
              value={newOption}
              onChange={e => setNewOption(e.target.value)}
              placeholder="Enter Google Spreadsheet ID..."
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition pr-10"
              aria-label="Google Spreadsheet ID"
              onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
            />
            <button
              onClick={addOption}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-full bg-green-600 hover:bg-green-700 text-white transition shadow focus:outline-none focus:ring-2 focus:ring-green-400"
              aria-label="Add Spreadsheet"
              style={{ zIndex: 2 }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {activityError && (
            <div className="text-red-600 text-xs mb-2 text-center max-w-xs">{activityError}</div>
          )}
          <div className="text-xs text-gray-400 mb-4 text-center max-w-xs">
            Make sure your spreadsheet is shared with the service account.<br/>
            <span className="font-mono select-all">report-ai@report-ai-23599.iam.gserviceaccount.com</span>
          </div>
          {options.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="text-gray-500 text-center text-sm mb-2">No spreadsheets found.<br/>Add a new spreadsheet to get started.</div>
            </div>
          ) : defaultSpreadsheetId ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Using spreadsheet: {options.find(o => o.spreadsheetId === defaultSpreadsheetId)?.label}
                </span>
                <button
                  onClick={() => { setDefaultSpreadsheetId(""); setSelectedSheetName(""); setFlowStep(0); }}
                  className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-semibold"
                >
                  Change Spreadsheet
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {options.find(o => o.spreadsheetId === defaultSpreadsheetId)?.sheetNames.map(name => (
                  <div
                    key={`sheet-card-${name}`}
                    id={`sheet-card-${name}`}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition cursor-pointer shadow-sm select-none
                      ${selectedSheetName === name ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-blue-400 hover:shadow-md'}`}
                    onClick={() => setSelectedSheetName(String(name))}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedSheetName === name}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedSheetName(String(name)); }}
                  >
                    <div className={`w-4 h-4 flex items-center justify-center rounded-full border-2 ${selectedSheetName === name ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{selectedSheetName === name && <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
                    <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.map(option => (
                <div
                  key={option.id}
                  className={`relative flex items-center gap-2 p-3 rounded-lg border transition cursor-pointer shadow-sm select-none
                    ${defaultSpreadsheetId === option.spreadsheetId ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-blue-400 hover:shadow-md'}`}
                  onClick={() => { handleSelectSpreadsheet(option.spreadsheetId); setSelectedSheetName(""); }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={defaultSpreadsheetId === option.spreadsheetId}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { handleSelectSpreadsheet(option.spreadsheetId); setSelectedSheetName(""); } }}
                >
                  <div className={`w-4 h-4 flex items-center justify-center rounded-full border-2 ${defaultSpreadsheetId === option.spreadsheetId ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{defaultSpreadsheetId === option.spreadsheetId && <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
                  <span className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate pr-8">{option.label}</span>
                  <button
                    onClick={e => { e.stopPropagation(); if (window.confirm('Delete this spreadsheet?')) deleteOption(option.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition shadow focus:outline-none focus:ring-2 focus:ring-red-400"
                    aria-label="Delete Spreadsheet"
                    style={{ zIndex: 3 }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
                      <path d="M6 8v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8"/>
                      <path d="M9 4h2a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2z"/>
                      <line x1="4" y1="7" x2="16" y2="7"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setFlowStep(1)}
            disabled={!defaultSpreadsheetId || !selectedSheetName}
            className="px-8 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg shadow-md transition disabled:opacity-50 mt-4"
          >
            Next
          </button>
        </section>
        )}

          {/* Step 2: Sheet Selection */}
          {flowStep === 1 && (
    <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-3 sm:p-4 space-y-3 border border-gray-200 dark:border-gray-800">
      {/* Transcript/voice chat UI always visible */}
      <div className="relative w-full flex flex-col items-center">
        {/* Transcript display/edit area */}
        {!editingTranscript ? (
          <div className="relative flex flex-col items-center group" style={{minHeight: 64, width: '100%'}}>
            {/* VerticalTicker always visible */}
            <VerticalTicker transcript={transcript} />
            {/* Text input for manual entry */}
            <form
              className="flex items-center gap-2 w-full max-w-md mt-4"
              onSubmit={e => {
                e.preventDefault();
                if (textInputValue.trim()) {
                  setTranscript(t => (t ? t + '\n' : '') + textInputValue.trim());
                  setTextInputValue('');
                }
              }}
            >
              <input
                type="text"
                value={textInputValue || ''}
                onChange={e => setTextInputValue(e.target.value)}
                placeholder="Type and press Enter..."
                className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                aria-label="Type transcript"
              />
              <button
                type="submit"
                className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="Send text"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10l13-6-6 13-1.5-4.5L3 10z" />
                </svg>
              </button>
            </form>
            <button
              type="button"
              onClick={() => setEditingTranscript(true)}
              aria-label="Edit Transcript"
              className="absolute top-2 right-10 p-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition z-20"
              style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 5.3l-9.4 9.4-1.3 4.7 4.7-1.3 9.4-9.4a2 2 0 0 0-2.8-2.8z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { setTranscript(""); stopListening(); setEditingTranscript(false); }}
              aria-label="Clear"
              className="absolute top-2 right-2 rounded-full p-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition z-20"
              style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="16" y2="16" />
                <line x1="16" y1="4" x2="4" y2="16" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="relative w-full">
            <textarea
              id="manual-transcript"
              className="w-full rounded-xl shadow border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#23232a] px-4 py-3 pr-10 text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition resize-none"
              style={{ minHeight: 48, fontSize: '1.08rem', lineHeight: 1.5, boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)' }}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Type or hold mic to speak..."
              aria-label="Transcript"
            />
            <button
              type="button"
              onClick={() => setEditingTranscript(false)}
              aria-label="Save"
              className="absolute top-2 right-10 rounded-full p-1 bg-blue-600 text-white hover:bg-blue-700 transition z-20"
              style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 10 9 14 15 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { setTranscript(""); stopListening(); setEditingTranscript(false); }}
              aria-label="Clear"
              className="absolute top-2 right-2 rounded-full p-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition z-20"
              style={{ height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="4" x2="16" y2="16" />
                <line x1="16" y1="4" x2="4" y2="16" />
              </svg>
            </button>
            {/* VerticalTicker always visible below textarea */}
            <div className="mt-2">
              <VerticalTicker transcript={transcript} />
            </div>
          </div>
        )}
        {/* Mic button always visible below transcript */}
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={handleMicButton}
            aria-label={listening ? (paused ? "Resume Listening" : "Pause Listening") : "Start Listening"}
            className={`relative flex items-center justify-center w-20 h-20 rounded-full transition focus:outline-none focus:ring-2 focus:ring-blue-400
              ${listening ? (paused ? 'bg-yellow-400 animate-pulse' : 'bg-blue-600 animate-mic-glow') : 'bg-gray-200 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-800'}`}
            style={{ boxShadow: listening && !paused ? '0 0 0 8px #3b82f6aa, 0 0 0 16px #3b82f633' : undefined }}
          >
            <svg
              width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              className={listening && !paused ? 'animate-mic' : ''}
            >
              <rect x="9" y="2" width="6" height="12" rx="3" fill={listening && !paused ? '#fff' : 'currentColor'} stroke="currentColor" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
              <line x1="12" y1="22" x2="12" y2="18" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            {listening && !paused && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm text-blue-600 font-semibold">Listening...</span>
            )}
            {listening && paused && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm text-yellow-600 font-semibold">Paused</span>
            )}
          </button>
        </div>
        {/* Next/Send button below mic and input */}
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => setFlowStep(2)}
            disabled={!transcript.trim()}
            className="px-8 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg shadow-md transition disabled:opacity-50"
          >
            Next
          </button>
        </div>
        {/* Mic button animation styles */}
        <style>{`
          @keyframes micGlow {
            0% { box-shadow: 0 0 0 8px #3b82f6aa, 0 0 0 16px #3b82f633; }
            50% { box-shadow: 0 0 0 16px #3b82f6aa, 0 0 0 32px #3b82f633; }
            100% { box-shadow: 0 0 0 8px #3b82f6aa, 0 0 0 16px #3b82f633; }
          }
          .animate-mic-glow { animation: micGlow 1.2s infinite cubic-bezier(0.4,0,0.2,1); }
          @keyframes micAnim { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
          .animate-mic { animation: micAnim 1.1s infinite cubic-bezier(0.4,0,0.2,1); }
        `}</style>
      </div>
    </section>
  )}

          {/* Step 3: Webhook Selection and Send */}
          {flowStep === 2 && (
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">AI APIs</h2>
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-500 text-sm">Select an AI API below.</span>
          </div>
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-md font-semibold mb-2 text-gray-800 dark:text-gray-100">Google Gemini API Key</h3>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={e => setGeminiApiKey(e.target.value)}
                placeholder="Enter your Gemini API Key..."
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
              <button
                onClick={saveGeminiApiKey}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
              >Save</button>
            </div>
            {geminiApiKeySaved && <p className="text-green-600 text-sm mt-2">API Key saved!</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Gemini default */}
            <div
              key={GEMINI_API.id}
              className={`flex items-center gap-3 p-4 rounded-lg border transition cursor-pointer shadow-sm select-none
                ${selectedAiApi === GEMINI_API.id ? 'border-purple-700 bg-purple-50 dark:bg-purple-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-purple-400 hover:shadow-md'}`}
              onClick={() => setSelectedAiApi(GEMINI_API.id)}
              tabIndex={0}
              role="button"
              aria-pressed={selectedAiApi === GEMINI_API.id}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedAiApi(GEMINI_API.id); }}
            >
              <div className={`w-5 h-5 flex items-center justify-center rounded-full border-2 ${selectedAiApi === GEMINI_API.id ? 'border-purple-700 bg-purple-700' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{selectedAiApi === GEMINI_API.id && <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
              <span className="text-base text-gray-800 dark:text-gray-200 font-medium">{GEMINI_API.name}</span>
              <span className="text-xs text-gray-400 ml-2">(default)</span>
            </div>
            {/* Custom AI APIs */}
            {aiApis.map(api => (
              <div
                key={api.id}
                className={`flex items-center gap-3 p-4 rounded-lg border transition cursor-pointer shadow-sm select-none
                  ${selectedAiApi === api.id ? 'border-purple-700 bg-purple-50 dark:bg-purple-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-purple-400 hover:shadow-md'}`}
                onClick={() => setSelectedAiApi(api.id)}
                tabIndex={0}
                role="button"
                aria-pressed={selectedAiApi === api.id}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedAiApi(api.id); }}
              >
                <div className={`w-5 h-5 flex items-center justify-center rounded-full border-2 ${selectedAiApi === api.id ? 'border-purple-700 bg-purple-700' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{selectedAiApi === api.id && <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
                <span className="text-base text-gray-800 dark:text-gray-200 font-medium">{api.name}</span>
                <span className="text-xs text-gray-400 ml-2 truncate">{api.url}</span>
                <button
                  onClick={e => { e.stopPropagation(); if (window.confirm('Delete this AI API?')) deleteAiApi(api.id); }}
                  className="ml-auto px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-semibold"
                  aria-label="Delete AI API"
                  style={{ zIndex: 3 }}
                >Delete</button>
              </div>
            ))}
          </div>
          {/* Add AI API UI */}
          <form
            className="flex items-center gap-2 w-full max-w-xl mt-4"
            onSubmit={e => { e.preventDefault(); addAiApi(); }}
          >
            <input
              value={newAiApiName}
              onChange={e => setNewAiApiName(e.target.value)}
              placeholder="AI API Name (optional)"
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            />
            <input
              value={newAiApiUrl}
              onChange={e => setNewAiApiUrl(e.target.value)}
              placeholder="AI API URL..."
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
              required
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition">Add</button>
          </form>
          <div className="flex justify-between mt-4">
            <button
              className="px-6 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold transition"
              onClick={() => setFlowStep(1)}
            >Back</button>
            <button
              onClick={sendToAiApi}
              disabled={sending || !transcript || !selectedAiApi}
              className="px-8 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg shadow-md transition disabled:opacity-50"
            >{sending ? "Sending..." : "Send to AI"}</button>
          </div>
          {sendResult && (
            <div className="mt-2 text-sm whitespace-pre-line text-center max-w-xl">
              {/* Only show status, not raw JSON response */}
              {sendResult.split('Response:')[0].trim()}
            </div>
          )}
        </section>
          )}
        {/* Stepper UI for editing webhook fields as a modal */}
        {stepperModalOpen && stepperFields.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <section className="w-full max-w-xl mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[90vh] overflow-hidden">
              <button
                onClick={() => {
                  setStepperFields([]);
                  setStepperComplete(false);
                  setStepperIndex(0);
                  setStepperValues({});
                  setFlowStep(1); // Return to Sheet step
                }}
                className="sticky top-4 right-4 float-right text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold focus:outline-none z-10 bg-transparent"
                aria-label="Close"
                style={{ position: 'absolute', top: 16, right: 16 }}
              >&times;</button>
              <div className="w-full overflow-y-auto scrollbar-none" style={{ maxHeight: '70vh', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* Add custom CSS for Webkit browsers to hide scrollbar */}
                <style>{`
                  .scrollbar-none::-webkit-scrollbar { display: none; }
                `}</style>
              {!stepperComplete ? (
                <>
                  <h2 className="text-xl font-bold mb-4 text-center">Review & Edit Sheet Row</h2>
                  <div className="w-full flex flex-col items-center">
                    <div className="mb-6 w-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500">Field {stepperIndex + 1} of {stepperFields.length}</span>
                        <span className="text-xs text-gray-400">Cell: <span className="font-mono">{stepperFields[stepperIndex].cell}</span></span>
                      </div>
                      <label className="block text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200">{stepperFields[stepperIndex].column}</label>
                      <input
                        className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-base mb-2"
                        value={stepperValues[stepperFields[stepperIndex].cell] ?? stepperFields[stepperIndex].value ?? ''}
                        onChange={e => handleStepperChange(stepperFields[stepperIndex].cell, e.target.value)}
                        placeholder={`Enter value for ${stepperFields[stepperIndex].column}...`}
                      />
                    </div>
                    <div className="flex gap-3 w-full justify-between">
                      <button
                        onClick={handleStepperBack}
                        disabled={stepperIndex === 0}
                        className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:text-gray-600 transition text-sm font-medium disabled:opacity-50"
                      >Back</button>
                      <button
                          onClick={handleStepperAcceptAll}
                        className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium transition text-sm"
                        >Accept All</button>
                      {stepperIndex < stepperFields.length - 1 ? (
                        <button
                          onClick={handleStepperNext}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition text-sm"
                        >Next</button>
                      ) : (
                        <button
                          onClick={handleStepperFinish}
                          className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition text-sm"
                        >Finish</button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-4 text-center">Review Complete</h2>
                  
                  <div className="w-full">
                    <ul className="space-y-2">
                      {stepperFields.map(field => (
                        <li key={field.cell} className="flex flex-col gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
                          <span className="font-semibold">{field.column} <span className="text-xs text-gray-400">({field.cell})</span></span>
                          <span className="text-base text-gray-700 dark:text-gray-200">{stepperValues[field.cell] ?? field.value ?? <span className='italic text-gray-400'>(empty)</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => { setStepperComplete(false); setStepperIndex(0); setFinalSubmitStatus(null); }}
                      className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition text-base"
                    >Edit Again</button>
                    <button
                      onClick={saveToSheet}
                      disabled={finalSubmitStatus === 'sending'}
                      className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition text-base disabled:opacity-50"
                    >
                      {finalSubmitStatus === 'sending' ? (
                        <div className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </div>
                      ) : (
                        'Save to Sheet'
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

      {/* Options Management Modal */}
      {optionsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <section className="w-full max-w-md mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[90vh] overflow-hidden">
            <button
              onClick={() => setOptionsModalOpen(false)}
              className="sticky top-4 right-4 float-right text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold focus:outline-none z-10 bg-transparent"
              aria-label="Close"
              style={{ position: 'absolute', top: 16, right: 16 }}
            >&times;</button>
            <h2 className="text-xl font-bold mb-6 text-center">Manage Sheet Names</h2>
            <div className="flex gap-2 mb-3 w-full">
              <input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Add option..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
              <button onClick={addOption} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition">Add</button>
            </div>
            <ul className="space-y-2 w-full">
              {options.map(option => (
                <li key={option.id} className="flex items-center gap-3">
                  <input
                    className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 text-base transition"
                    value={option.label}
                    onChange={e => editOption(option.id, e.target.value)}
                  />
                  <button onClick={() => deleteOption(option.id)} className="text-red-600 hover:text-red-800 bg-transparent px-2 py-1 rounded transition">Delete</button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      
      

        {/* Recent Activity section - moved here to be at the bottom of the main content column */}
      <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-800 mt-12">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg width="22" height="22" fill="none" stroke="#6366f1" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
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
                  <li key={i} className="flex flex-col gap-1 text-xs w-full p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpandedActivity(expanded ? null : i)}>
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 mt-0.5">
                  {item.type === 'add' && <svg width="14" height="14" fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>}
                  {item.type === 'edit' && <svg width="14" height="14" fill="none" stroke="#f59e42" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>}
                  {item.type === 'delete' && <svg width="14" height="14" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6m-6 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>}
                </span>
                      <span className="truncate flex-1">
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
                        className="ml-2 text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none"
                        onClick={e => { e.stopPropagation(); setExpandedActivity(expanded ? null : i); }}
                        aria-label={expanded ? "Collapse details" : "Expand details"}
                      >{expanded ? "Hide" : "Show"}</button>
                    </div>
                    {expanded && (
                      <div className="mt-2">
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

