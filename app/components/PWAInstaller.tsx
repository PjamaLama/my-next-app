"use client";

import React, { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export default function PWAInstaller() {
  const { user } = useFirebase();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Don't show PWA installer on landing page (unauthenticated users)
    if (!user) {
      return;
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      // Bust SW cache with a versioned URL to ensure the latest logic (v3)
      navigator.serviceWorker.register('/sw.js?v=3', { scope: '/' })
        .then((registration) => {
          console.log('SW registered: ', registration);
          // Try to update on load to pick latest
          try { registration.update(); } catch {}
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    }

    // Check if app is already installed
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Only prevent default if we're going to handle it ourselves
      e.preventDefault();
      setDeferredPrompt(e);

      // Check if we should show the prompt
      const lastDismissed = localStorage.getItem('installPromptLastDismissed');
      const lastShown = localStorage.getItem('installPromptLastShown');
      const now = Date.now();

      // Don't show if dismissed in last 7 days
      if (lastDismissed && (now - parseInt(lastDismissed)) < 7 * 24 * 60 * 60 * 1000) {
        console.log('Install prompt dismissed recently, not showing');
        return;
      }

      // Don't show if shown in last 24 hours
      if (lastShown && (now - parseInt(lastShown)) < 24 * 60 * 60 * 1000) {
        console.log('Install prompt shown recently, not showing');
        return;
      }

      // Show prompt immediately after first interaction for better UX
      const checkInteraction = () => {
        if (hasInteracted) {
          // Add shorter delay for better user experience
          setTimeout(() => {
            setShowInstallPrompt(true);
            localStorage.setItem('installPromptLastShown', now.toString());
            console.log('Showing PWA install prompt');
          }, 2000); // Reduced from 3000ms to 2000ms
        } else {
          // Check again in 500ms for faster response
          setTimeout(checkInteraction, 500);
        }
      };

      checkInteraction();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Track user interactions to determine when to show the prompt
    const trackInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
      }
    };

    // Listen for various user interactions
    const events = ['click', 'scroll', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, trackInteraction, { once: true });
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      events.forEach(event => {
        document.removeEventListener(event, trackInteraction);
      });
    };
  }, [user, hasInteracted]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    // Hide for 7 days
    localStorage.setItem('installPromptLastDismissed', Date.now().toString());
  };

  // Don't show if:
  // - Not authenticated (landing page)
  // - Already installed
  // - No prompt available
  // - Dismissed recently
  if (!user || isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl shadow-lg p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="bg-white/20 rounded-lg p-2 flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">Install Sheety AI</h3>
            <p className="text-xs text-white/90 mb-3">
              Install the app on your device for a better experience and offline access.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstallClick}
                className="bg-white text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/90 transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/30 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/70 hover:text-white p-1 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
} 