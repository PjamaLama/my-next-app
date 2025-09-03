"use client";

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseAuth } from '../providers/FirebaseProvider';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  continueWithGoogle: (loginHint?: string) => Promise<void>;
  authError: string | null;
}

/**
 * Custom hook for authentication logic
 */
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Get auth instance
  const auth = getFirebaseAuth();

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      // Auth state changed - user presence updated
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // Common Google sign-in with popup first (desktop), redirect fallback (mobile/PWA/Safari)
  const startGoogleSignIn = useCallback(async (provider: GoogleAuthProvider) => {
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
  }, [auth]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }

    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await startGoogleSignIn(provider);
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
        setAuthError('Popup sign-in was blocked. Please allow popups for this site or try again.');
      } else {
        setAuthError(error?.message || 'Authentication failed. Please try again.');
      }
    }
  }, [auth, startGoogleSignIn]);



  const continueWithGoogle = useCallback(async (loginHint?: string) => {
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
  }, [auth, startGoogleSignIn]);

  const signOutUser = useCallback(async () => {
    if (!auth) return;

    try {
      await auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, [auth]);

  return {
    user,
    loading,
    signInWithGoogle,
    signOutUser,
    continueWithGoogle,
    authError
  };
};
