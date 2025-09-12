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

  // Intelligent device detection for optimal authentication strategy
  const detectAuthStrategy = useCallback(() => {
    if (typeof window === 'undefined') return { useRedirect: false, reason: 'server-side' };

    const ua = navigator.userAgent || '';
    const isIOS = /iP(ad|hone|od)/i.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isStandalonePWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isMobile = /Mobi|Android/i.test(ua);
    const isChrome = /Chrome/i.test(ua) && !isSafari;

    // Industry standard logic:
    // - Mobile devices: Use redirect (more reliable)
    // - PWA standalone: Use redirect (popups don't work)
    // - iOS Safari: Use redirect (blocks popups)
    // - Desktop Chrome: Use popup (best UX)
    // - Other desktop: Use redirect (safer fallback)

    const shouldUseRedirect = isStandalonePWA || isIOS || isMobile || !isChrome;

    console.log('🔍 Auth strategy detection:', {
      userAgent: ua.substring(0, 100) + '...',
      isIOS,
      isSafari,
      isStandalonePWA,
      isMobile,
      isChrome,
      recommendedAuth: shouldUseRedirect ? 'redirect' : 'popup',
      reason: shouldUseRedirect
        ? (isStandalonePWA ? 'PWA standalone'
           : isIOS ? 'iOS device'
           : isMobile ? 'Mobile device'
           : 'Non-Chrome browser')
        : 'Desktop Chrome',
      hasRedirectPending: sessionStorage.getItem('authRedirectPending')
    });

    return { useRedirect: shouldUseRedirect, reason: shouldUseRedirect ? 'device/browser compatibility' : 'optimal UX' };
  }, []);

  // Debug logging for authentication environment
  useEffect(() => {
    detectAuthStrategy();
  }, [detectAuthStrategy]);

  useEffect(() => {
    if (!auth) return;

    // Handle redirect result on app initialization (industry standard)
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
        // Only set error for redirect scenarios
        const strategy = detectAuthStrategy();
        if (strategy.useRedirect) {
          setAuthError('Authentication failed. Please try again.');
        }
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

  // Industry standard authentication logic with device-specific strategy
  const startGoogleSignIn = useCallback(async (provider: GoogleAuthProvider) => {
    if (!auth) throw new Error('Firebase not initialized');

    const strategy = detectAuthStrategy();
    const userAgent = navigator.userAgent;

    console.log('🔐 Auth method:', strategy.useRedirect ? 'redirect' : 'popup');
    console.log('🔐 Strategy reason:', strategy.reason);
    console.log('🔐 User agent:', userAgent.substring(0, 100) + '...');

    if (strategy.useRedirect) {
      // Use redirect for mobile/PWA/other scenarios (industry standard)
      try {
        console.log('🔐 Using redirect authentication...');
        // Store pending state for debugging
        try {
          sessionStorage.setItem('authRedirectPending', 'true');
        } catch {}
        await signInWithRedirect(auth, provider);
        console.log('🔐 Redirect authentication initiated');
      } catch (error: any) {
        console.error('🔐 Redirect failed:', error);
        // Clear pending state on error
        try {
          sessionStorage.removeItem('authRedirectPending');
        } catch {}
        throw error;
      }
    } else {
      // Use popup for desktop Chrome (industry standard with fallback)
      try {
        console.log('🔐 Attempting popup authentication...');
        await signInWithPopup(auth, provider);
        console.log('🔐 Popup authentication successful');
        return;
      } catch (error: any) {
        console.log('🔐 Popup failed, trying redirect fallback:', error.code);
        // Industry standard: fallback to redirect if popup fails
        if (error.code === 'auth/popup-blocked' ||
            error.code === 'auth/popup-closed-by-user' ||
            error.code === 'auth/cancelled-popup-request') {
          try {
            console.log('🔐 Falling back to redirect authentication...');
            // Store pending state for debugging
            try {
              sessionStorage.setItem('authRedirectPending', 'true');
            } catch {}
            await signInWithRedirect(auth, provider);
            console.log('🔐 Redirect fallback initiated');
          } catch (redirectError: any) {
            console.error('🔐 Redirect fallback failed:', redirectError);
            // Clear pending state on error
            try {
              sessionStorage.removeItem('authRedirectPending');
            } catch {}
            throw redirectError;
          }
        } else {
          throw error;
        }
      }
    }
  }, [auth, detectAuthStrategy]);

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

      // Industry standard: Use appropriate prompt based on user state
      // Check if user has signed in before (from localStorage)
      let hasSignedInBefore = false;
      try {
        hasSignedInBefore = localStorage.getItem('hasSignedInBefore') === 'true';
      } catch {}

      if (hasSignedInBefore) {
        // Returning user: no prompt (seamless experience)
        console.log('🔐 Returning user - using seamless auth');
      } else {
        // First-time user: show account chooser
        provider.setCustomParameters({ prompt: 'select_account' });
        console.log('🔐 First-time user - showing account chooser');
      }

      // Add scopes for better integration
      provider.addScope('profile');
      provider.addScope('email');

      await startGoogleSignIn(provider);

      // Mark as signed in for future seamless auth
      try {
        localStorage.setItem('hasSignedInBefore', 'true');
      } catch {}

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

      // Industry standard: For "continue as" flows, be seamless but allow account switching
      if (loginHint) {
        provider.setCustomParameters({
          login_hint: loginHint,
          prompt: 'consent' // Allow seamless continue but can switch accounts
        });
        console.log('🔐 Using login hint for seamless continue:', loginHint);
      } else {
        // Fallback: minimal prompt for continue flow
        provider.setCustomParameters({ prompt: 'consent' });
        console.log('🔐 Continue flow with consent prompt');
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
      // Clear signed-in state for fresh account chooser on next sign-in
      try {
        localStorage.removeItem('hasSignedInBefore');
      } catch {}
      console.log('🔐 User signed out, cleared sign-in state');
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
