"use client";
import React, { createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { useAuth } from '../hooks/useAuth';
import { useUserProfile } from '../hooks/useUserProfile';
import { useBetaFeatures } from '../hooks/useBetaFeatures';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only on the client side to prevent build-time errors
let app: any = null;
let auth: any = null;
let db: any = null;

if (typeof window !== 'undefined') {
  try {
    // Check if all required environment variables are available
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
      console.warn('Firebase configuration incomplete. Missing required environment variables.');
    } else {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      // Ensure durable session and avoid popup blockers/COOP issues
      setPersistence(auth, browserLocalPersistence).catch(() => {});
      db = getFirestore(app);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

// Export db with null check
export const getDb = () => db;
export const getAuthInstance = () => auth;
export const getApp = () => app;

interface IFirebaseContext {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  joinBeta: () => Promise<void>;
  signOutUser: () => Promise<void>;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  saveGeminiApiKey: (key: string) => Promise<void>;
  authError: string | null;
  betaTester: boolean;
  betaWaitlist: boolean;
  waId: string | null;
  message_count: number;
  continueWithGoogle?: (loginHint?: string) => Promise<void>;
}

const FirebaseContext = createContext<IFirebaseContext>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  joinBeta: async () => {},
  signOutUser: async () => {},
  geminiApiKey: "",
  setGeminiApiKey: () => {},
  saveGeminiApiKey: async () => {},
  authError: null,
  betaTester: false,
  betaWaitlist: false,
  waId: null,
  message_count: 0,
  continueWithGoogle: async () => {}
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  // Use custom hooks for different concerns
  const auth = useAuth();
  const userProfile = useUserProfile(auth.user);

  // Use beta features hook
  useBetaFeatures(auth.user);

  // Store minimal UI preference on login
  React.useEffect(() => {
    if (typeof window !== 'undefined' && auth.user) {
      try {
        localStorage.setItem('lastLoginTimestamp', Date.now().toString());
      } catch (_) {
        // ignore storage failures
      }
    }
  }, [auth.user]);

  // Enhanced sign out to clear all local state
  const signOutUser = async () => {
    await auth.signOutUser();
    // The profile state will be cleared by the useUserProfile hook when user becomes null
  };

  return (
    <FirebaseContext.Provider value={{
      user: auth.user,
      loading: auth.loading,
      signInWithGoogle: auth.signInWithGoogle,
      joinBeta: auth.joinBeta,
      signOutUser,
      geminiApiKey: userProfile.geminiApiKey,
      setGeminiApiKey: userProfile.setGeminiApiKey,
      saveGeminiApiKey: userProfile.saveGeminiApiKey,
      authError: auth.authError,
      betaTester: userProfile.betaTester,
      betaWaitlist: userProfile.betaWaitlist,
      waId: userProfile.waId,
      message_count: userProfile.message_count,
      continueWithGoogle: auth.continueWithGoogle
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 