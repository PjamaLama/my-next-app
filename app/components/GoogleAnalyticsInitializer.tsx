// app/components/GoogleAnalyticsInitializer.tsx

'use client';

import { useEffect } from 'react';
import { googleAnalytics, getGoogleAnalyticsConfig } from '@/lib/analytics/googleAnalytics';

export default function GoogleAnalyticsInitializer() {
  useEffect(() => {
    // Initialize Google Analytics when the component mounts
    const config = getGoogleAnalyticsConfig();

    if (config.gtmId && config.enabled) {
      googleAnalytics.init(config);

      // Optional: Track initial page view (GTM handles this automatically, but you can customize)
      // googleAnalytics.trackEvent('page_view', { path: window.location.pathname });
    }
  }, []);

  // This component doesn't render anything
  return null;
}
