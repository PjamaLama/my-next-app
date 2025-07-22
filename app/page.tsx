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
  addDoc
} from "firebase/firestore";

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

export default function Home() {
  const { user, loading, signInWithGoogle, signOutUser } = useFirebase();
  // All hooks must be called before any return!
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
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
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [stepperFields, setStepperFields] = useState<StepperField[]>([]);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);

  // Stepper UI state
  const [stepperIndex, setStepperIndex] = useState(0);
  const [stepperValues, setStepperValues] = useState<{ [cell: string]: string }>({});
  const [stepperComplete, setStepperComplete] = useState(false);
  // New: state for final webhook selection and submission status
  const [selectedFinalWebhook, setSelectedFinalWebhook] = useState<string>("");
  const [finalSubmitStatus, setFinalSubmitStatus] = useState<string | null>(null);

  // Handler for updating a value
  const handleStepperChange = (cell: string, value: string) => {
    setStepperValues(v => ({ ...v, [cell]: value }));
  };
  // Handler for skipping a field
  const handleStepperSkip = (cell: string) => {
    setStepperValues(v => ({ ...v, [cell]: "" }));
    handleStepperNext();
  };
  // Handler for next
  const handleStepperNext = () => {
    if (stepperIndex < stepperFields.length - 1) {
      setStepperIndex(i => i + 1);
    } else {
      setStepperComplete(true);
    }
  };
  // Handler for back
  const handleStepperBack = () => {
    if (stepperIndex > 0) setStepperIndex(i => i - 1);
  };
  // Handler for finish
  const handleStepperFinish = () => {
    setStepperComplete(true);
  };

  // Always call hooks, only run logic if user exists
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
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    recognitionRef.current = new SpeechRecognitionClass();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = "en-US";
    recognitionRef.current.onresult = (event: MinimalSpeechRecognitionEvent) => {
      setTranscript(event.results[0][0].transcript);
      setListening(false);
    };
    recognitionRef.current.onerror = () => setListening(false);
    recognitionRef.current.onend = () => setListening(false);
  }, []);

  useEffect(() => {
    const newMakeApiKey: { [webhookId: string]: string } = {};
    webhooks.forEach(w => {
      const makeHeader = (w.headers || []).find(h => h.key === HEADER_TYPE_MAKE_APIKEY);
      if (makeHeader) {
        newMakeApiKey[w.id] = makeHeader.value;
      } else {
        newMakeApiKey[w.id] = '';
      }
    });
    setMakeApiKeyFor(newMakeApiKey);
  }, [webhooks]);

  // When Make.com API key changes, update the headers for that webhook
  const setMakeApiKeyForWebhook = async (webhookId: string, value: string) => {
    setMakeApiKeyFor(v => ({ ...v, [webhookId]: value }));
    const webhook = webhooks.find(w => w.id === webhookId);
    if (!user || !webhook) return;
    let headers = (webhook.headers || []).filter(h => h.key !== HEADER_TYPE_MAKE_APIKEY);
    if (value) {
      headers = [...headers, { id: 'make-apikey', key: HEADER_TYPE_MAKE_APIKEY, value }];
    }
    await setDoc(doc(db, "users", user.uid, "webhooks", webhookId), { ...webhook, headers });
  };

  const startListening = () => {
    if (!recognitionRef.current) return alert("Speech recognition not supported in this browser.");
    setTranscript("");
    setListening(true);
    recognitionRef.current.start();
  };
  const stopListening = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
  };

  // Option management
  const addOption = async () => {
    if (!newOption.trim() || !user) return;
    await addDoc(collection(db, "users", user.uid, "options"), { label: newOption.trim() });
    setNewOption("");
  };
  const deleteOption = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "options", id));
    if (selectedOption === id) setSelectedOption("");
  };
  const editOption = async (id: string, label: string) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "options", id), { label });
  };

  // Webhook management
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookType, setNewWebhookType] = useState<'initial' | 'final' | 'backup' | 'other'>('final');
  const addWebhook = async () => {
    if (!newWebhook.trim() || !user) return;
    await addDoc(collection(db, "users", user.uid, "webhooks"), {
      url: newWebhook.trim(),
      name: newWebhookName.trim() || undefined,
      type: newWebhookType,
      headers: []
    });
    setNewWebhook("");
    setNewWebhookName("");
    setNewWebhookType('final');
  };
  const deleteWebhook = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "webhooks", id));
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
    setLastPayload(payload);
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
    let arrStr = match ? match[0] : response;
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

  // When sendResult changes and contains a webhook response, parse stepper fields
  useEffect(() => {
    if (sendResult && sendResult.includes("Response:")) {
      // Try to extract the JSON-like part after 'Response:'
      const parts = sendResult.split("Response:");
      if (parts.length > 1) {
        const fields = parseStepperFields(parts[1]);
        if (fields.length > 0) setStepperFields(fields);
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
      let value: string = "";
      if (stepperValues[field.cell] !== undefined && stepperValues[field.cell] !== "") {
        value = stepperValues[field.cell];
      } else if (field.suggested_value !== undefined && field.suggested_value !== "") {
        value = field.suggested_value;
      } else if (field.value !== undefined && field.value !== "") {
        value = field.value;
      }
      if (value !== "") {
        cells_to_update.push({ column: field.column, cell: field.cell, value });
      } else if (field.suggested_value !== undefined) {
        missing_columns.push({ column: field.column, cell: field.cell, suggested_value: field.suggested_value });
      }
    });
    const payload: Record<string, any> = {
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
      } else {
        setFinalSubmitStatus(`Failed to submit. Status: ${res.status} ${res.statusText}\n${responseText}`);
      }
    } catch (e) {
      const error = e as Error;
      setFinalSubmitStatus("Error: " + (error?.message || error?.toString()));
    }
  };

  // UI rendering
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
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Welcome to ReportAI</h1>
          <p className="text-base text-gray-500 dark:text-gray-300 mb-4 text-center">Sign in with Google to manage your webhooks and options securely.</p>
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
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#18181b] via-[#23232a] to-[#0a0a0a] dark:from-[#18181b] dark:via-[#23232a] dark:to-[#0a0a0a] p-4">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        <header className="mb-4 text-center flex flex-col items-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Speech to Text Webhook App</h1>
          <p className="text-base text-gray-400">Transcribe speech, select an option, and send to your Make.com webhook.</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-gray-500 dark:text-gray-300">Signed in as <span className="font-semibold">{user.displayName || user.email}</span></span>
            <button onClick={signOutUser} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm font-medium">Sign out</button>
          </div>
        </header>

        {/* Speech to Text */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Speech Recognition</h2>
          <div className="flex gap-3 flex-wrap">
            <button onClick={startListening} disabled={listening} className="px-5 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50">Start Listening</button>
            <button onClick={stopListening} disabled={!listening} className="px-5 py-2 rounded-lg font-medium bg-gray-400 hover:bg-gray-500 text-white transition disabled:opacity-50">Stop</button>
          </div>
          <div className="transcript-box mt-2 shadow-inner border border-gray-300 dark:border-gray-700">
            {transcript || <span style={{ opacity: 0.5 }}>Transcript will appear here...</span>}
          </div>
          <div className="mt-4">
            <label htmlFor="manual-transcript" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Type or edit transcript manually:</label>
            <textarea
              id="manual-transcript"
              className="w-full min-h-[60px] border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-base"
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Type here or use voice..."
            />
          </div>
        </section>

        {/* Options Display (Read-only, with Manage button) */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Options</h2>
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-500 text-sm">Select an option below.</span>
            <button
              onClick={() => setOptionsModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-sm"
            >
              Manage Options
            </button>
          </div>
          <ul className="space-y-2">
            {options.map(option => (
              <li key={option.id} className="flex items-center gap-3">
                <input type="radio" name="option" checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} className="accent-blue-600 w-4 h-4" />
                <span className="text-base text-gray-800 dark:text-gray-200">{option.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Webhook Management */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Webhooks</h2>
          <div className="flex gap-2 mb-3">
            <input value={newWebhookName} onChange={e => setNewWebhookName(e.target.value)} placeholder="Webhook Name..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
            <select value={newWebhookType} onChange={e => setNewWebhookType(e.target.value as any)} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
              <option value="initial">Initial</option>
              <option value="final">Final</option>
              <option value="backup">Backup</option>
              <option value="other">Other</option>
            </select>
            <input value={newWebhook} onChange={e => setNewWebhook(e.target.value)} placeholder="Add webhook URL..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
            <button onClick={addWebhook} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition">Add</button>
          </div>
          <ul className="space-y-3">
            {webhooks.map(webhook => (
              <li key={webhook.id} className={`flex flex-col gap-2 p-3 rounded-lg border ${selectedWebhook === webhook.id ? 'border-blue-500 shadow-lg' : 'border-gray-300 dark:border-gray-700'}`} style={{ background: 'rgba(0,0,0,0.02)' }}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="webhook" checked={selectedWebhook === webhook.id} onChange={() => setSelectedWebhook(webhook.id)} className="accent-blue-600 w-4 h-4" />
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
                    onChange={e => editWebhook(webhook.id, webhook.url, webhook.name, e.target.value as any)}
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
                    onChange={e => setMakeApiKeyForWebhook(webhook.id, e.target.value)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Send to Webhook */}
        <section className="flex flex-col items-center gap-3">
          <button
            onClick={sendToWebhook}
            disabled={sending || !transcript || !selectedOption || !selectedWebhook}
            className="px-8 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-lg shadow-md transition disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send to Webhook"}
          </button>
          {sendResult && (
            <div className="mt-2 text-sm whitespace-pre-line text-center max-w-xl">
              {/* Only show status, not raw JSON response */}
              {sendResult.split('Response:')[0].trim()}
            </div>
          )}
        </section>
        {/* Stepper UI for editing webhook fields as a modal */}
        {stepperFields.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <section className="w-full max-w-xl mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[90vh] overflow-hidden">
              <button
                onClick={() => { setStepperFields([]); setStepperComplete(false); setStepperIndex(0); setStepperValues({}); }}
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
                        onClick={() => handleStepperSkip(stepperFields[stepperIndex].cell)}
                        className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium transition text-sm"
                      >Skip</button>
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
                      onChange={e => setSelectedFinalWebhook(e.target.value)}
                    >
                      {webhooks.map(w => (
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
      </div>

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
            <h2 className="text-xl font-bold mb-4 text-center">Manage Options</h2>
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
    </div>
  );
}
