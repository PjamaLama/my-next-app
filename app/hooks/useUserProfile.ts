"use client";

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getDb } from '../providers/FirebaseProvider';

interface UseUserProfileReturn {
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  saveGeminiApiKey: (key: string) => Promise<void>;
  waId: string | null;
  message_count: number;
  userType: 'free' | 'pro';
}

/**
 * Custom hook for user profile management
 */
export const useUserProfile = (user: User | null): UseUserProfileReturn => {
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [waId, setWaId] = useState<string | null>(null);
  const [message_count, setMessage_count] = useState(0);
  const [userType, setUserType] = useState<'free' | 'pro'>('free');

  const db = getDb();

  // Ensure a user profile subdocument exists
  useEffect(() => {
    if (!user || !db) return;

    const ensureUserDoc = async () => {
      try {
        const profileRef = doc(db, "users", user.uid, "private", "profile");
        const userDocRef = doc(db, "users", user.uid);
        const snap = await onSnapshot(profileRef, () => {}); // Just to check existence

        const baseData: Record<string, unknown> = {
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          lastLoginAt: serverTimestamp(),
          selectedSheetNames: [],
          defaultSpreadsheetId: "",
          userType: 'free',
        };

        // Check if profile exists
        const profileSnap = await getDoc(profileRef);
        if (!profileSnap.exists()) {
          baseData.createdAt = serverTimestamp();
        }

        await setDoc(profileRef, baseData, { merge: true });

        // Denormalize: Also store message_count and last_reset on the main user document
        const denormalizedData: Record<string, unknown> = {
          message_count: 0,
          last_reset: serverTimestamp(),
        };
        await setDoc(userDocRef, denormalizedData, { merge: true });
        console.log(`Denormalized user data for ${user.uid}`);
      } catch (e) {
        console.error("Error ensuring user document:", e);
      }
    };

    void ensureUserDoc();
  }, [user, db]);

  // Load profile fields (Gemini API key) from profile subdocument
  useEffect(() => {
    if (!user || !db) {
      setWaId(null);
      setMessage_count(0);
      return;
    }

    const profileRef = doc(db, "users", user.uid, "private", "profile");
    const userDocRef = doc(db, "users", user.uid);

    const unsubProfileDoc = onSnapshot(profileRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
        setUserType(data.userType === 'pro' ? 'pro' : 'free');
      } else {
        // If profile doesn't exist, create it with initial values
        await setDoc(profileRef, {
          geminiApiKey: '',
          userType: 'free'
        }, { merge: true });
      }
    });

    // Listener for the main user document to get wa_id and denormalized message_count
    const unsubUserDoc = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMessage_count(data.message_count || 0);
        setWaId(data.wa_id || null);
      } else {
        setWaId(null);
        setMessage_count(0);
      }
    });

    return () => {
      unsubUserDoc();
      unsubProfileDoc();
    };
  }, [user, db]);

  // Save Gemini API key to Firestore
  const saveGeminiApiKey = async (key: string) => {
    if (!user || !db) return;

    try {
      await setDoc(doc(db, "users", user.uid, "private", "profile"), { geminiApiKey: key.trim() }, { merge: true });
      setGeminiApiKey(key.trim());
      return Promise.resolve();
    } catch (e) {
      console.error("Error saving Gemini API key:", e);
      return Promise.reject(e);
    }
  };

  return {
    geminiApiKey,
    setGeminiApiKey,
    saveGeminiApiKey,
    waId,
    message_count,
    userType
  };
};
