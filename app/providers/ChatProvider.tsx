"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, setDoc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./FirebaseProvider";
import { useFirebase } from "./FirebaseProvider";

// Re-exported for consumers
export type ChatMessage = {
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
  charts?: Array<{ kind: 'bar' | 'line' | 'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }>; options?: unknown }>;
  insights?: string[];
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastMessageSnippet?: string;
};

interface ChatContextShape {
  sessions: ChatSession[];
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  createSession: (title?: string) => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  appendMessage: (message: ChatMessage) => Promise<void>;
  ensureSession: () => Promise<string | null>;
}

const ChatContext = createContext<ChatContextShape | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessagesState] = useState<ChatMessage[]>([]);

  // Subscribe to sessions for the current user
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setCurrentSessionId(null);
      setChatMessagesState([]);
      return;
    }
    const chatsRef = collection(db, "users", user.uid, "chats");
    const q = query(chatsRef, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: ChatSession[] = snap.docs.map((d) => {
        const data = d.data() as {
          title?: string;
          createdAt?: string;
          updatedAt?: string;
          lastMessageSnippet?: string;
        };
        return {
          id: d.id,
          title: (data.title ?? '').trim(),
          createdAt: data.createdAt ?? new Date().toISOString(),
          updatedAt: data.updatedAt ?? new Date().toISOString(),
          lastMessageSnippet: data.lastMessageSnippet ?? '',
        };
      });
      setSessions(list);
      // If no current session, pick the most recent
      if (!currentSessionId && list.length > 0) {
        setCurrentSessionId(list[0].id);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Subscribe to current session's messages
  useEffect(() => {
    if (!user || !currentSessionId) {
      setChatMessagesState([]);
      return;
    }
    const chatDocRef = doc(db, "users", user.uid, "chats", currentSessionId);
    const unsub = onSnapshot(chatDocRef, (snap) => {
      if (!snap.exists()) {
        setChatMessagesState([]);
        return;
      }
      const data = snap.data() as {
        messages?: Array<(Omit<ChatMessage, 'timestamp'> & { timestamp?: string }) & { tablesJson?: string; chartsJson?: string; insightsJson?: string }>
      };
      const messages = (data.messages ?? []).map((m) => {
        const out: any = { ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() };
        if ((m as any).tablesJson && !out.tables) {
          try { out.tables = JSON.parse((m as any).tablesJson); } catch {}
        }
        if ((m as any).chartsJson && !out.charts) {
          try { out.charts = JSON.parse((m as any).chartsJson); } catch {}
        }
        if ((m as any).insightsJson && !out.insights) {
          try { out.insights = JSON.parse((m as any).insightsJson); } catch {}
        }
        return out as ChatMessage;
      }) as ChatMessage[];
      setChatMessagesState(messages);
    });
    return () => unsub();
  }, [user, currentSessionId]);

  const persistMessages = useCallback(async (messages: ChatMessage[]) => {
    if (!user || !currentSessionId) return;
    const chatDocRef = doc(db, "users", user.uid, "chats", currentSessionId);
    const updatedAt = new Date().toISOString();

    // Recursively remove undefined values from any object/array to satisfy Firestore
    const cleanForFirestore = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((v) => cleanForFirestore(v)).filter((v) => v !== undefined);
      }
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (v === undefined) continue;
          const cleaned = cleanForFirestore(v as unknown);
          if (cleaned !== undefined) out[k] = cleaned;
        }
        return out;
      }
      return value === undefined ? null : value;
    };
    const safeMessages = messages.map((m) => {
      const copy: Record<string, unknown> = { ...m } as Record<string, unknown>;
      // Convert timestamp to ISO
      if (copy.timestamp instanceof Date) {
        copy.timestamp = (copy.timestamp as Date).toISOString();
      }
      // Persist tables as JSON string to avoid nested array limitations
      if ('tables' in copy && Array.isArray((copy as any).tables)) {
        try { (copy as any).tablesJson = JSON.stringify((copy as any).tables); } catch {}
        delete (copy as any).tables;
      }
      // Persist charts as JSON string similarly
      if ('charts' in copy && Array.isArray((copy as any).charts)) {
        try { (copy as any).chartsJson = JSON.stringify((copy as any).charts); } catch {}
        delete (copy as any).charts;
      }
      if ('insights' in copy && Array.isArray((copy as any).insights)) {
        try { (copy as any).insightsJson = JSON.stringify((copy as any).insights); } catch {}
        delete (copy as any).insights;
      }
      // Defensive: strip any top-level field that is an array of arrays
      for (const key of Object.keys(copy)) {
        const value = copy[key];
        if (Array.isArray(value) && (value as unknown[]).some((el) => Array.isArray(el))) {
          delete (copy as any)[key];
        }
      }
      // Deep clean undefined values from the message payload
      return cleanForFirestore(copy) as ChatMessage;
    });
    const last = messages[messages.length - 1];
    const lastMessageSnippet = last ? (last.content || '').slice(0, 120) : '';
    const payload = cleanForFirestore({ messages: safeMessages, updatedAt, lastMessageSnippet });
    await setDoc(chatDocRef, payload as Record<string, unknown>, { merge: true });

    // Try to auto-generate a title after the first meaningful message
    try {
      const current = sessions.find(s => s.id === currentSessionId);
      const existingTitle = (current?.title || '').trim();
      const hasUserContent = messages.some(m => m.role === 'user' && (m.content || '').trim().length > 0);
      if (!existingTitle && hasUserContent) {
        const messagesForTitle = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
        const resp = await fetch('/api/generate-chat-title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesForTitle })
        });
        if (resp.ok) {
          const { title: aiTitle } = await resp.json();
          const finalTitle = (aiTitle || '').trim();
          if (finalTitle && finalTitle.toLowerCase() !== 'new chat') {
            await updateDoc(chatDocRef, { title: finalTitle });
          }
        }
      }
    } catch (e) {
      // Best effort only; ignore failures silently
      console.warn('AI title generation (post-message) failed:', e);
    }
  }, [user, currentSessionId, sessions]);

  // Expose a state-like setter that also persists
  const setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback((updater) => {
    setChatMessagesState((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: ChatMessage[]) => ChatMessage[])(prev) : (updater as ChatMessage[]);
      // Persist async (fire and forget)
      void persistMessages(next);
      return next;
    });
  }, [persistMessages]);

  const ensureSession = useCallback(async () => {
    if (!user) return null;
    if (currentSessionId) return currentSessionId;
    if (sessions.length > 0) {
      setCurrentSessionId(sessions[0].id);
      return sessions[0].id;
    }
    return await (async () => await createSession())();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentSessionId, sessions]);

  const createSession = useCallback(async (title?: string) => {
    if (!user) return null;
    const chatsRef = collection(db, "users", user.uid, "chats");
    const now = new Date().toISOString();
    const initialTitle = (title ?? '').trim();
    const docRef = await addDoc(chatsRef, {
      title: initialTitle,
      createdAt: now,
      updatedAt: now,
      lastMessageSnippet: "",
      messages: [],
    });
    setCurrentSessionId(docRef.id);
    return docRef.id;
  }, [user]);

  const deleteSession = useCallback(async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "chats", id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setChatMessagesState([]);
    }
  }, [user, currentSessionId]);

  const renameSession = useCallback(async (id: string, title: string) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "chats", id);
    await updateDoc(ref, { title });
  }, [user]);

  const appendMessage = useCallback(async (message: ChatMessage) => {
    setChatMessages((prev) => [...prev, message]);
  }, [setChatMessages]);

  const value: ChatContextShape = useMemo(() => ({
    sessions,
    currentSessionId,
    setCurrentSessionId,
    chatMessages,
    setChatMessages,
    createSession,
    deleteSession,
    renameSession,
    appendMessage,
    ensureSession,
  }), [sessions, currentSessionId, chatMessages, setChatMessages, createSession, deleteSession, renameSession, appendMessage, ensureSession]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = (): ChatContextShape => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
};
