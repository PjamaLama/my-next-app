// app/components/ClarityInitializer.tsx

'use client';

import { useEffect } from 'react';
import { clarityAnalytics, getClarityConfig } from '@/lib/analytics/microsoftClarity';

export default function ClarityInitializer() {
  useEffect(() => {
    // Initialize Microsoft Clarity when the component mounts
    const config = getClarityConfig();

    if (config.projectId && config.enabled) {
      clarityAnalytics.init(config);

      // Optional: Track page views (Clarity does this automatically, but you can customize)
      // clarityAnalytics.trackEvent('page_view', { path: window.location.pathname });
    }
  }, []);

  // This component doesn't render anything
  return null;
}
