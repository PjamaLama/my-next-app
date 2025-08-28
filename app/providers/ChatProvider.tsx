"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { useFirebase, getDb } from './FirebaseProvider';

// Basic message type
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'sent' | 'error';
  // Enhanced fields to support approve/reject/edit functionality
  tables?: Array<{
    title: string;
    headers: string[];
    rows: string; // Stored as JSON string in Firestore to avoid nested array issues
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
}

// Session interface for chat sessions
export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  message_count: number;
  spreadsheetId?: string;
  sheetNames?: string[];
}

interface ChatContextType {
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp' | 'status'>) => Promise<void>;
  // Persist edits/removals to a message's tables so UI state survives snapshots
  updateMessageTables: (messageId: string, tables: Array<{
    title: string;
    headers: string[];
    rows: any; // 2D array in-memory; will be stringified when saving
    rowCount: number;
    summary: string;
    meta?: {
      sheetName?: string;
      operations?: Record<string, any>;
      requiresConfirmation?: boolean;
      isDryRun?: boolean;
    }
  }>) => Promise<void>;
  
  // Session management
  sessions: ChatSession[];

  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  createSession: (title?: string, spreadsheetId?: string, sheetNames?: string[]) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  ensureSession: () => Promise<string>;
  appendMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
  
  // Error recovery
  retrySessionLoad: () => void;
  retryCount: number;
  
  // Error handling
  clearErrorAndCreateSession: () => Promise<void>;

  // Chat title generation
  generateChatTitle: (sessionId: string) => Promise<string>;

  // AbortController for cancelling ongoing requests
  abortController: AbortController | null;
  setAbortController: (controller: AbortController | null) => void;
  cancelChatGeneration: () => void;
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
  const [error, setError] = useState<string | null>(null);

  // Session management state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, _setCurrentSessionId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Cache for instant chat switching
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});

  // Flag to prevent session switching during title generation
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  const cancelChatGeneration = useCallback(() => {
    if (abortController) {
      console.log('🔍 [ChatProvider] Aborting ongoing chat generation...');
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);



  // Load and subscribe to sessions for the logged-in user
  useEffect(() => {
    if (!user) {
      console.log('🔍 [ChatProvider] No user, clearing sessions');
      setSessions([]);
      setChatMessages([]);
      _setCurrentSessionId(null);
      return;
    }

    console.log('🔍 [ChatProvider] User authenticated, loading sessions for:', user.uid);

    const db = getDb();
    if (!db) return;

    const sessionsColRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsColRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('🔍 [ChatProvider] Session subscription fired - docs:', snapshot.docs.length, 'currentSessionId:', currentSessionId);
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
      
      console.log('🔍 [ChatProvider] Loaded sessions:', uniqueSessions.map(s => ({ id: s.id, title: s.title })));
      
      setSessions(uniqueSessions);

      // Set current session if none is selected
      if (!currentSessionId && uniqueSessions.length > 0) {
        console.log('🔍 [ChatProvider] Setting current session to first available:', uniqueSessions[0].id);
        setCurrentSessionId(uniqueSessions[0].id);
      } else if (currentSessionId) {
        console.log('🔍 [ChatProvider] Current session already set:', currentSessionId);
        // Check if current session still exists in the updated sessions
        const currentSessionExists = uniqueSessions.some(s => s.id === currentSessionId);
        if (!currentSessionExists && uniqueSessions.length > 0 && !isGeneratingTitle) {
          console.log('🔍 [ChatProvider] Current session no longer exists, switching to:', uniqueSessions[0].id);
          setCurrentSessionId(uniqueSessions[0].id);
        } else if (!currentSessionExists && uniqueSessions.length > 0 && isGeneratingTitle) {
          console.log('🔍 [ChatProvider] Skipping session switch during title generation');
        }
      } else if (uniqueSessions.length === 0) {
        // No sessions exist - create a new one automatically
        console.log('🔍 [ChatProvider] No sessions found, creating new session automatically');
        createSession('New Chat').then(newSessionId => {
          console.log('🔍 [ChatProvider] Auto-created new session:', newSessionId);
          setCurrentSessionId(newSessionId);
        }).catch(error => {
          console.error('🔍 [ChatProvider] Failed to auto-create session:', error);
          setError('Failed to create initial chat session. Please refresh the page.');
        });
      } else {
        console.log('🔍 [ChatProvider] No sessions available, currentSessionId remains null');
      }

      setError(null); // Clear any previous errors on successful load
    }, (err) => {
      console.error("Error fetching sessions:", err);
      setLastError(err);
      
      // Provide more specific error messages based on error type
      let errorMessage = "Failed to load sessions.";
      if (err.code === 'permission-denied') {
        errorMessage = "Access denied. Please check your permissions.";
      } else if (err.code === 'unavailable') {
        errorMessage = "Service temporarily unavailable. Please try again.";
      } else if (err.code === 'resource-exhausted') {
        errorMessage = "Service quota exceeded. Please try again later.";
      } else if (err.code === 'unauthenticated') {
        errorMessage = "Authentication required. Please sign in again.";
      }
      
      setError(errorMessage);
    });

    return () => {
      console.log('🔍 [ChatProvider] Cleaning up session subscription');
      unsubscribe();
      // Clean up local state when unmounting
      setSessions([]);
      setCurrentSessionId(null);
    };
  }, [user]); // Removed currentSessionId dependency to prevent infinite loop

  // Load and subscribe to chat messages for the current session ONLY
  useEffect(() => {
    console.log('🔍 [ChatProvider] Setting up message listener for session:', currentSessionId);

    if (!user || !currentSessionId) {
      console.log('🔍 [ChatProvider] Clearing messages - no user or session');
      setChatMessages([]);
      return;
    }

    const db = getDb();
    if (!db) {
      console.log('🔍 [ChatProvider] No database connection');
      return;
    }

    // Create subscription for THIS SPECIFIC session only
    const messagesColRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    const q = query(messagesColRef, orderBy('timestamp', 'asc'));

    console.log('🔍 [ChatProvider] Listening to messages for session:', currentSessionId);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('🔍 [ChatProvider] Message subscription fired for session:', currentSessionId, 'docs:', snapshot.docs.length);

      const messages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Parse table rows from JSON string back to array
          tables: Array.isArray(data.tables) ? data.tables.map(table => ({
            ...table,
            rows: table.rows && typeof table.rows === 'string' ?
              (() => { try { return JSON.parse(table.rows); } catch { return []; } })() :
              []
          })) : data.tables,
          timestamp: data.timestamp?.toDate(), // Convert Firestore Timestamp to Date
        } as ChatMessage;
      });

      console.log('🔍 [ChatProvider] Processing', messages.length, 'messages for session:', currentSessionId);

      // Cache the messages for instant switching
      setMessageCache(prev => ({
        ...prev,
        [currentSessionId]: messages
      }));

      // Update current chat messages (only if this is still the current session)
      console.log('🔍 [ChatProvider] Updating chatMessages state with', messages.length, 'messages');
      setChatMessages(messages);
      setError(null);
    }, (err) => {
      console.error("🔍 [ChatProvider] Error fetching messages for session", currentSessionId, ":", err);
      setError("Failed to load chat history.");
    });

    // Cleanup function - unsubscribe when session changes
    return () => {
      console.log('🔍 [ChatProvider] Unsubscribing from messages for session:', currentSessionId);
      unsubscribe();
    };
  }, [user, currentSessionId]); // Re-run when session changes

  // Function to add a new message to the database
  const addMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp' | 'status'>) => {
    if (!user) {
      setError("You must be logged in to send messages.");
      return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        sessionId = await ensureSession();
      } catch (error) {
        setError("Failed to create chat session. Please try again.");
        return;
      }
    }

    if (!sessionId) {
      setError("No active chat session. Please try again.");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      ...message,
      id: tempId,
      timestamp: new Date(),
      status: 'pending',
    };

    setChatMessages(prevMessages => [...prevMessages, optimisticMessage]);

    try {
      const db = getDb();
      if (!db) {
        setError("Firebase not initialized. Please refresh the page.");
        return;
      }
      
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      
      const sanitizedMessage = {
        ...message,
        tables: Array.isArray(message.tables) ? message.tables.map(table => ({
          title: String(table.title || ''),
          headers: Array.isArray(table.headers) ? table.headers.map(h => String(h)) : [],
          rows: Array.isArray(table.rows) ? JSON.stringify(table.rows) : '[]',
          rowCount: Number(table.rowCount || 0),
          summary: String(table.summary || ''),
          meta: {
            sheetName: String(table.meta?.sheetName || ''),
            operations: table.meta?.operations && typeof table.meta?.operations === 'object' ? table.meta.operations : {},
            requiresConfirmation: Boolean(table.meta?.requiresConfirmation),
            isDryRun: Boolean(table.meta?.isDryRun)
          }
        })) : [],
        insights: Array.isArray(message.insights) ? message.insights.map(i => String(i)) : [],
        timestamp: new Date(),
      };

      // The onSnapshot listener will automatically update the message list
      // once this write is complete, replacing the optimistic message.
      await addDoc(messagesColRef, sanitizedMessage);

      // Automatically generate AI title after first user message (background task)
      if (message.role === 'user') {
        // Check if this is the first message by looking at session message count
        const existingSession = sessions.find(s => s.id === sessionId);
        const isFirstMessage = (existingSession?.message_count || 0) === 0;

        console.log('🔍 [ChatProvider] Message sent - session:', sessionId, 'isFirst:', isFirstMessage, 'title:', existingSession?.title);

        // Generate title after FIRST user message for immediate context
        if (isFirstMessage) {
          // Only generate if it still has the default title
          if (existingSession && (existingSession.title.startsWith('Chat ') || existingSession.title === 'New Chat')) {
            console.log('🔍 [ChatProvider] Generating title for session:', sessionId, 'after first message');
            console.log('🔍 [ChatProvider] Current chatMessages length before title gen:', chatMessages.length);

            // Generate title immediately without delay - the onSnapshot will handle consistency
            setIsGeneratingTitle(true);
            generateChatTitle(sessionId).then(newTitle => {
              console.log('🔍 [ChatProvider] Title generated successfully:', newTitle);
              console.log('🔍 [ChatProvider] Current chatMessages length after title gen:', chatMessages.length);
            }).catch(error => {
              console.log('🔍 [ChatProvider] Auto title generation failed (non-blocking):', error);
            }).finally(() => {
              setIsGeneratingTitle(false);
            });
          } else {
            console.log('🔍 [ChatProvider] Skipping title generation - session not found or title already set:', {
              sessionExists: !!existingSession,
              title: existingSession?.title
            });
          }
        }
      }

    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message.");
      // Update the optimistic message to show an error state
      setChatMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === tempId ? { ...msg, status: 'error' } : msg
        )
      );
    }
  };

  // Instant session switching with caching
  const setCurrentSessionId = (sessionId: string | null) => {
    console.log('🔍 [setCurrentSessionId] Switching from', currentSessionId, 'to', sessionId);

    if (sessionId !== currentSessionId) {
      // Instantly show cached messages (or empty array) for immediate UI response
      const cachedMessages = messageCache[sessionId || ''] || [];
      setChatMessages(cachedMessages);

      // Update current session
      _setCurrentSessionId(sessionId);
    }
  };

  // Session management functions
  const createSession = async (title?: string, spreadsheetId?: string, sheetNames?: string[]): Promise<string> => {
    if (!user) {
      const errorMsg = "You must be logged in to create sessions.";
      console.error('🔍 [createSession] Error:', errorMsg);
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      console.log('🔍 [createSession] Starting with:', { title, spreadsheetId, sheetNames, existingSessionsCount: sessions.length });
      
      // Check if we already have a session with the same context to prevent duplicates
      // Allow multiple sessions for the same spreadsheet context - users might want separate chats
      // const existingSession = sessions.find(s => 
      //   s.spreadsheetId === spreadsheetId && 
      //   JSON.stringify(s.sheetNames) === JSON.stringify(sheetNames)
      // );
      
      // if (existingSession) {
      //   console.log('🔍 [createSession] Found existing session:', existingSession.id);
      //   // Return existing session instead of creating a duplicate
      //   setCurrentSessionId(existingSession.id);
      //   return existingSession.id;
      // }

      const sessionData: any = {
        title: title || `Chat ${sessions.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        message_count: 0,
      };
      
      // Only add spreadsheet fields if they have values (Firestore doesn't allow undefined)
      if (spreadsheetId) {
        sessionData.spreadsheetId = spreadsheetId;
      }
      if (sheetNames && sheetNames.length > 0) {
        sessionData.sheetNames = sheetNames;
      }

      console.log('🔍 [createSession] Creating session with data:', sessionData);
      
      const db = getDb();
      if (!db) {
        setError("Firebase not initialized. Please refresh the page.");
        throw new Error("Firebase not initialized");
      }
      
      const sessionsColRef = collection(db, 'users', user.uid, 'sessions');
      console.log('🔍 [createSession] Adding document to Firestore collection');
      const docRef = await addDoc(sessionsColRef, sessionData);
      console.log('🔍 [createSession] Document added with ID:', docRef.id);
      
      const newSession: ChatSession = {
        id: docRef.id,
        ...sessionData,
      };
      
      console.log('🔍 [createSession] Successfully created session:', docRef.id);
      console.log('🔍 [createSession] New session object:', newSession);
      
      console.log('🔍 [createSession] Updating local sessions state');
      setSessions(prev => {
        const newSessions = [...prev, newSession];
        console.log('🔍 [createSession] Updated sessions array:', newSessions);
        return newSessions;
      });
      
      // Clear chat messages when creating a new session
      console.log('🔍 [createSession] Clearing chat messages');
      setChatMessages([]);

      // Initialize cache for new session
      setMessageCache(prev => ({
        ...prev,
        [docRef.id]: [] // Empty array for new session
      }));

      console.log('🔍 [createSession] Setting current session ID to:', docRef.id);
      setCurrentSessionId(docRef.id);
      
      console.log('🔍 [createSession] Returning session ID:', docRef.id);
      return docRef.id;
    } catch (err) {
      const errorMsg = "Failed to create session.";
      console.error('🔍 [createSession] Error:', err);
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    if (!user) return;

    console.log('🔍 [ChatProvider] Starting deleteSession:', sessionId, 'current:', currentSessionId, 'total sessions:', sessions.length);

    try {
      const db = getDb();
      if (!db) {
        setError("Firebase not initialized. Please refresh the page.");
        return;
      }

      // Check if we're deleting the current session
      const isCurrentSession = currentSessionId === sessionId;
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      const willHaveNoSessions = remainingSessions.length === 0;

      console.log('🔍 [ChatProvider] Delete analysis:', {
        isCurrentSession,
        remainingSessionsCount: remainingSessions.length,
        willHaveNoSessions
      });

      // If deleting current session and it will leave no sessions, create new one first
      if (isCurrentSession && willHaveNoSessions) {
        console.log('🔍 [ChatProvider] Creating new session before deleting the last one');
        const newSessionId = await createSession('New Chat');
        console.log('🔍 [ChatProvider] New session created:', newSessionId);
        // The createSession function already sets this as current, so we don't need to do it again
      }
      // If deleting current session but there are others, switch to the first remaining session
      else if (isCurrentSession && remainingSessions.length > 0) {
        console.log('🔍 [ChatProvider] Switching to remaining session:', remainingSessions[0].id);
        setCurrentSessionId(remainingSessions[0].id);
      }

      // Delete all messages in the session first
      console.log('🔍 [ChatProvider] Deleting messages for session:', sessionId);
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      const messagesSnapshot = await getDocs(messagesColRef);
      const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Then mark the session as deleted (soft delete for data integrity)
      console.log('🔍 [ChatProvider] Marking session as deleted:', sessionId);
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, { deleted: true }, { merge: true });

      // Update local state immediately
      console.log('🔍 [ChatProvider] Updating local sessions state');
      setSessions(prev => {
        const updated = prev.filter(s => s.id !== sessionId);
        console.log('🔍 [ChatProvider] Sessions after deletion:', updated.length);
        return updated;
      });

      // Clean up cache for deleted session
      setMessageCache(prev => {
        const newCache = { ...prev };
        delete newCache[sessionId];
        return newCache;
      });

      console.log('🔍 [ChatProvider] Session deletion completed successfully');

    } catch (err) {
      console.error("🔍 [ChatProvider] Error deleting session:", err);
      setError("Failed to delete session.");
    }
  };

  const ensureSession = async (): Promise<string> => {
    console.log('🔍 [ensureSession] Starting with:', { currentSessionId, sessionsCount: sessions.length });

    // Sessions load instantly now, no need to wait
    
    if (currentSessionId) {
      console.log('🔍 [ensureSession] Using existing session:', currentSessionId);
      return currentSessionId;
    }
    
    if (sessions.length === 0) {
      console.log('🔍 [ensureSession] No sessions exist, creating new one');
      // Try to create a session with retries
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const newSessionId = await createSession();
          console.log('🔍 [ensureSession] Created new session:', newSessionId);
          
          if (newSessionId) {
            // Ensure the currentSessionId is set to the newly created session
            setCurrentSessionId(newSessionId);
            console.log('🔍 [ensureSession] Set currentSessionId to:', newSessionId);
            return newSessionId;
          } else {
            throw new Error('createSession returned empty string');
          }
        } catch (error) {
          attempts++;
          console.error(`🔍 [ensureSession] Attempt ${attempts} failed:`, error);
          
          if (attempts >= maxAttempts) {
            console.error('🔍 [ensureSession] All attempts failed');
            throw new Error('Failed to create new chat session after multiple attempts');
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      throw new Error('Failed to create new chat session');
    }
    
    // Use the first available session
    const firstSessionId = sessions[0].id;
    console.log('🔍 [ensureSession] Using first available session:', firstSessionId);
    setCurrentSessionId(firstSessionId);
    return firstSessionId;
  };

  const appendMessage = async (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> => {
    if (!user) return;

    try {
      const db = getDb();
      if (!db) {
        setError("Firebase not initialized. Please refresh the page.");
        return;
      }
      
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      await addDoc(messagesColRef, {
        ...message,
        timestamp: new Date(),
      });

      // Update session message count and timestamp
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, {
        message_count: (sessions.find(s => s.id === sessionId)?.message_count || 0) + 1,
        updatedAt: new Date(),
      }, { merge: true });

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, message_count: s.message_count + 1, updatedAt: new Date() }
          : s
      ));
    } catch (err) {
      console.error("Error appending message:", err);
      setError("Failed to append message.");
    }
  };

  // Persist updated tables for a specific message in the current session
  const updateMessageTables = async (
    messageId: string,
    tables: Array<{
      title: string;
      headers: string[];
      rows: any;
      rowCount: number;
      summary: string;
      meta?: {
        sheetName?: string;
        operations?: Record<string, any>;
        requiresConfirmation?: boolean;
        isDryRun?: boolean;
      }
    }>
  ): Promise<void> => {
    if (!user || !currentSessionId) return;

    try {
      const db = getDb();
      if (!db) {
        setError("Firebase not initialized. Please refresh the page.");
        return;
      }
      
      const messageDocRef = doc(db, 'users', user.uid, 'sessions', currentSessionId, 'messages', messageId);

      // Sanitize tables for Firestore: stringify rows, coerce types
      const sanitizedTables = Array.isArray(tables)
        ? tables.map((table) => ({
            title: String(table.title || ''),
            headers: Array.isArray(table.headers) ? table.headers.map((h) => String(h)) : [],
            rows: Array.isArray(table.rows) ? JSON.stringify(table.rows) : '[]',
            rowCount: Number(table.rowCount || (Array.isArray(table.rows) ? table.rows.length : 0)),
            summary: String(table.summary || ''),
            meta: {
              sheetName: String(table.meta?.sheetName || ''),
              operations: table.meta?.operations && typeof table.meta.operations === 'object' ? table.meta.operations : {},
              requiresConfirmation: Boolean(table.meta?.requiresConfirmation),
              isDryRun: Boolean(table.meta?.isDryRun),
            },
          }))
        : [];

      await setDoc(messageDocRef, { tables: sanitizedTables }, { merge: true });
    } catch (err) {
      console.error('Failed to update message tables:', err);
      setError('Failed to update message tables.');
    }
  };

  const clearErrorAndCreateSession = async () => {
    setError(null);
    try {
      const newSessionId = await createSession('New Chat');
      setCurrentSessionId(newSessionId);
      console.log('🔍 [ChatProvider] Successfully created new session:', newSessionId);
    } catch (error) {
      console.error('🔍 [ChatProvider] Failed to create session:', error);
      setError('Failed to create chat session. Please try again.');
      throw error; // Re-throw so calling component can handle it
    }
  };

  // Generate AI-powered title for a chat session
  const generateChatTitle = async (sessionId: string): Promise<string> => {
    if (!user || !sessionId) {
      throw new Error('User not authenticated or invalid session');
    }

    try {
      console.log('🔍 [ChatProvider] Generating AI title for session:', sessionId);

      const db = getDb();
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Get the messages for this session to generate a title
      const messagesColRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      const q = query(messagesColRef, orderBy('timestamp', 'asc'));
      const messagesSnapshot = await getDocs(q);

      const messages = messagesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          role: data.role,
          content: String(data.content || '')
        };
      });

      if (messages.length === 0) {
        throw new Error('No messages found to generate title from');
      }

      // Call the generate-chat-title API
      const response = await fetch('/api/generate-chat-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      if (!response.ok) {
        throw new Error('Failed to generate chat title');
      }

      const result = await response.json();
      const newTitle = result.title || 'New Chat';

      // Update the session with the new title - use updateDoc instead of setDoc to be more precise
      const sessionDocRef = doc(db, 'users', user.uid, 'sessions', sessionId);
      await setDoc(sessionDocRef, { title: newTitle }, { merge: true });

      console.log('🔍 [ChatProvider] Successfully generated and saved title:', newTitle);

      // Update local state immediately to avoid subscription delay
      setSessions(prev => prev.map(session =>
        session.id === sessionId
          ? { ...session, title: newTitle }
          : session
      ));

      return newTitle;

    } catch (error) {
      console.error('🔍 [ChatProvider] Failed to generate chat title:', error);
      throw error;
    }
  };

      const value = {
    chatMessages,
    setChatMessages, // Keep for direct manipulation if needed, e.g., optimistic updates
    error,
    setError, // Expose setError
    addMessage,
    updateMessageTables,

    // Session management
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    deleteSession,
    ensureSession,
    appendMessage,

    // Error handling
    clearErrorAndCreateSession,

    // Chat title generation
    generateChatTitle,

    // AbortController for cancelling ongoing requests
    abortController,
    setAbortController,
    cancelChatGeneration,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
