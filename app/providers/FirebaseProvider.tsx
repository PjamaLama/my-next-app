"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB42SldA3_l6LZ6l2axTIdrMhvSrmcIMEU",
  authDomain: "report-ai-23599.firebaseapp.com",
  projectId: "report-ai-23599",
  storageBucket: "report-ai-23599.firebasestorage.app",
  messagingSenderId: "391138712655",
  appId: "1:391138712655:web:9d235f416a4e2b3776de3a",
  measurementId: "G-4PSKB5BJY1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);

interface IFirebaseContext {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  saveGeminiApiKey: (key: string) => Promise<void>;
  authError: string | null;
  betaTester: boolean;
  betaWaitlist: boolean;
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
  betaTester: false,
  betaWaitlist: false
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [betaTester, setBetaTester] = useState(false);
  const [betaWaitlist, setBetaWaitlist] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Ensure a user profile subdocument exists (under allowed subcollection rules)
  useEffect(() => {
    if (!user) return;
    const ensureUserDoc = async () => {
      try {
        const profileRef = doc(db, "users", user.uid, "private", "profile");
        const snap = await getDoc(profileRef);
        const baseData: Record<string, unknown> = {
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          lastLoginAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          baseData.createdAt = serverTimestamp();
          baseData.betaTester = true; // default allow access without global count
          baseData.betaWaitlist = false;
          setBetaTester(true);
          setBetaWaitlist(false);
        } else {
          const data = snap.data() as any;
          if (typeof data.betaTester !== 'boolean' && typeof data.betaWaitlist !== 'boolean') {
            baseData.betaTester = true;
            baseData.betaWaitlist = false;
            setBetaTester(true);
            setBetaWaitlist(false);
          } else {
            setBetaTester(!!data.betaTester);
            setBetaWaitlist(!!data.betaWaitlist);
          }
        }
        await setDoc(profileRef, baseData, { merge: true });
      } catch (e) {
        console.error("Error ensuring user document:", e);
      }
    };
    void ensureUserDoc();
  }, [user]);

  // Load profile fields (Gemini API key, beta flags) from profile subdocument
  useEffect(() => {
    if (!user) return;
    const profileRef = doc(db, "users", user.uid, "private", "profile");
    const unsubUserDoc = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
        setBetaTester(!!data.betaTester);
        setBetaWaitlist(!!data.betaWaitlist);
      }
    });
    return () => unsubUserDoc();
  }, [user]);

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      
      // Set custom OAuth parameters to improve sign-in experience
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      console.error("Firebase auth error:", error);
      
      // Handle unauthorized domain error specifically
      if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/unauthorized-domain') {
        setAuthError("This domain is not authorized for authentication. Please add this domain to your Firebase console's authorized domains list.");
      } else {
        const errorMessage = error && typeof error === 'object' && 'message' in error ? error.message : "Authentication failed. Please try again.";
        setAuthError(errorMessage as string);
      }
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      setGeminiApiKey(""); // Clear API key on sign out
      setBetaTester(false);
      setBetaWaitlist(false);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Save Gemini API key to Firestore
  const saveGeminiApiKey = async (key: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid, "private", "profile"), { geminiApiKey: key.trim() }, { merge: true });
      setGeminiApiKey(key.trim());
      return Promise.resolve();
    } catch (e) {
      console.error("Error saving Gemini API key:", e);
      return Promise.reject(e);
    }
  };

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      loading, 
      signInWithGoogle, 
      signOutUser,
      geminiApiKey,
      setGeminiApiKey,
      saveGeminiApiKey,
      authError,
      betaTester,
      betaWaitlist
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 