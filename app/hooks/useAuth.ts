"use client";

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
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

  // Debug logging for mobile authentication
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isIOS = /iP(ad|hone|od)/i.test(ua);
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
      const isStandalonePWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const isMobile = /Mobi|Android/i.test(ua);

      console.log('🔍 Auth environment detection:', {
        userAgent: ua.substring(0, 100) + '...',
        isIOS,
        isSafari,
        isStandalonePWA,
        isMobile,
        willUseRedirect: (isIOS && isSafari) || isStandalonePWA
      });
    }
  }, []);

  useEffect(() => {
    if (!auth) return;

    // Handle redirect result on app initialization
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log('📊 Redirect authentication successful');
          // Clear any pending redirect state
          try { sessionStorage.removeItem('authRedirectPending'); } catch {}
        }
      } catch (error: any) {
        console.error('Redirect result error:', error);
        // Clear pending state even on error
        try { sessionStorage.removeItem('authRedirectPending'); } catch {}
        setAuthError('Authentication failed. Please try again.');
      }
    };

    handleRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      // Auth state changed - user presence updated
      setUser(user);
      setLoading(false);

      // Track authentication events
      if (user) {
        // Check if this is a new user (account creation)
        const creationTime = user.metadata.creationTime;
        const lastSignInTime = user.metadata.lastSignInTime;

        if (creationTime === lastSignInTime) {
          // This is likely a new account creation
          console.log('📊 Account Created');
        } else {
          // This is a returning user sign-in
          console.log('📊 User Sign In');
        }
      }
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
      // Only treat iOS Safari and standalone PWAs as popup unreliable
      // Modern Android browsers handle popups well
      return (isIOS && isSafari) || isStandalonePWA;
    })();

    if (!isPopupUnreliable) {
      try {
        await signInWithPopup(auth, provider);
        // Clear any pending redirect state
        try { sessionStorage.removeItem('authRedirectPending'); } catch {}
        return;
      } catch (popupError: any) {
        console.log('Popup failed, falling back to redirect:', popupError.message);
        // Fallback to redirect for any popup failures
      }
    }

    // Set redirect pending state
    try { sessionStorage.setItem('authRedirectPending', '1'); } catch (e) {
      console.warn('Failed to set sessionStorage:', e);
    }
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
      } else if (code === 'auth/operation-not-supported-in-this-environment') {
        setAuthError('Authentication is not supported in this environment. Please try using a different browser or device.');
      } else if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user'
      ) {
        setAuthError('Popup sign-in was blocked. Please allow popups for this site or try again.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Network error during authentication. Please check your internet connection and try again.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Too many authentication attempts. Please wait a moment and try again.');
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
      const code = error?.code as string | undefined;

      if (code === 'auth/unauthorized-domain') {
        setAuthError("This domain is not authorized for authentication. Please add this domain to your Firebase console's authorized domains list.");
      } else if (code === 'auth/operation-not-supported-in-this-environment') {
        setAuthError('Authentication is not supported in this environment. Please try using a different browser or device.');
      } else if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user'
      ) {
        setAuthError('Popup sign-in was blocked. Please allow popups for this site or try again.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Network error during authentication. Please check your internet connection and try again.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Too many authentication attempts. Please wait a moment and try again.');
      } else {
        setAuthError(error?.message || 'Authentication failed. Please try again.');
      }
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
