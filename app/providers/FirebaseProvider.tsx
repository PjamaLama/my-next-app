"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
}

const FirebaseContext = createContext<IFirebaseContext>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, signInWithGoogle, signOutUser }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 