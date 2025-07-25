"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

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
}

const FirebaseContext = createContext<IFirebaseContext>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  geminiApiKey: "",
  setGeminiApiKey: () => {},
  saveGeminiApiKey: async () => {},
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load Gemini API key from Firestore when user changes
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
      }
    });
    return () => unsubUserDoc();
  }, [user]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOutUser = async () => {
    await signOut(auth);
    setGeminiApiKey(""); // Clear API key on sign out
  };

  // Save Gemini API key to Firestore
  const saveGeminiApiKey = async (key: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { geminiApiKey: key.trim() }, { merge: true });
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
      saveGeminiApiKey
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 