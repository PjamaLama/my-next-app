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
          title: data.title ?? 'New Chat',
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
        messages?: Array<Omit<ChatMessage, 'timestamp'> & { timestamp?: string }>
      };
      const messages = (data.messages ?? []).map((m) => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      })) as ChatMessage[];
      setChatMessagesState(messages);
    });
    return () => unsub();
  }, [user, currentSessionId]);

  const persistMessages = useCallback(async (messages: ChatMessage[]) => {
    if (!user || !currentSessionId) return;
    const chatDocRef = doc(db, "users", user.uid, "chats", currentSessionId);
    const updatedAt = new Date().toISOString();
    const safeMessages = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    const last = messages[messages.length - 1];
    const lastMessageSnippet = last ? (last.content || '').slice(0, 120) : undefined;
    await setDoc(chatDocRef, { messages: safeMessages, updatedAt, lastMessageSnippet }, { merge: true });
  }, [user, currentSessionId]);

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
    const docRef = await addDoc(chatsRef, {
      title: title || "New Chat",
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
