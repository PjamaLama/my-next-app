"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, useFirebase } from './FirebaseProvider';

// Basic message type
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  // Sanitized fields that Firestore can handle (no nested arrays)
  tables?: Array<{
    title: string;
    headers: string[];
    rowCount: number;
    summary: string;
    meta: {
      sheetName: string;
      operations: Record<string, any>;
      requiresConfirmation: boolean;
      isDryRun: boolean;
    };
  }>;
  insights?: string[];
  quickReplies?: string[];
}

// Session interface for chat sessions
export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  spreadsheetId?: string;
  sheetNames?: string[];
}

interface ChatContextType {
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loading: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
  
  // Session management
  sessions: ChatSession[];
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  createSession: (title?: string, spreadsheetId?: string, sheetNames?: string[]) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  ensureSession: () => Promise<string>;
  appendMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

interface ChatProviderProps {
  children: ReactNode;
}

// A simplified ID for the single chat document
const CHAT_DOC_ID = "global_chat";

export const ChatProvider = ({ children }: ChatProviderProps) => {
  const { user } = useFirebase();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session management state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load and subscribe to sessions for the logged-in user
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setCurrentSessionId(null);
      return;
    }

    const sessionsColRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsColRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSessions = snapshot.docs
        .filter(doc => !doc.data().deleted)
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
          } as ChatSession;
        });
      
      setSessions(loadedSessions);
      
      // Set current session if none is selected
      if (!currentSessionId && loadedSessions.length > 0) {
        setCurrentSessionId(loadedSessions[0].id);
      }
    }, (err) => {
      console.error("Error fetching sessions:", err);
      setError("Failed to load sessions.");
    });

    return () => unsubscribe();
  }, [user, currentSessionId]);

  // Load and subscribe to the single chat history for the logged-in user
  useEffect(() => {
    if (!user) {
      setChatMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const messagesColRef = collection(db, 'users', user.uid, 'chats', CHAT_DOC_ID, 'messages');
    const q = query(messagesColRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate(), // Convert Firestore Timestamp to Date
        } as ChatMessage;
      });
      setChatMessages(messages);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching chat history:", err);
      setError("Failed to load chat history.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Function to add a new message to the database
  const addMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    if (!user) {
      setError("You must be logged in to send messages.");
      return;
    }

    const messagesColRef = collection(db, 'users', user.uid, 'chats', CHAT_DOC_ID, 'messages');
    
    try {
      // Additional safety check: ensure no nested arrays exist
      const sanitizedMessage = {
        ...message,
        // Ensure arrays are properly flattened
        tables: Array.isArray(message.tables) ? message.tables.map(table => ({
          title: String(table.title || ''),
          headers: Array.isArray(table.headers) ? table.headers.map(h => String(h)) : [],
          rowCount: Number(table.rowCount || 0),
          summary: String(table.summary || ''),
          meta: {
            sheetName: String(table.meta?.sheetName || ''),
            operations: table.meta?.operations && typeof table.meta.operations === 'object' ? table.meta.operations : {},
            requiresConfirmation: Boolean(table.meta?.requiresConfirmation),
            isDryRun: Boolean(table.meta?.isDryRun)
          }
        })) : [],
        insights: Array.isArray(message.insights) ? message.insights.map(i => String(i)) : [],
        quickReplies: Array.isArray(message.quickReplies) ? message.quickReplies.map(q => String(q)) : [],
        timestamp: new Date(),
      };

      await addDoc(messagesColRef, sanitizedMessage);
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message.");
    }
  };

  // Session management functions
  const createSession = async (title?: string, spreadsheetId?: string, sheetNames?: string[]): Promise<string> => {
    if (!user) {
      setError("You must be logged in to create sessions.");
      return "";
    }

    try {
      const sessionData: any = {
        title: title || `Chat ${sessions.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
      };
      
      // Only add spreadsheet fields if they have values (Firestore doesn't allow undefined)
      if (spreadsheetId) {
        sessionData.spreadsheetId = spreadsheetId;
      }
      if (sheetNames && sheetNames.length > 0) {
        sessionData.sheetNames = sheetNames;
      }

      const sessionsColRef = collection(db, 'users', user.uid, 'sessions');
      const docRef = await addDoc(sessionsColRef, sessionData);
      
      const newSession: ChatSession = {
        id: docRef.id,
        ...sessionData,
      };
      
      setSessions(prev => [...prev, newSession]);
      setCurrentSessionId(docRef.id);
      return docRef.id;
    } catch (err) {
      console.error("Error creating session:", err);
      setError("Failed to create session.");
      return "";
    }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    if (!user) return;

    try {
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, { deleted: true }, { merge: true });
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(sessions.length > 1 ? sessions[0].id : null);
      }
    } catch (err) {
      console.error("Error deleting session:", err);
      setError("Failed to delete session.");
    }
  };

  const ensureSession = async (): Promise<string> => {
    if (currentSessionId) return currentSessionId;
    
    if (sessions.length === 0) {
      // Create a session without spreadsheet context as a fallback
      return await createSession();
    }
    
    setCurrentSessionId(sessions[0].id);
    return sessions[0].id;
  };

  const appendMessage = async (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> => {
    if (!user) return;

    try {
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      await addDoc(messagesColRef, {
        ...message,
        timestamp: new Date(),
      });

      // Update session message count and timestamp
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, {
        messageCount: (sessions.find(s => s.id === sessionId)?.messageCount || 0) + 1,
        updatedAt: new Date(),
      }, { merge: true });

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, messageCount: s.messageCount + 1, updatedAt: new Date() }
          : s
      ));
    } catch (err) {
      console.error("Error appending message:", err);
      setError("Failed to append message.");
    }
  };

  const value = {
    chatMessages,
    setChatMessages, // Keep for direct manipulation if needed, e.g., optimistic updates
    loading,
    error,
    addMessage,
    
    // Session management
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    deleteSession,
    ensureSession,
    appendMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
