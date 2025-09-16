"use client";
import React, { createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, User, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { useAuth } from '../hooks/useAuth';
import { useUserProfile } from '../hooks/useUserProfile';


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
      
      // Intelligent persistence configuration for mobile compatibility
      const isMobile = () => {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent || '';
        return /Mobi|Android/i.test(ua) || /iP(ad|hone|od)/i.test(ua);
      };

      const isStandalonePWA = () => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      };

      // Use session persistence for mobile/PWA (more reliable for redirects)
      // Use local persistence for desktop (better for long-term sessions)
      const useSessionPersistence = isMobile() || isStandalonePWA();
      const persistence = useSessionPersistence ? browserSessionPersistence : browserLocalPersistence;

      console.log('🔥 Firebase persistence strategy:', {
        isMobile: isMobile(),
        isStandalonePWA: isStandalonePWA(),
        useSessionPersistence,
        persistenceType: useSessionPersistence ? 'session' : 'local'
      });

      setPersistence(auth, persistence).catch((error) => {
        console.warn('🔥 Failed to set auth persistence, falling back to in-memory:', error);
        // If storage is completely blocked (e.g., private browsing), auth still works but state won't persist
        // This is better than breaking the entire authentication flow
      });
      
      db = getFirestore(app);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

// Export db with null check
export const getDb = () => db;
export const getAuthInstance = () => auth;
export const getFirebaseAuth = () => auth;
export const getApp = () => app;

interface IFirebaseContext {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  saveGeminiApiKey: (key: string) => Promise<void>;
  authError: string | null;
  waId: string | null;
  message_count: number;
  userType: 'free' | 'pro';
  isBetaUser: boolean;
  continueWithGoogle?: (loginHint?: string) => Promise<void>;
}

const FirebaseContext = createContext<IFirebaseContext>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  geminiApiKey: "",
  setGeminiApiKey: () => {},
  saveGeminiApiKey: async () => {},
  authError: null,
  waId: null,
  message_count: 0,
  userType: 'free',
  isBetaUser: false,
  continueWithGoogle: async () => {}
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  // Use custom hooks for different concerns
  const auth = useAuth();
  const userProfile = useUserProfile(auth.user);



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

  // Debug: Log userType changes to help troubleshoot subscription issues
  React.useEffect(() => {
    console.log('🔥 FirebaseProvider userType changed:', {
      userType: userProfile.userType,
      userEmail: auth.user?.email,
      messageCount: userProfile.message_count
    });
  }, [userProfile.userType, auth.user?.email, userProfile.message_count]);

  // Listen for subscription update events to force refresh
  React.useEffect(() => {
    if (!auth.user) return;

    const handleSubscriptionUpdate = () => {
      console.log('🔥 FirebaseProvider: Received subscription update event, forcing profile refresh...');
      // The useUserProfile hook will handle the actual refresh via its own event listener
      // This just ensures the FirebaseProvider is aware of the update
    };

    window.addEventListener('subscription-updated', handleSubscriptionUpdate);

    return () => {
      window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
    };
  }, [auth.user]);

  return (
    <FirebaseContext.Provider value={{
      user: auth.user,
      loading: auth.loading,
      signInWithGoogle: auth.signInWithGoogle,
      signOutUser,
      geminiApiKey: userProfile.geminiApiKey,
      setGeminiApiKey: userProfile.setGeminiApiKey,
      saveGeminiApiKey: userProfile.saveGeminiApiKey,
      authError: auth.authError,
      waId: userProfile.waId,
      message_count: userProfile.message_count,
      userType: userProfile.userType,
      isBetaUser: userProfile.isBetaUser,
      continueWithGoogle: auth.continueWithGoogle
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 