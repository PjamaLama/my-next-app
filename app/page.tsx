"use client";
import React, { useState, useRef, useEffect } from "react";

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
  headers?: WebhookHeader[];
}

// Helpers for localStorage
const OPTIONS_KEY = "speech_to_text_options";
const WEBHOOKS_KEY = "speech_to_text_webhooks";

function loadOptions(): Option[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OPTIONS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveOptions(options: Option[]) {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
}
function loadWebhooks(): Webhook[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WEBHOOKS_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveWebhooks(webhooks: Webhook[]) {
  localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(webhooks));
}

// Helper for default header types
const HEADER_TYPE_SECRET = 'X-Webhook-Secret';
const HEADER_TYPE_BEARER = 'Authorization';
const HEADER_TYPE_MAKE_APIKEY = 'x-make-apikey';

export default function Home() {
  // Speech to text
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Options
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [selectedOption, setSelectedOption] = useState<string>("");

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newWebhook, setNewWebhook] = useState("");
  const [selectedWebhook, setSelectedWebhook] = useState<string>("");
  // For editing headers
  const [editingHeadersFor, setEditingHeadersFor] = useState<string | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  // For simple secret/api key
  const [secretTypeFor, setSecretTypeFor] = useState<{ [webhookId: string]: 'secret' | 'bearer' }>({});
  const [secretValueFor, setSecretValueFor] = useState<{ [webhookId: string]: string }>({});
  const [showAdvancedHeadersFor, setShowAdvancedHeadersFor] = useState<{ [webhookId: string]: boolean }>({});

  // For Make.com API key
  const [makeApiKeyFor, setMakeApiKeyFor] = useState<{ [webhookId: string]: string }>({});

  // Load from localStorage on mount
  useEffect(() => {
    setOptions(loadOptions());
    setWebhooks(loadWebhooks());
  }, []);

  // Save options/webhooks to localStorage
  useEffect(() => { saveOptions(options); }, [options]);
  useEffect(() => { saveWebhooks(webhooks); }, [webhooks]);

  // Speech recognition setup
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = "en-US";
    recognitionRef.current.onresult = (event: any) => {
      setTranscript(event.results[0][0].transcript);
      setListening(false);
    };
    recognitionRef.current.onerror = () => setListening(false);
    recognitionRef.current.onend = () => setListening(false);
  }, []);

  // When secret/api key changes, update the headers for that webhook
  const setSecretForWebhook = (webhookId: string, value: string, type: 'secret' | 'bearer') => {
    setSecretValueFor(v => ({ ...v, [webhookId]: value }));
    setSecretTypeFor(t => ({ ...t, [webhookId]: type }));
    setWebhooks(webhooks.map(w => {
      if (w.id !== webhookId) return w;
      let headers = (w.headers || []).filter(h => h.key !== HEADER_TYPE_SECRET && h.key !== HEADER_TYPE_BEARER);
      if (value) {
        if (type === 'secret') {
          headers = [...headers, { id: 'secret', key: HEADER_TYPE_SECRET, value }];
        } else {
          headers = [...headers, { id: 'bearer', key: HEADER_TYPE_BEARER, value: `Bearer ${value}` }];
        }
      }
      return { ...w, headers };
    }));
  };
  // When loading webhooks, initialize secret fields
  useEffect(() => {
    const newSecretType: { [webhookId: string]: 'secret' | 'bearer' } = {};
    const newSecretValue: { [webhookId: string]: string } = {};
    webhooks.forEach(w => {
      const secretHeader = (w.headers || []).find(h => h.key === HEADER_TYPE_SECRET);
      const bearerHeader = (w.headers || []).find(h => h.key === HEADER_TYPE_BEARER);
      if (bearerHeader) {
        newSecretType[w.id] = 'bearer';
        newSecretValue[w.id] = bearerHeader.value.replace(/^Bearer /, '');
      } else if (secretHeader) {
        newSecretType[w.id] = 'secret';
        newSecretValue[w.id] = secretHeader.value;
      } else {
        newSecretType[w.id] = 'secret';
        newSecretValue[w.id] = '';
      }
    });
    setSecretTypeFor(newSecretType);
    setSecretValueFor(newSecretValue);
  }, [webhooks.length]);

  // When Make.com API key changes, update the headers for that webhook
  const setMakeApiKeyForWebhook = (webhookId: string, value: string) => {
    setMakeApiKeyFor(v => ({ ...v, [webhookId]: value }));
    setWebhooks(webhooks.map(w => {
      if (w.id !== webhookId) return w;
      let headers = (w.headers || []).filter(h => h.key !== HEADER_TYPE_MAKE_APIKEY);
      if (value) {
        headers = [...headers, { id: 'make-apikey', key: HEADER_TYPE_MAKE_APIKEY, value }];
      }
      return { ...w, headers };
    }));
  };
  // When loading webhooks, initialize Make.com API key fields
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
  }, [webhooks.length]);

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
  const addOption = () => {
    if (!newOption.trim()) return;
    const option: Option = { id: Date.now().toString(), label: newOption.trim() };
    setOptions([...options, option]);
    setNewOption("");
  };
  const deleteOption = (id: string) => {
    setOptions(options.filter(o => o.id !== id));
    if (selectedOption === id) setSelectedOption("");
  };
  const editOption = (id: string, label: string) => {
    setOptions(options.map(o => o.id === id ? { ...o, label } : o));
  };

  // Webhook management
  const addWebhook = () => {
    if (!newWebhook.trim()) return;
    const webhook: Webhook = { id: Date.now().toString(), url: newWebhook.trim(), headers: [] };
    setWebhooks([...webhooks, webhook]);
    setNewWebhook("");
  };
  const deleteWebhook = (id: string) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
    if (selectedWebhook === id) setSelectedWebhook("");
  };
  const editWebhook = (id: string, url: string) => {
    setWebhooks(webhooks.map(w => w.id === id ? { ...w, url } : w));
  };
  // Header management
  const addHeader = (webhookId: string) => {
    if (!newHeaderKey.trim()) return;
    setWebhooks(webhooks.map(w => {
      if (w.id !== webhookId) return w;
      const headers = w.headers || [];
      return {
        ...w,
        headers: [...headers, { id: Date.now().toString(), key: newHeaderKey.trim(), value: newHeaderValue }],
      };
    }));
    setNewHeaderKey("");
    setNewHeaderValue("");
  };
  const editHeader = (webhookId: string, headerId: string, key: string, value: string) => {
    setWebhooks(webhooks.map(w => {
      if (w.id !== webhookId) return w;
      return {
        ...w,
        headers: (w.headers || []).map(h => h.id === headerId ? { ...h, key, value } : h),
      };
    }));
  };
  const deleteHeader = (webhookId: string, headerId: string) => {
    setWebhooks(webhooks.map(w => {
      if (w.id !== webhookId) return w;
      return {
        ...w,
        headers: (w.headers || []).filter(h => h.id !== headerId),
      };
    }));
  };

  // Send to webhook
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<any>(null);
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
    } catch (e: any) {
      setSendResult("Error: " + (e?.message || e?.toString()));
      if (typeof window !== "undefined" && window.console) {
        // Log full error to browser console
        console.error("Webhook send error:", e);
      }
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#18181b] via-[#23232a] to-[#0a0a0a] dark:from-[#18181b] dark:via-[#23232a] dark:to-[#0a0a0a] p-4">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        <header className="mb-4 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Speech to Text Webhook App</h1>
          <p className="text-base text-gray-400">Transcribe speech, select an option, and send to your Make.com webhook.</p>
        </header>

        {/* Speech to Text */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Speech Recognition</h2>
          <div className="flex gap-3 flex-wrap">
            <button onClick={startListening} disabled={listening} className="px-5 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50">Start Listening</button>
            <button onClick={stopListening} disabled={!listening} className="px-5 py-2 rounded-lg font-medium bg-gray-400 hover:bg-gray-500 text-white transition disabled:opacity-50">Stop</button>
          </div>
          <div className="transcript-box mt-2 shadow-inner border border-gray-300 dark:border-gray-700">{transcript || <span style={{ opacity: 0.5 }}>Transcript will appear here...</span>}</div>
        </section>

        {/* Options Management */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Options</h2>
          <div className="flex gap-2 mb-3">
            <input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Add option..." className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 flex-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
            <button onClick={addOption} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition">Add</button>
          </div>
          <ul className="space-y-2">
            {options.map(option => (
              <li key={option.id} className="flex items-center gap-3">
                <input type="radio" name="option" checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} className="accent-blue-600 w-4 h-4" />
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

        {/* Webhook Management */}
        <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-6 space-y-4 border border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Webhooks</h2>
          <div className="flex gap-2 mb-3">
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
                    onChange={e => editWebhook(webhook.id, e.target.value)}
                  />
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
          {sendResult && <div className="mt-2 text-sm whitespace-pre-line text-center max-w-xl">{sendResult}</div>}
          {lastPayload && (
            <div className="mt-2 text-xs w-full max-w-xl">
              <div className="font-semibold mb-1">Payload being sent:</div>
              <pre className="bg-black/10 dark:bg-white/10 rounded p-2 overflow-x-auto">{JSON.stringify(lastPayload, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
