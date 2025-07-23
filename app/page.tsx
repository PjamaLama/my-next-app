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

// Types
interface Option {
  id: string;
  label: string;
}
interface WebhookHeader {
  id: string;
  key: string;
  value: string;
}
interface Webhook {
  id: string;
  url: string;
  name?: string; // Add name for user-friendly label
  type?: 'initial' | 'final' | 'backup' | 'other'; // Add type for purpose
  headers?: WebhookHeader[];
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
  suggested_value?: string;
}

// Helper for default header types
const HEADER_TYPE_MAKE_APIKEY = 'x-make-apikey';

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

export default function Home() {
  // All hooks must be called before any return!
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const { user, loading, signInWithGoogle, signOutUser } = useFirebase();
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const listeningRef = useRef(listening);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newWebhook, setNewWebhook] = useState("");
  const [selectedWebhook, setSelectedWebhook] = useState<string>("");
  const [makeApiKeyFor, setMakeApiKeyFor] = useState<{ [webhookId: string]: string }>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [webhooksModalOpen, setWebhooksModalOpen] = useState(false);
  const [stepperModalOpen, setStepperModalOpen] = useState(false);
  const [finalSubmitConfirmation, setFinalSubmitConfirmation] = useState<string | null>(null);
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  const [selectedFinalWebhook, setSelectedFinalWebhook] = useState<string>("");
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookType, setNewWebhookType] = useState<'initial' | 'final' | 'backup' | 'other'>('final');
  const [flowStep, setFlowStep] = useState(0); // 0: input, 1: sheet, 2: webhook
  const [editingTranscript, setEditingTranscript] = useState(false);

  // All useEffect and other hooks remain here, before any return
  useEffect(() => {
    if (!user) return;
    const optionsRef = collection(db, "users", user.uid, "options");
    const webhooksRef = collection(db, "users", user.uid, "webhooks");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Option));
    });
    const unsubWebhooks = onSnapshot(webhooksRef, (snapshot) => {
      setWebhooks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Webhook));
    });
    return () => {
      unsubOptions();
      unsubWebhooks();
    };
  }, [user]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  // Remove the useEffect that creates the SpeechRecognition instance
  // useEffect(() => { ... }, [listening]);

  const startListening = (clearTranscript = true) => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return alert("Speech recognition not supported in this browser.");
    // Create a new instance every time
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = transcript; // Use current transcript as base
      for (let i = 0; i < event.results.length; ++i) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
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
        } catch (e) {
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
    if (!newOption.trim() || !user) return;
    await addDoc(collection(db, "users", user.uid, "options"), { label: newOption.trim() });
    await addActivity({ type: 'add', entity: 'sheet', label: newOption.trim(), timestamp: Date.now() });
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

  // Webhook management
  const addWebhook = async () => {
    if (!newWebhook.trim() || !user) return;
    await addDoc(collection(db, "users", user.uid, "webhooks"), {
      url: newWebhook.trim(),
      name: newWebhookName.trim() || undefined,
      type: newWebhookType,
      headers: []
    });
    await addActivity({ type: 'add', entity: 'webhook', label: newWebhookName.trim() || newWebhook.trim(), timestamp: Date.now() });
    setNewWebhook("");
    setNewWebhookName("");
    setNewWebhookType('final');
  };
  const deleteWebhook = async (id: string) => {
    if (!user) return;
    const wh = webhooks.find(w => w.id === id);
    await deleteDoc(doc(db, "users", user.uid, "webhooks", id));
    await addActivity({ type: 'delete', entity: 'webhook', label: wh?.name || wh?.url || '', timestamp: Date.now() });
    if (selectedWebhook === id) setSelectedWebhook("");
  };
  const editWebhook = async (id: string, url: string, name?: string, type?: 'initial' | 'final' | 'backup' | 'other') => {
    if (!user) return;
    const webhook = webhooks.find(w => w.id === id);
    await setDoc(doc(db, "users", user.uid, "webhooks", id), {
      ...webhook,
      url,
      name: (name ?? webhook?.name) || "",
      type: (type ?? webhook?.type) || "final",
    });
    await addActivity({ type: 'edit', entity: 'webhook', label: name || url, timestamp: Date.now() });
  };
  // (Removed: addHeader, editHeader, deleteHeader)

  // Send to webhook
  const sendToWebhook = async () => {
    if (!transcript || !selectedOption || !selectedWebhook) {
      setSendResult("Please provide transcript, select an option, and a webhook.");
      return;
    }
    setSending(true);
    setSendResult(null);
    const webhook = webhooks.find(w => w.id === selectedWebhook);
    const webhookUrl = webhook?.url;
    const payload = { transcript, option: options.find(o => o.id === selectedOption)?.label };
    if (!webhookUrl) {
      setSendResult("Invalid webhook selected.");
      setSending(false);
      return;
    }
    // Build headers
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhook?.headers) {
      webhook.headers.forEach(h => {
        if (h.key) headers[h.key] = h.value;
      });
    }
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      let responseText = "";
      try {
        responseText = await res.text();
      } catch {}
      if (res.ok) {
        setSendResult("Sent successfully! Response: " + responseText);
        setFlowStep(0);
        setTranscript("");
      } else {
        setSendResult(
          `Failed to send. Status: ${res.status} ${res.statusText}\nResponse: ${responseText}`
        );
      }
    } catch (e) {
      const error = e as Error;
      setSendResult("Error: " + (error?.message || error?.toString()));
      if (typeof window !== "undefined" && window.console) {
        // Log full error to browser console
        console.error("Webhook send error:", error);
      }
    }
    setSending(false);
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

  // When stepperFields are set, auto-select the first 'final' webhook if available
  useEffect(() => {
    if (stepperFields.length > 0) {
      const finalWebhook = webhooks.find(w => w.type === 'final');
      if (finalWebhook) {
        setSelectedFinalWebhook(finalWebhook.id);
      } else if (selectedWebhook) {
        setSelectedFinalWebhook(selectedWebhook);
      }
    }
  }, [stepperFields, webhooks, selectedWebhook]);

  // Handler for final submit
  const handleFinalSubmit = async () => {
    setFinalSubmitStatus(null);
    const webhook = webhooks.find(w => w.id === selectedFinalWebhook);
    if (!webhook) {
      setFinalSubmitStatus("No webhook selected.");
      return;
    }
    const webhookUrl = webhook.url;
    // Build headers
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhook.headers) {
      webhook.headers.forEach(h => {
        if (h.key) headers[h.key] = h.value;
      });
    }
    // Build payload: match requested format
    let row: string | undefined = undefined;
    // Get sheet name from selected option
    const selectedSheetName = options.find(o => o.id === selectedOption)?.label || '';
    const cells_to_update: { column: string; cell: string; value: string }[] = [];
    const missing_columns: { column: string; cell: string; suggested_value: string }[] = [];
    stepperFields.forEach(field => {
      // Try to extract row number from cell (e.g., 'A12' -> '12')
      if (!row && /^([A-Z]+)(\d+)$/.test(field.cell)) {
        row = field.cell.match(/^([A-Z]+)(\d+)$/)?.[2];
      }
      // Prefer user value if present, else suggested, else default
      const userValue = stepperValues[field.cell];
      const aiValue = field.suggested_value;
      const defaultValue = field.value;
      let valueToSend = undefined;
      if (userValue !== undefined && userValue !== null && userValue !== "") {
        valueToSend = userValue;
      } else if (aiValue !== undefined && aiValue !== null && aiValue !== "") {
        valueToSend = aiValue;
      } else if (defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
        valueToSend = defaultValue;
      }
      // Only send if valueToSend is not null/empty/zero (as string or number)
      if (
        valueToSend !== undefined &&
        valueToSend !== null &&
        valueToSend !== "" &&
        !((typeof valueToSend === 'number' && valueToSend === 0) || (typeof valueToSend === 'string' && valueToSend === '0'))
      ) {
        cells_to_update.push({ column: field.column, cell: field.cell, value: valueToSend });
      } else if (aiValue !== undefined && aiValue !== null && aiValue !== "") {
        // If not sending, but there is an AI suggestion, add to missing_columns
        missing_columns.push({ column: field.column, cell: field.cell, suggested_value: aiValue });
      }
    });
    const payload: Record<string, unknown> = {
      row_to_update: row,
      sheet_name: selectedSheetName,
      cells_to_update,
      missing_columns
    };
    console.log('Final webhook payload:', payload);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      let responseText = "";
      try {
        responseText = await res.text();
      } catch {}
      if (res.ok) {
        setFinalSubmitStatus("Successfully submitted to webhook!" + (responseText ? `\n${responseText}` : ""));
        setStepperModalOpen(false);
        setFinalSubmitConfirmation("done"); // Use a flag for modal
        setTimeout(() => setFinalSubmitConfirmation(null), 3000);
        setStepperFields([]);
        setStepperComplete(false);
        setStepperIndex(0);
        setStepperValues({});
        setTranscript(""); // Clear transcript input
        // Add activity for final webhook submission
        await addActivity({
          type: 'add',
          entity: 'webhook',
          label: webhook.name || webhook.url,
          timestamp: Date.now(),
          sheetName: selectedSheetName,
          rowNumber: row,
          rowData: cells_to_update
        });
      } else {
        setFinalSubmitStatus(`Failed to submit. Status: ${res.status} ${res.statusText}\n${responseText}`);
      }
    } catch (e) {
      const error = e as Error;
      setFinalSubmitStatus("Error: " + (error?.message || error?.toString()));
    }
  };

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

  // Validation for each step
  const canProceedInput = transcript.trim().length > 0;
  const canProceedSheet = !!selectedOption;
  // (canProceedWebhook removed as unused)

  // UI rendering
  // NavBar component
  function NavBar() {
    // Defensive: user should never be null here, but fallback to empty string just in case
    const display = user?.displayName || user?.email || "";
    return (
      <nav className="sticky top-0 z-40 w-full bg-white/90 dark:bg-[#18181b] border-b border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-green-400 shadow-lg">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="6" width="20" height="20" rx="4" fill="#fff" stroke="#6366f1" strokeWidth="2"/>
              <path d="M12 20c2-2 6-2 8 0" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"/>
              <path d="M16 14v2" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="16" cy="12" r="1.5" fill="#a21caf"/>
              <path d="M10 12c2-4 10-4 12 0" stroke="#a21caf" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </span>
          <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Report Ai</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{display}</span>
          {/* Only one settings icon for managing webhooks */}
          <button
            onClick={() => setWebhooksModalOpen(true)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-200"
            aria-label="Manage Webhooks"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <circle cx="4" cy="12" r="2.5" />
              <circle cx="12" cy="8" r="2.5" />
              <circle cx="20" cy="16" r="2.5" />
            </svg>
          </button>
          <button onClick={signOutUser} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm font-medium">Sign out</button>
        </div>
      </nav>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#18181b] via-[#23232a] to-[#0a0a0a]">
        <div className="text-lg text-white">Loading...</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#18181b] via-[#23232a] to-[#0a0a0a]">
        <div className="bg-white/90 dark:bg-[#18181b] rounded-xl shadow-lg p-10 flex flex-col items-center gap-6 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-green-400 shadow-lg">
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="20" height="20" rx="4" fill="#fff" stroke="#6366f1" strokeWidth="2"/>
                <path d="M12 20c2-2 6-2 8 0" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 14v2" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="16" cy="12" r="1.5" fill="#a21caf"/>
                <path d="M10 12c2-4 10-4 12 0" stroke="#a21caf" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">Report Ai</h1>
          </div>
          <p className="text-base text-gray-500 dark:text-gray-300 mb-4 text-center">Sign in with Google to manage your webhooks and sheet names securely.</p>
          <button
            onClick={signInWithGoogle}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-md transition flex items-center gap-2"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" strokeWidth="0"></g><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.242 3.023-3.617 3.023-2.18 0-3.961-1.805-3.961-4.023s1.781-4.023 3.961-4.023c1.242 0 2.07.492 2.547.914l2.484-2.414c-1.086-.992-2.484-1.602-5.031-1.602-4.023 0-7.289 3.266-7.289 7.125s3.266 7.125 7.289 7.125c4.195 0 6.969-2.953 6.969-7.117 0-.477-.055-.836-.125-1.188z" fill="#4285F4"></path><path d="M3.272 7.545l3.273 2.402c.891-1.07 2.18-2.188 4.242-2.188 1.242 0 2.07.492 2.547.914l2.484-2.414c-1.086-.992-2.484-1.602-5.031-1.602-2.953 0-5.453 1.68-6.617 4.088z" fill="#34A853"></path><path d="M12.487 21.5c2.789 0 5.125-.922 6.836-2.516l-3.164-2.594c-.867.617-2.055 1.055-3.672 1.055-2.367 0-4.367-1.555-5.086-3.703l-3.242 2.5c1.547 3.07 4.789 5.258 8.328 5.258z" fill="#FBBC05"></path><path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.242 3.023-3.617 3.023-2.18 0-3.961-1.805-3.961-4.023s1.781-4.023 3.961-4.023c1.242 0 2.07.492 2.547.914l2.484-2.414c-1.086-.992-2.484-1.602-5.031-1.602-4.023 0-7.289 3.266-7.289 7.125s3.266 7.125 7.289 7.125c4.195 0 6.969-2.953 6.969-7.117 0-.477-.055-.836-.125-1.188z" fill="#4285F4"></path></g></svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }
  // (The two useEffect hooks after the return have been removed)

  return (
    <>
      {/* NavBar (only if user is signed in) */}
      {user && <NavBar />}
      <div className="min-h-screen w-full bg-gray-100 dark:bg-[#18181b] p-4">
          <div className="w-full max-w-2xl mx-auto space-y-8 pb-40 pt-2">
          {/* Stepper/flow indicator */}
          {/* Remove the stepper/flow indicator (the row showing Input and Sheet steps) */}

          {/* Step 1: Speech/Text Input */}
          {flowStep === 0 && (
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-3 sm:p-4 space-y-3 border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center min-h-[120px]">
          {/* Centered mic and next button row */}
          <div className="flex items-center justify-center gap-2 w-full mb-2">
            <button
              onClick={handleMicButton}
              aria-label={listening ? (paused ? 'Resume Listening' : 'Pause Listening') : 'Start Listening'}
              className={`rounded-full p-5 transition focus:outline-none shadow-md border-2 ${listening ? (paused ? 'bg-yellow-100 border-yellow-500 text-yellow-600' : 'bg-red-100 border-red-500 text-red-600 animate-pulse') : 'bg-blue-100 border-blue-500 text-blue-600 hover:bg-blue-200 hover:border-blue-600'}`}
              style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {listening ? (
                paused ? (
                  // Resume icon
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="8,5 19,12 8,19" />
                  </svg>
                ) : (
                  // Mic off or animated mic icon
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="red" strokeWidth="2.2"/>
                  </svg>
                )
              ) : (
                // Mic icon
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
            {/* Next button as animated arrow icon, only if transcript has data */}
            <button
              type="button"
              onClick={() => { stopListening(); setFlowStep(1); }}
              aria-label="Next"
              disabled={!transcript.trim()}
              className={`rounded-full p-5 transition focus:outline-none shadow-md border-2 bg-blue-600 border-blue-600 text-white flex items-center justify-center
                ${transcript.trim() ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-2 pointer-events-none'}
                duration-200 ease-in-out`}
              style={{ width: 64, height: 64 }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
          {/* Sleek transcript box below, only if transcript or listening */}
          {(listening || transcript.trim()) && (
            <div className="relative w-full max-w-xs mx-auto">
              {/* Slot machine style transcript view using react-vertical-ticker - REMOVED */}
              {!editingTranscript ? (
                <div className="relative flex flex-col items-center group" style={{minHeight: 64}}>
                  {/* Fade overlays */}
                  <div className="pointer-events-none absolute top-0 left-0 w-full h-6 z-10" style={{background: 'linear-gradient(to bottom, rgba(255,255,255,0.85) 60%, transparent)'}} />
                  <div className="pointer-events-none absolute bottom-0 left-0 w-full h-6 z-10" style={{background: 'linear-gradient(to top, rgba(255,255,255,0.85) 60%, transparent)'}} />
                  {/* Use new VerticalTicker component */}
                  <VerticalTicker transcript={transcript} />
                  {/* Edit and Clear buttons remain unchanged */}
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
                <div className="relative">
                  <textarea
                    id="manual-transcript"
                    className="w-full rounded-xl shadow border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#23232a] px-4 py-3 pr-10 text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition resize-none"
                    style={{ minHeight: 48, fontSize: '1.08rem', lineHeight: 1.5, boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)' }}
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="Type or hold mic to speak..."
                    aria-label="Transcript"
                  />
                  {/* Save button */}
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
                  {/* X button to clear transcript, inside the box top right */}
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
              )}
            </div>
          )}
        </section>
          )}

          {/* Step 2: Sheet Selection */}
          {flowStep === 1 && (
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-3 sm:p-4 space-y-3 border border-gray-200 dark:border-gray-800">
          <h2 className="text-base sm:text-lg font-semibold mb-1">Sheet Names</h2>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 text-xs sm:text-sm">Select a sheet name below.</span>
            <button
              onClick={() => setOptionsModalOpen(true)}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-xs sm:text-sm"
            >
              Manage Sheet Names
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(option => (
              <div
                key={option.id}
                className={`flex items-center gap-2 p-3 rounded-lg border transition cursor-pointer shadow-sm select-none
                  ${selectedOption === option.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-blue-400 hover:shadow-md'}`}
                onClick={() => setSelectedOption(option.id)}
                tabIndex={0}
                role="button"
                aria-pressed={selectedOption === option.id}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedOption(option.id); }}
              >
                <div className={`w-4 h-4 flex items-center justify-center rounded-full border-2 ${selectedOption === option.id ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{selectedOption === option.id && <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
                <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{option.label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3">
            <button
              className="px-4 py-1 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold transition text-xs sm:text-sm"
              onClick={() => setFlowStep(0)}
            >Back</button>
            <button
              className="px-4 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 text-xs sm:text-sm"
              onClick={async () => {
                const initialWebhook = webhooks.find(w => w.type === 'initial');
                if (initialWebhook) {
                  setSelectedWebhook(initialWebhook.id);
                  setSending(true);
                  setSendResult(null);
                  const webhookUrl = initialWebhook.url;
                  const payload = { transcript, option: options.find(o => o.id === selectedOption)?.label };
                  // Build headers
                  const headers = { "Content-Type": "application/json" };
                  if (initialWebhook.headers) {
                    initialWebhook.headers.forEach(h => {
                      if (h.key) (headers as any)[h.key] = h.value;
                    });
                  }
                  try {
                    const res = await fetch(webhookUrl, {
                      method: "POST",
                      headers,
                      body: JSON.stringify(payload),
                    });
                    let responseText = "";
                    try {
                      responseText = await res.text();
                    } catch {}
                    if (res.ok) {
                      setSendResult("Sent successfully! Response: " + responseText);
                      setFlowStep(2); // Go to stepper/modal if needed
                      setTranscript("");
                    } else {
                      setSendResult(`Failed to send. Status: ${res.status} ${res.statusText}\nResponse: ${responseText}`);
                    }
                  } catch (e) {
                    const error = e as any;
                    setSendResult("Error: " + (error?.message || error?.toString()));
                    if (typeof window !== "undefined" && window.console) {
                      console.error("Webhook send error:", error);
                    }
                  }
                  setSending(false);
                } else {
                  alert("No initial webhook configured. Please add one in the settings.");
                }
              }}
              disabled={!canProceedSheet || sending}
            >
              {sending && (
                <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              )}
              {sending ? 'Sending...' : 'Next'}
            </button>
          </div>
        </section>
      )}

          {/* Step 3: Webhook Selection and Send */}
          {flowStep === 2 && (
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Webhooks</h2>
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-500 text-sm">Select a webhook below.</span>
            <button
              onClick={() => setWebhooksModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-sm"
            >
              Manage Webhooks
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {webhooks.filter(w => (w.type || 'final') === 'initial').map(webhook => (
              <div
                key={webhook.id}
                className={`flex items-center gap-3 p-4 rounded-lg border transition cursor-pointer shadow-sm select-none
                  ${selectedWebhook === webhook.id ? 'border-purple-700 bg-purple-50 dark:bg-purple-900/30 shadow-lg' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-[#18181b] hover:border-purple-400 hover:shadow-md'}`}
                onClick={() => setSelectedWebhook(webhook.id)}
                tabIndex={0}
                role="button"
                aria-pressed={selectedWebhook === webhook.id}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedWebhook(webhook.id); }}
              >
                <div className={`w-5 h-5 flex items-center justify-center rounded-full border-2 ${selectedWebhook === webhook.id ? 'border-purple-700 bg-purple-700' : 'border-gray-400 bg-white dark:bg-[#18181b]'}`}>{selectedWebhook === webhook.id && <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M6 10.5l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>
                <span className="text-base text-gray-800 dark:text-gray-200 font-medium">{webhook.name ? `${webhook.name} (${webhook.type || 'final'})` : webhook.url}</span>
              </div>
            ))}
          </div>
              <div className="flex justify-between mt-4">
                <button
                  className="px-6 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold transition"
                  onClick={() => setFlowStep(1)}
                >Back</button>
          <button
            onClick={sendToWebhook}
            disabled={sending || !transcript || !selectedOption || !selectedWebhook}
            className="px-8 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg shadow-md transition disabled:opacity-50"
                >{sending ? "Sending..." : "Send to Webhook"}</button>
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
                  <h2 className="text-xl font-bold mb-4 text-center">Review & Edit Webhook Data</h2>
                  <div className="w-full flex flex-col items-center">
                    <div className="mb-6 w-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500">Field {stepperIndex + 1} of {stepperFields.length}</span>
                        <span className="text-xs text-gray-400">Cell: <span className="font-mono">{stepperFields[stepperIndex].cell}</span></span>
                      </div>
                      <label className="block text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200">{stepperFields[stepperIndex].column}</label>
                      <input
                        className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-base mb-2"
                        value={stepperValues[stepperFields[stepperIndex].cell] ?? stepperFields[stepperIndex].suggested_value ?? stepperFields[stepperIndex].value ?? ''}
                        onChange={e => handleStepperChange(stepperFields[stepperIndex].cell, e.target.value)}
                        placeholder={stepperFields[stepperIndex].suggested_value || 'Enter value...'}
                      />
                      {stepperFields[stepperIndex].suggested_value && (
                        <div className="text-xs text-blue-600 dark:text-blue-300 mb-1">Suggested: <span className="font-mono">{stepperFields[stepperIndex].suggested_value}</span></div>
                      )}
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
                  {/* Webhook selection dropdown */}
                  <div className="w-full mb-4">
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Select Webhook to Submit To:</label>
                    <select
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-base"
                      value={selectedFinalWebhook}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedFinalWebhook(e.target.value)}
                    >
                      {webhooks.filter(w => (w.type || 'final') === 'final').map(w => (
                        <option key={w.id} value={w.id}>{w.name ? `${w.name} (${w.type || 'final'})` : w.url}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full">
                    <ul className="space-y-2">
                      {stepperFields.map(field => (
                        <li key={field.cell} className="flex flex-col gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
                          <span className="font-semibold">{field.column} <span className="text-xs text-gray-400">({field.cell})</span></span>
                          <span className="text-base text-gray-700 dark:text-gray-200">{stepperValues[field.cell] ?? field.suggested_value ?? field.value ?? <span className='italic text-gray-400'>(empty)</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={handleFinalSubmit}
                    className="mt-6 px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition text-base w-full"
                  >Confirm & Submit</button>
                  {finalSubmitStatus && (
                    <div className="mt-4 text-sm text-center whitespace-pre-line max-w-xl mx-auto">
                      {finalSubmitStatus}
                    </div>
                  )}
                  <button
                    onClick={() => { setStepperComplete(false); setStepperIndex(0); setFinalSubmitStatus(null); }}
                    className="mt-4 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition text-base"
                  >Edit Again</button>
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

      {/* Webhooks Management Modal */}
      {webhooksModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <section className="w-full max-w-2xl mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[90vh] overflow-hidden">
            <button
              onClick={() => setWebhooksModalOpen(false)}
              className="sticky top-4 right-4 float-right text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold focus:outline-none z-10 bg-transparent"
              aria-label="Close"
              style={{ position: 'absolute', top: 16, right: 16 }}
            >&times;</button>
            <h2 className="text-xl font-bold mb-4 text-center flex items-center gap-2">
              {/* Hook icon for webhooks */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-700 dark:text-blue-300">
                <path d="M12 2v10a4 4 0 1 0 8 0" />
                <circle cx="12" cy="2" r="1.5" />
                <path d="M12 12c0 4-4 4-4 0" />
              </svg>
              Manage Webhooks
            </h2>
            <div className="flex gap-2 mb-3 w-full">
              <input value={newWebhookName} onChange={e => setNewWebhookName(e.target.value)} placeholder="Webhook Name..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
              <select value={newWebhookType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewWebhookType(e.target.value as 'initial' | 'final' | 'backup' | 'other')} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
                <option value="initial">Initial</option>
                <option value="final">Final</option>
                <option value="backup">Backup</option>
                <option value="other">Other</option>
              </select>
              <input value={newWebhook} onChange={e => setNewWebhook(e.target.value)} placeholder="Add webhook URL..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
              <button onClick={addWebhook} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition">Add</button>
            </div>
            <ul className="space-y-3 w-full">
              {webhooks.map(webhook => (
                <li key={webhook.id} className="flex flex-col gap-2 p-3 rounded-lg border border-gray-300 dark:border-gray-700" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <div className="flex items-center gap-2">
                    <input
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 text-base transition"
                      value={webhook.url}
                      onChange={e => editWebhook(webhook.id, e.target.value, webhook.name, webhook.type)}
                    />
                    <input
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 w-32 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 text-base transition"
                      value={webhook.name || ''}
                      placeholder="Name"
                      onChange={e => editWebhook(webhook.id, webhook.url, e.target.value, webhook.type)}
                    />
                    <select
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 w-28 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 text-base transition"
                      value={webhook.type || 'final'}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => editWebhook(webhook.id, webhook.url, webhook.name, e.target.value as 'initial' | 'final' | 'backup' | 'other')}
                    >
                      <option value="initial">Initial</option>
                      <option value="final">Final</option>
                      <option value="backup">Backup</option>
                      <option value="other">Other</option>
                    </select>
                    <button onClick={() => deleteWebhook(webhook.id)} className="text-red-600 hover:text-red-800 bg-transparent px-2 py-1 rounded transition">Delete</button>
                  </div>
                  {/* Make.com API Key UI */}
                  <div className="flex items-center gap-2 ml-6">
                    <input
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                      style={{ width: 260 }}
                      value={makeApiKeyFor[webhook.id] || ''}
                      placeholder="Make.com API Key (x-make-apikey)"
                      onChange={e => setMakeApiKeyFor(prev => ({ ...prev, [webhook.id]: e.target.value }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {finalSubmitConfirmation && finalSubmitConfirmation === "done" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-[#23232a] rounded-xl shadow-2xl px-8 py-10 flex flex-col items-center border border-green-400">
            <svg className="mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2.5" fill="#dcfce7"/><path d="M8 12l2.5 2.5L16 9" stroke="#22c55e" strokeWidth="2.5"/></svg>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">Done!</div>
            <div className="text-base text-gray-700 dark:text-gray-200 text-center">Your submission was successful.</div>
          </div>
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

