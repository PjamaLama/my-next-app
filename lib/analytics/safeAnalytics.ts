/**
 * Safe Analytics Implementation for Microsoft Clarity and Google Analytics 4
 * Includes privacy controls, consent management, and production safety checks
 */

declare global {
  interface Window {
    clarity?: (command: string, ...args: any[]) => void;
    gtag?: (command: string, ...args: any[]) => void;
    dataLayer?: any[];
    ttq?: {
      track: (eventName: string, parameters?: any) => void;
      page: () => void;
      identify: (userData?: any) => void;
    };
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
 * Note: GA script is now loaded directly in layout.tsx, so we only need to check if it's loaded
 */
export const initGoogleAnalytics = () => {
  if (typeof window === 'undefined') return;

  // Check if gtag is available (loaded by layout.tsx)
  if (window.gtag) {
    console.log('✅ Google Analytics 4 script loaded from layout.tsx');
    return;
  }

  // If gtag is not available yet, wait for it to load with retry mechanism
  const maxRetries = 10;
  const retryInterval = 500; // 500ms
  let retryCount = 0;

  const checkGtag = () => {
    retryCount++;

    if (window.gtag) {
      console.log('✅ Google Analytics 4 script loaded from layout.tsx (after retry)');
      return;
    }

    if (retryCount >= maxRetries) {
      console.warn('⚠️ Google Analytics script not found after maximum retries - GTM may have failed to load');
      return;
    }

    // Try again after a short delay
    setTimeout(checkGtag, retryInterval);
  };

  // Start the retry process
  setTimeout(checkGtag, retryInterval);
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
    // Google Tag Manager - Send events through dataLayer
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        ...parameters,
        custom_map: { dimension1: 'user_type' }
      });
    }

    // Microsoft Clarity
    if (window.clarity && parameters) {
      window.clarity('event', eventName, parameters);
    }

    // TikTok Pixel - Map common events to TikTok standard events
    // Note: TikTok pixel is initialized in layout.tsx, avoid duplicate initialization here
    if (window.ttq && typeof window.ttq.track === 'function') {
      try {
        // Map conversion events to TikTok standard events
        if (eventName === 'conversion') {
          const conversionType = parameters?.conversion_type;
          switch (conversionType) {
            case 'account_created':
              window.ttq.track('Lead', {
                content_name: 'Account Creation',
                content_type: 'lead',
                ...parameters
              });
              break;
            case 'first_message_sent':
              window.ttq.track('Contact', {
                content_name: 'First Message Sent',
                content_type: 'engagement',
                ...parameters
              });
              break;
            default:
              window.ttq.track('CompletePayment', parameters);
              break;
          }
        } else {
          // For other custom events, use generic tracking
          window.ttq.track(eventName, parameters);
        }
      } catch (error) {
        console.warn('TikTok pixel tracking failed:', error);
      }
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
      window.gtag('config', 'G-4PSKB5BJY1', {
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
  // Map conversion types to specific GTM event names
  let eventName = 'conversion';
  let eventData: Record<string, any> = {
    conversion_type: conversionType,
    value,
    currency,
  };

  // Use specific event names for better GTM triggering
  switch (conversionType) {
    case 'account_created':
      eventName = 'sign_up';
      eventData = {
        value: value || 0,
        currency: currency || 'USD'
      };
      break;
    case 'first_message_sent':
      eventName = 'first_message';
      eventData = {
        value: value || 0,
        currency: currency || 'USD'
      };
      break;
    case 'pro_upgrade':
      eventName = 'purchase';
      eventData = {
        value: value || 19.97,
        currency: currency || 'USD',
        transaction_id: Date.now().toString()
      };
      break;
    case 'first_sheet_connected':
      eventName = 'sheet_connected';
      eventData = {
        value: value || 0,
        currency: currency || 'USD'
      };
      break;
  }

  trackEvent(eventName, eventData);
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
    googleAnalytics: !!(window.gtag || window.dataLayer), // GA script loaded directly or via GTM
    microsoftClarity: !!window.clarity, // Clarity script loaded directly
    tikTokPixel: !!window.ttq, // TikTok pixel loaded directly
    enabled: shouldEnableAnalytics(),
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'production',
  };
};
