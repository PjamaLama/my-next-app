"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence, GoogleAuthProvider, signOut, User, getRedirectResult } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [betaTester, setBetaTester] = useState(false);
  const [betaWaitlist, setBetaWaitlist] = useState(false);
  const [waId, setWaId] = useState<string | null>(null);
  const [message_count, setMessage_count] = useState(0);

  useEffect(() => {
    if (!auth) return;
    
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      console.log('🔍 [FirebaseProvider] Auth state changed:', { 
        hasUser: !!user, 
        userId: user?.uid
        // Removed email logging for security
      });
      setUser(user);
      setLoading(false);
      // Only store essential UI state, not user profile data
      if (typeof window !== 'undefined' && user) {
        try {
          // Store minimal UI preference only
          localStorage.setItem('lastLoginTimestamp', Date.now().toString());
        } catch (_) {
          // ignore storage failures
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Finalize pending redirect sign-in once after load
  useEffect(() => {
    if (!auth) return;
    
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          // Clear pending flag on successful redirect completion
          try { sessionStorage.setItem('authRedirectPending', '0'); } catch {}
          setUser(result.user);
          // Ensure beta flags are set server-side atomically
          try {
            const token = await result.user.getIdToken();
            await fetch('/api/beta-ensure', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch (_) {}
        }
      } catch (e) {
        // Clear pending flag on failure as well to avoid loops
        try { sessionStorage.setItem('authRedirectPending', '0'); } catch {}
      }
    })();
  }, []);

  // Removed post-auth redirects here to avoid navigation loops. The main page renders the chat when authenticated.

  // Ensure a user profile subdocument exists (under allowed subcollection rules)
  useEffect(() => {
    if (!user || !db) return;
    const ensureUserDoc = async () => {
      try {
        const profileRef = doc(db, "users", user.uid, "private", "profile");
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(profileRef);
        const baseData: Record<string, unknown> = {
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          lastLoginAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          baseData.createdAt = serverTimestamp();
          baseData.message_count = 0;
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
  }, [user]);

  // After login, ask server to atomically ensure beta tester/waitlist flags
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        await fetch('/api/beta-ensure', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Load profile fields (Gemini API key, beta flags) from profile subdocument
  useEffect(() => {
    if (!user || !db) {
        setWaId(null);
        setMessage_count(0);
        return;
    };

    const profileRef = doc(db, "users", user.uid, "private", "profile");
    const userDocRef = doc(db, "users", user.uid);

    const unsubProfileDoc = onSnapshot(profileRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
        setBetaTester(!!data.betaTester);
        setBetaWaitlist(!!data.betaWaitlist);
      } else {
        // If profile doesn't exist, create it with initial values
        await setDoc(profileRef, {
            message_count: 0,
            last_reset: serverTimestamp(),
            geminiApiKey: ''
        }, { merge: true });
      }
    });

    // Listener for the main user document to get wa_id and denormalized message_count
    const unsubUserDoc = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            // Handle denormalized message_count from main user document
            const lastReset = data.last_reset?.toDate();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (!lastReset || lastReset < today) {
              // If it's a new day, reset the count on both documents
              const resetData = {
                message_count: 0,
                last_reset: serverTimestamp()
              };
              await setDoc(userDocRef, resetData, { merge: true });
              await setDoc(profileRef, resetData, { merge: true });
              setMessage_count(0);
            } else {
              setMessage_count(data.message_count || 0);
            }

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
  }, [user]);

  const signInWithGoogle = async () => {
    if (!auth) {
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }
    
    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();

      // Set custom OAuth parameters to improve sign-in experience
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        // First, attempt to sign in with a popup
        await signInWithPopup(auth, provider);
      } catch (popupError: any) {
        // If the popup fails (e.g., blocked by browser), fall back to redirect
        console.warn('Popup sign-in failed, falling back to redirect.', popupError);
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectError: any) {
          console.error('Redirect sign-in also failed:', redirectError);
          // Handle the redirect error specifically, e.g., update UI
          setAuthError('Sign-in failed. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Firebase auth error:', error);
      const code = error?.code as string | undefined;
      if (code === 'auth/unauthorized-domain') {
        setAuthError("This domain is not authorized for authentication. Please add this domain to your Firebase console's authorized domains list.");
      } else if (
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user'
      ) {
        // Give users a clearer hint for popup-related issues
        setAuthError('Popup sign-in was blocked. Please allow popups for this site or try again.');
      } else {
        setAuthError(error?.message || 'Authentication failed. Please try again.');
      }
    }
  };

  // Common Google sign-in with popup first (desktop), redirect fallback (mobile/PWA/Safari)
  const startGoogleSignIn = async (provider: GoogleAuthProvider) => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    
    // Detect environments where popups are unreliable
    const isPopupUnreliable = (() => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
      const ua = navigator.userAgent || '';
      const isIOS = /iP(ad|hone|od)/i.test(ua);
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
      const isStandalonePWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const isMobile = /Mobi|Android/i.test(ua);
      return isIOS || isSafari || isStandalonePWA || isMobile;
    })();

    if (!isPopupUnreliable) {
      try {
        await signInWithPopup(auth, provider);
        try { sessionStorage.setItem('authRedirectPending', '0'); } catch {}
        return;
      } catch (popupError: any) {
        // Fallback to redirect for any popup failures
      }
    }
    try { sessionStorage.setItem('authRedirectPending', '1'); } catch {}
    await signInWithRedirect(auth, provider);
  };

  // Join Beta → Google sign-in
  const joinBeta = async () => {
    if (!auth) {
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }
    
    try {
      setAuthError(null);
      if (auth.currentUser) return;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await startGoogleSignIn(provider);
    } catch (error: any) {
      console.error('Firebase join beta error:', error);
      const code = error?.code as string | undefined;
      if (code === 'auth/unauthorized-domain') {
        setAuthError("This domain is not authorized for authentication. Please add this domain to your Firebase console's authorized domains list.");
      } else {
        setAuthError(error?.message || 'Authentication failed. Please try again.');
      }
    }
  };

  // Continue with Google using a login hint when we know the last email
  const continueWithGoogle = async (loginHint?: string) => {
    if (!auth) {
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }
    
    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (loginHint) provider.setCustomParameters({ login_hint: loginHint });
      await startGoogleSignIn(provider);
    } catch (error: any) {
      console.error('Firebase continue auth error:', error);
      setAuthError(error?.message || 'Authentication failed. Please try again.');
    }
  };

  const signOutUser = async () => {
    if (!auth) return;
    
    try {
      await signOut(auth);
      setGeminiApiKey(""); // Clear API key on sign out
      setBetaTester(false);
      setBetaWaitlist(false);
      setWaId(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

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

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      loading, 
      signInWithGoogle, 
      joinBeta,
      signOutUser,
      geminiApiKey,
      setGeminiApiKey,
      saveGeminiApiKey,
      authError,
      betaTester,
      betaWaitlist,
      waId,
      message_count,
      continueWithGoogle
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 