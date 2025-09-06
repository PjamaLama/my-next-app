"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, trackPageView, getAnalyticsStatus } from '@/lib/analytics/safeAnalytics';
import { hasAnalyticsConsent } from '@/lib/analytics/consentManager';

/**
 * AnalyticsTracker Component
 *
 * Handles analytics initialization and page view tracking
 * Only runs in production with user consent
 */
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Initialize analytics on first load
    const initializeAnalytics = async () => {
      // Check consent before initializing
      if (hasAnalyticsConsent()) {
        initAnalytics();

        // Log analytics status in development
        if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') {
          console.log('📊 Analytics Status:', getAnalyticsStatus());
        }
      } else {
        if (process.env.NEXT_PUBLIC_GA_DEBUG === 'true') {
          console.log('📊 Analytics disabled - no consent');
        }
      }
    };

    initializeAnalytics();
  }, []);

  useEffect(() => {
    // Track page views
    if (hasAnalyticsConsent() && pathname) {
      trackPageView(pathname);
    }
  }, [pathname]);

  // This component doesn't render anything
  return null;
}
