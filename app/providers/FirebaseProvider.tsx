"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence, GoogleAuthProvider, signOut, User, getRedirectResult } from "firebase/auth";
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
// Ensure durable session and avoid popup blockers/COOP issues
if (typeof window !== 'undefined') {
  // Best-effort; ignore if already set
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
export const db = getFirestore(app);

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
  continueWithGoogle: async () => {}
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
      // Persist last used Google identity for "Continue with Google" UX
      if (typeof window !== 'undefined' && user) {
        try {
          if (user.email) localStorage.setItem('lastGoogleEmail', user.email);
          if (user.displayName) localStorage.setItem('lastGoogleName', user.displayName);
          if (user.photoURL) localStorage.setItem('lastGooglePhoto', user.photoURL);
        } catch (_) {
          // ignore storage failures
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Finalize pending redirect sign-in once after load
  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          // Clear pending flag on successful redirect completion
          try { sessionStorage.setItem('authRedirectPending', '0'); } catch {}
          setUser(result.user);
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
        // Read global beta capacity to decide tester/waitlist flags deterministically
        const metaRef = doc(db, 'meta', 'beta');
        const metaSnap = await getDoc(metaRef);
        const capacity = (metaSnap.exists() && typeof metaSnap.data()?.capacity === 'number') ? (metaSnap.data() as any).capacity as number : 100;
        const testerCount = (metaSnap.exists() && typeof metaSnap.data()?.testerCount === 'number') ? (metaSnap.data() as any).testerCount as number : 0;
        const spotsLeft = Math.max(0, capacity - testerCount);

        if (!snap.exists()) {
          baseData.createdAt = serverTimestamp();
          if (spotsLeft > 0) {
            baseData.betaTester = true;
            baseData.betaWaitlist = false;
            setBetaTester(true);
            setBetaWaitlist(false);
          } else {
            baseData.betaTester = false;
            baseData.betaWaitlist = true;
            setBetaTester(false);
            setBetaWaitlist(true);
          }
        } else {
          const data = snap.data() as any;
          if (typeof data.betaTester !== 'boolean' && typeof data.betaWaitlist !== 'boolean') {
            if (spotsLeft > 0) {
              baseData.betaTester = true;
              baseData.betaWaitlist = false;
              setBetaTester(true);
              setBetaWaitlist(false);
            } else {
              baseData.betaTester = false;
              baseData.betaWaitlist = true;
              setBetaTester(false);
              setBetaWaitlist(true);
            }
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
      provider.setCustomParameters({ prompt: 'select_account' });

      // Prefer redirect on environments where popups are commonly blocked or unreliable
      const isProbablyPopupUnreliable = (() => {
        if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || '';
        const isIOS = /iP(ad|hone|od)/i.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const isStandalonePWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
        const isMobile = /Mobi|Android/i.test(ua);
        return isIOS || isSafari || isStandalonePWA || isMobile;
      })();

      if (isProbablyPopupUnreliable) {
        await signInWithRedirect(auth, provider);
        return;
      }

      try {
        await signInWithPopup(auth, provider);
      } catch (popupError: any) {
        // Common popup failures → fallback to redirect
        await signInWithRedirect(auth, provider);
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
      joinBeta,
      signOutUser,
      geminiApiKey,
      setGeminiApiKey,
      saveGeminiApiKey,
      authError,
      betaTester,
      betaWaitlist,
      continueWithGoogle
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext); 