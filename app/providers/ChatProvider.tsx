"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
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

// Each session will have its own chat messages collection
// No more global chat document

export const ChatProvider = ({ children }: ChatProviderProps) => {
  const { user } = useFirebase();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Session management state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, _setCurrentSessionId] = useState<string | null>(null);

  // Load and subscribe to sessions for the logged-in user
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setChatMessages([]);
      _setCurrentSessionId(null);
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
      
      // Remove duplicates by ID to prevent React key conflicts
      const uniqueSessions = loadedSessions.filter((session, index, self) => 
        index === self.findIndex(s => s.id === session.id)
      );
      
      // Debug logging for session management
      if (loadedSessions.length !== uniqueSessions.length) {
        console.warn('🔍 [ChatProvider] Duplicate sessions detected:', {
          total: loadedSessions.length,
          unique: uniqueSessions.length,
          duplicates: loadedSessions.length - uniqueSessions.length
        });
      }
      
      setSessions(uniqueSessions);
      
      // Set current session if none is selected
      if (!currentSessionId && uniqueSessions.length > 0) {
        _setCurrentSessionId(uniqueSessions[0].id);
      }
    }, (err) => {
      console.error("Error fetching sessions:", err);
      setError("Failed to load sessions.");
    });

    return () => {
      unsubscribe();
      // Clean up local state when unmounting
      setSessions([]);
      _setCurrentSessionId(null);
    };
  }, [user]); // Removed currentSessionId dependency to prevent infinite loop

  // Load and subscribe to chat messages for the current session
  useEffect(() => {
    if (!user || !currentSessionId) {
      setChatMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const messagesColRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
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
  }, [user, currentSessionId]);

  // Function to add a new message to the database
  const addMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    if (!user) {
      setError("You must be logged in to send messages.");
      return;
    }

    const messagesColRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    
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

  // Custom setCurrentSessionId that clears chat messages when switching sessions
  const setCurrentSessionId = (sessionId: string | null) => {
    // Clear current chat messages when switching sessions
    if (sessionId !== currentSessionId) {
      setChatMessages([]);
    }
    _setCurrentSessionId(sessionId);
  };

  // Session management functions
  const createSession = async (title?: string, spreadsheetId?: string, sheetNames?: string[]): Promise<string> => {
    if (!user) {
      setError("You must be logged in to create sessions.");
      return "";
    }

    try {
      // Check if we already have a session with the same context to prevent duplicates
      const existingSession = sessions.find(s => 
        s.spreadsheetId === spreadsheetId && 
        JSON.stringify(s.sheetNames) === JSON.stringify(sheetNames)
      );
      
      if (existingSession) {
        // Return existing session instead of creating a duplicate
        _setCurrentSessionId(existingSession.id);
        return existingSession.id;
      }

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
      // Clear chat messages when creating a new session
      setChatMessages([]);
      _setCurrentSessionId(docRef.id);
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
      // Delete all messages in the session first
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      const messagesSnapshot = await getDocs(messagesColRef);
      const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Then mark the session as deleted
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, { deleted: true }, { merge: true });
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        _setCurrentSessionId(sessions.length > 1 ? sessions[0].id : null);
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
    
    _setCurrentSessionId(sessions[0].id);
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
