"use client";

import { useEffect } from 'react';
import { User } from 'firebase/auth';

/**
 * Custom hook for beta features management
 */
export const useBetaFeatures = (user: User | null) => {
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
      } catch (_) {
        // Ignore errors for beta ensure
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // Finalize pending redirect sign-in once after load
  useEffect(() => {
    (async () => {
      try {
        const result = await import('firebase/auth').then(({ getAuth, getRedirectResult }) => {
          const auth = getAuth();
          return getRedirectResult(auth);
        });

        if (result?.user) {
          // Clear pending flag on successful redirect completion
          try { sessionStorage.setItem('authRedirectPending', '0'); } catch {}

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
};
