"use client";

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '../providers/FirebaseProvider';

interface UseUserProfileReturn {
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  saveGeminiApiKey: (key: string) => Promise<void>;
  waId: string | null;
  message_count: number;
  userType: 'free' | 'pro';
  isBetaUser: boolean;
  subscription: {
    status: string;
    cancelledAt?: Date;
    endDate?: Date;
    plan?: string;
  } | null;
}

/**
 * Custom hook for user profile management
 */
export const useUserProfile = (user: User | null): UseUserProfileReturn => {
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [waId, setWaId] = useState<string | null>(null);
  const [message_count, setMessage_count] = useState(0);
  const [userType, setUserType] = useState<'free' | 'pro'>('free');
  const [isBetaUser, setIsBetaUser] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<{
    status: string;
    cancelledAt?: Date;
    endDate?: Date;
    plan?: string;
  } | null>(null);

  const db = getDb();

  // Ensure a user profile subdocument exists
  useEffect(() => {
    if (!user || !db) return;

    const ensureUserDoc = async () => {
      try {
        const profileRef = doc(db, "users", user.uid, "private", "profile");
        const userDocRef = doc(db, "users", user.uid);

        // Check if main user document exists first
        const userDocSnap = await getDoc(userDocRef);
        const userDocExists = userDocSnap.exists();

        // Check if profile subdocument exists
        const profileSnap = await getDoc(profileRef);
        const profileExists = profileSnap.exists();

        // Only initialize if both documents don't exist (truly new user)
        if (!userDocExists && !profileExists) {
          console.log(`Initializing new user: ${user.uid}`);

          // Initialize profile subdocument (without userType now)
          const profileData: Record<string, unknown> = {
            email: user.email || null,
            displayName: user.displayName || null,
            photoURL: user.photoURL || null,
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            selectedSheetNames: [],
            defaultSpreadsheetId: "",
          };

          await setDoc(profileRef, profileData);

          // Initialize main user document with message tracking AND userType
          const userData: Record<string, unknown> = {
            message_count: 0,
            last_reset: serverTimestamp(),
            wa_id: null,
            userType: 'free', // Moved here from profile
            email: user.email || null, // Add email to main document for admin search
            displayName: user.displayName || null, // Add displayName too for completeness
          };
          await setDoc(userDocRef, userData);

          console.log(`✅ Initialized new user data for ${user.uid}`);
        } else {
          // User exists, just update last login time (don't touch message_count, last_reset, or userType)
          await updateDoc(profileRef, {
            lastLoginAt: serverTimestamp()
          }).catch(err => {
            console.warn("Could not update last login time:", err);
          });

          // Check if email/displayName need to be migrated to main document for admin search
          const userDocSnap = await getDoc(userDocRef);
          const userDocData = userDocSnap.data();
          if (!userDocData?.email || !userDocData?.displayName) {
            const migrationData: any = {};
            if (!userDocData?.email && user.email) {
              migrationData.email = user.email;
            }
            if (!userDocData?.displayName && user.displayName) {
              migrationData.displayName = user.displayName;
            }
            if (Object.keys(migrationData).length > 0) {
              await updateDoc(userDocRef, migrationData).catch(err => {
                console.warn("Could not migrate email/displayName to main document:", err);
              });
            }
          }
        }
      } catch (e) {
        console.error("Error ensuring user document:", e);
      }
    };

    void ensureUserDoc();
  }, [user, db]);

  // Load profile fields (Gemini API key and subscription) from profile subdocument
  useEffect(() => {
    if (!user || !db) {
      setGeminiApiKey('');
      setSubscription(null);
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

        // Handle subscription data from profile
        const subscriptionData = data.subscription;
        setSubscription(subscriptionData ? {
          status: subscriptionData.status || 'inactive',
          cancelledAt: subscriptionData.cancelledAt?.toDate(),
          endDate: subscriptionData.endDate?.toDate(),
          plan: subscriptionData.plan || 'none'
        } : null);
      } else {
        // If profile doesn't exist, create it with initial values (NO userType here)
        await setDoc(profileRef, {
          geminiApiKey: '',
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          lastLoginAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          selectedSheetNames: [],
          defaultSpreadsheetId: ""
        }, { merge: true });
        setSubscription(null);
      }
    });

    // Listener for the main user document to get wa_id, message_count, userType, and isBetaUser
    const unsubUserDoc = onSnapshot(userDocRef, async (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMessage_count(data.message_count || 0);
        setWaId(data.wa_id || null);

        // Read userType directly from main document (it should already reflect subscription status)
        // The upgrade API and subscription management should keep this in sync
        setUserType(data.userType || 'free');
        setIsBetaUser(data.isBetaUser || false);
      } else {
        setWaId(null);
        setMessage_count(0);
        setUserType('free');
        setIsBetaUser(false);
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
    userType,
    isBetaUser,
    subscription
  };
};
