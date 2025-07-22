"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyATi7NQrUOmdXkAL2h_BkWW-XThjqYd0L4",
  authDomain: "reportai-a721b.firebaseapp.com",
  projectId: "reportai-a721b",
  storageBucket: "reportai-a721b.firebasestorage.app",
  messagingSenderId: "253447818330",
  appId: "1:253447818330:web:4eee676588b7dcc9cd9c63",
  measurementId: "G-133407X3RX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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