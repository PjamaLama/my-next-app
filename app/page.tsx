"use client";
import React, { useState, useRef, useEffect } from "react";

// Types
interface Option {
  id: string;
  label: string;
}
interface Webhook {
  id: string;
  url: string;
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
    const webhook: Webhook = { id: Date.now().toString(), url: newWebhook.trim() };
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

  // Send to webhook
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const sendToWebhook = async () => {
    if (!transcript || !selectedOption || !selectedWebhook) {
      setSendResult("Please provide transcript, select an option, and a webhook.");
      return;
    }
    setSending(true);
    setSendResult(null);
    const webhookUrl = webhooks.find(w => w.id === selectedWebhook)?.url;
    if (!webhookUrl) {
      setSendResult("Invalid webhook selected.");
      setSending(false);
      return;
    }
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, option: options.find(o => o.id === selectedOption)?.label }),
      });
      if (res.ok) setSendResult("Sent successfully!");
      else setSendResult("Failed to send: " + res.statusText);
    } catch (e: any) {
      setSendResult("Error: " + e.message);
    }
    setSending(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Speech to Text App</h1>
      {/* Speech to Text */}
      <section className="space-y-2">
        <div className="flex gap-2">
          <button onClick={startListening} disabled={listening} className="px-4 py-2 rounded disabled:opacity-50">Start Listening</button>
          <button onClick={stopListening} disabled={!listening} className="px-4 py-2 rounded disabled:opacity-50">Stop</button>
        </div>
        <div className="transcript-box">{transcript || <span style={{ opacity: 0.5 }}>Transcript will appear here...</span>}</div>
      </section>

      {/* Options Management */}
      <section>
        <h2 className="font-semibold mb-2">Manage Options</h2>
        <div className="flex gap-2 mb-2">
          <input value={newOption} onChange={e => setNewOption(e.target.value)} placeholder="Add option..." className="border rounded px-2 py-1 flex-1" />
          <button onClick={addOption} className="px-3 py-1 rounded">Add</button>
        </div>
        <ul className="space-y-1">
          {options.map(option => (
            <li key={option.id} className="flex items-center gap-2">
              <input type="radio" name="option" checked={selectedOption === option.id} onChange={() => setSelectedOption(option.id)} />
              <input
                className="border rounded px-1 py-0.5 flex-1"
                value={option.label}
                onChange={e => editOption(option.id, e.target.value)}
              />
              <button onClick={() => deleteOption(option.id)} style={{ color: 'red', background: 'transparent' }}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      {/* Webhook Management */}
      <section>
        <h2 className="font-semibold mb-2">Manage Webhooks</h2>
        <div className="flex gap-2 mb-2">
          <input value={newWebhook} onChange={e => setNewWebhook(e.target.value)} placeholder="Add webhook URL..." className="border rounded px-2 py-1 flex-1" />
          <button onClick={addWebhook} className="px-3 py-1 rounded">Add</button>
        </div>
        <ul className="space-y-1">
          {webhooks.map(webhook => (
            <li key={webhook.id} className="flex items-center gap-2">
              <input type="radio" name="webhook" checked={selectedWebhook === webhook.id} onChange={() => setSelectedWebhook(webhook.id)} />
              <input
                className="border rounded px-1 py-0.5 flex-1"
                value={webhook.url}
                onChange={e => editWebhook(webhook.id, e.target.value)}
              />
              <button onClick={() => deleteWebhook(webhook.id)} style={{ color: 'red', background: 'transparent' }}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      {/* Send to Webhook */}
      <section>
        <button
          onClick={sendToWebhook}
          disabled={sending || !transcript || !selectedOption || !selectedWebhook}
          className="px-6 py-2 rounded disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send to Webhook"}
        </button>
        {sendResult && <div className="mt-2 text-sm">{sendResult}</div>}
      </section>
    </div>
  );
}
