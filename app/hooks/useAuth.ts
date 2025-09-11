"use client";

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseAuth } from '../providers/FirebaseProvider';
import { trackConversion, trackUserInteraction } from '@/lib/analytics/safeAnalytics';

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
          trackConversion('account_created');
          trackUserInteraction('authentication', 'signup', 'google');
        } else {
          // This is a returning user sign-in
          console.log('📊 User Sign In');
          trackUserInteraction('authentication', 'signin', 'google');
        }
      }
    });

    return () => unsubscribe();
  }, [auth]);

  // Simplified mobile detection - just check if it's mobile or PWA
  const isMobileOrPWA = () => {
    if (typeof window === 'undefined') return false;
    
    // Check for PWA standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Check for mobile devices
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    return isStandalone || isMobile;
  };

  // Simplified sign-in logic
  const startGoogleSignIn = useCallback(async (provider: GoogleAuthProvider) => {
    if (!auth) throw new Error('Firebase not initialized');

    const shouldUseRedirect = isMobileOrPWA();
    
    console.log('🔐 Auth method:', shouldUseRedirect ? 'redirect' : 'popup');

    if (!shouldUseRedirect) {
      // Desktop: Try popup first, fallback to redirect
      try {
        await signInWithPopup(auth, provider);
        return;
      } catch (error) {
        console.log('🔐 Popup failed, using redirect fallback');
      }
    }

    // Mobile/PWA or popup fallback: Always use redirect
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('�� Redirect failed:', error);
      throw error;
    }
  }, [auth]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      console.error('🔐 Firebase auth not initialized');
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }

    try {
      console.log('🔐 Starting Google sign-in process...');
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // Add scopes for better integration
      provider.addScope('profile');
      provider.addScope('email');

      await startGoogleSignIn(provider);
      console.log('🔐 Google sign-in process completed successfully');
    } catch (error: any) {
      console.error('🔐 Firebase auth error:', error);
      console.error('🔐 Error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      });

      const code = error?.code as string | undefined;

      // Track authentication errors
      trackUserInteraction('authentication', 'error', code || 'unknown');

      // Enhanced error messages for mobile debugging
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
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in was cancelled. Please try again.');
      } else if (code === 'auth/web-storage-unsupported') {
        setAuthError('Web storage is not supported in this browser. Please enable cookies and local storage.');
      } else {
        const errorMessage = error?.message || 'Authentication failed. Please try again.';
        console.error('🔐 Setting auth error:', errorMessage);
        setAuthError(errorMessage);
      }
    }
  }, [auth, startGoogleSignIn]);



  const continueWithGoogle = useCallback(async (loginHint?: string) => {
    if (!auth) {
      console.error('🔐 Firebase auth not initialized for continue');
      setAuthError('Firebase not initialized. Please refresh the page.');
      return;
    }

    try {
      console.log('🔐 Starting Google continue sign-in process...');
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (loginHint) {
        provider.setCustomParameters({ login_hint: loginHint });
        console.log('🔐 Using login hint:', loginHint);
      }

      // Add scopes for better integration
      provider.addScope('profile');
      provider.addScope('email');

      await startGoogleSignIn(provider);
      console.log('🔐 Google continue sign-in process completed successfully');
    } catch (error: any) {
      console.error('🔐 Firebase continue auth error:', error);
      console.error('🔐 Continue error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      });

      const code = error?.code as string | undefined;

      // Enhanced error messages for mobile debugging
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
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in was cancelled. Please try again.');
      } else if (code === 'auth/web-storage-unsupported') {
        setAuthError('Web storage is not supported in this browser. Please enable cookies and local storage.');
      } else {
        const errorMessage = error?.message || 'Authentication failed. Please try again.';
        console.error('🔐 Setting continue auth error:', errorMessage);
        setAuthError(errorMessage);
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
