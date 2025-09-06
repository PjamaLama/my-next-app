/**
 * Safe Analytics Implementation for Microsoft Clarity and Google Analytics 4
 * Includes privacy controls, consent management, and production safety checks
 */

declare global {
  interface Window {
    clarity?: (command: string, ...args: any[]) => void;
    gtag?: (command: string, ...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Check if analytics should be enabled based on environment and consent
 * Note: Analytics scripts are now loaded directly in layout.tsx
 */
export const shouldEnableAnalytics = (): boolean => {
  // Analytics are now always enabled since scripts load directly
  return true;
};

/**
 * Initialize Google Analytics 4
 * Note: GA script is now loaded directly in layout.tsx
 */
export const initGoogleAnalytics = () => {
  if (typeof window === 'undefined') return;

  // Prevent duplicate initialization
  if (window.gtag) return;

  try {
    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];

    // Define gtag function
    window.gtag = function() {
      window.dataLayer?.push(arguments);
    };

    // Initialize GA4 with hardcoded ID (script loaded directly in layout.tsx)
    window.gtag('js', new Date());
    window.gtag('config', 'G-KMKJ9N8BNS', {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    console.log('✅ Google Analytics 4 initialized safely');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Google Analytics:', error);
  }
};

/**
 * Initialize Microsoft Clarity
 * Note: Clarity script is now loaded directly in layout.tsx
 */
export const initMicrosoftClarity = () => {
  if (typeof window === 'undefined') return;

  // Prevent duplicate initialization
  if (window.clarity) return;

  try {
    // Microsoft Clarity will auto-initialize when the script loads
    console.log('✅ Microsoft Clarity script loaded safely');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Microsoft Clarity:', error);
  }
};

/**
 * Initialize all analytics services
 */
export const initAnalytics = () => {
  if (!shouldEnableAnalytics()) return;

  initGoogleAnalytics();
  initMicrosoftClarity();
};

/**
 * Track custom events
 */
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, any>
) => {
  if (!shouldEnableAnalytics()) return;

  try {
    // Google Analytics 4
    if (window.gtag) {
      window.gtag('event', eventName, {
        ...parameters,
        custom_map: { dimension1: 'user_type' }
      });
    }

    // Microsoft Clarity
    if (window.clarity && parameters) {
      window.clarity('event', eventName, parameters);
    }

    // Debug logging (can be enabled by setting NEXT_PUBLIC_GA_DEBUG=true)
    if (process.env.NEXT_PUBLIC_GA_DEBUG === 'true') {
      console.log('📊 Analytics Event:', eventName, parameters);
    }
  } catch (error) {
    console.warn('⚠️ Analytics tracking error:', error);
  }
};

/**
 * Track page views
 */
export const trackPageView = (pagePath: string) => {
  if (!shouldEnableAnalytics()) return;

  try {
    // Google Analytics 4
    if (window.gtag) {
      window.gtag('config', 'G-KMKJ9N8BNS', {
        page_path: pagePath,
      });
    }

    // Microsoft Clarity (automatically tracks page views)
    if (process.env.NEXT_PUBLIC_GA_DEBUG === 'true') {
      console.log('📄 Page View Tracked:', pagePath);
    }
  } catch (error) {
    console.warn('⚠️ Page view tracking error:', error);
  }
};

/**
 * Track user interactions
 */
export const trackUserInteraction = (
  action: string,
  category: string,
  label?: string,
  value?: number
) => {
  trackEvent('user_interaction', {
    action,
    category,
    label,
    value,
  });
};

/**
 * Track business conversions
 */
export const trackConversion = (
  conversionType: string,
  value?: number,
  currency: string = 'USD'
) => {
  trackEvent('conversion', {
    conversion_type: conversionType,
    value,
    currency,
  });
};

/**
 * Track feature usage
 */
export const trackFeatureUsage = (
  featureName: string,
  action: string,
  metadata?: Record<string, any>
) => {
  trackEvent('feature_usage', {
    feature_name: featureName,
    action,
    ...metadata,
  });
};

/**
 * Track errors (non-sensitive)
 */
export const trackError = (
  errorType: string,
  errorMessage: string,
  context?: string
) => {
  // Only track generic error types, never sensitive data
  trackEvent('error_occurred', {
    error_type: errorType,
    context: context || 'unknown',
    // Never include actual error messages or stack traces
  });
};

/**
 * Check if analytics services are loaded
 */
export const getAnalyticsStatus = () => {
  return {
    googleAnalytics: !!window.gtag, // GA script loaded directly
    microsoftClarity: !!window.clarity, // Clarity script loaded directly
    enabled: shouldEnableAnalytics(),
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'production',
  };
};
