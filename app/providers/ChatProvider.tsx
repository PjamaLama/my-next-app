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
  // Add any other essential fields you expect from N8N
  tables?: any[];
  insights?: string[];
  quickReplies?: string[];
}

interface ChatContextType {
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loading: boolean;
  error: string | null;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>;
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
      await addDoc(messagesColRef, {
        ...message,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message.");
    }
  };

  const value = {
    chatMessages,
    setChatMessages, // Keep for direct manipulation if needed, e.g., optimistic updates
    loading,
    error,
    addMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
