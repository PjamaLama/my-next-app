// lib/analytics/googleAnalytics.ts

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export interface GoogleAnalyticsConfig {
  gtmId: string;
  ga4MeasurementId?: string;
  enabled?: boolean;
  debug?: boolean;
}

export class GoogleAnalytics {
  private static instance: GoogleAnalytics;
  private initialized = false;
  private config: GoogleAnalyticsConfig | null = null;

  private constructor() {}

  static getInstance(): GoogleAnalytics {
    if (!GoogleAnalytics.instance) {
      GoogleAnalytics.instance = new GoogleAnalytics();
    }
    return GoogleAnalytics.instance;
  }

  /**
   * Initialize Google Analytics through GTM
   */
  init(config: GoogleAnalyticsConfig): void {
    if (this.initialized) {
      console.warn('Google Analytics is already initialized');
      return;
    }

    this.config = config;

    // Only initialize if enabled (default true in production, false in development)
    if (config.enabled === false) {
      console.log('Google Analytics is disabled');
      return;
    }

    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.warn('Google Analytics can only be initialized in browser environment');
      return;
    }

    try {
      // Initialize dataLayer if it doesn't exist
      window.dataLayer = window.dataLayer || [];

      // Set up gtag function
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };

      // Configure GA4 if measurement ID is provided
      if (config.ga4MeasurementId) {
        window.gtag('js', new Date());
        window.gtag('config', config.ga4MeasurementId, {
          debug_mode: config.debug || false,
        });
      }

      this.initialized = true;

      if (config.debug) {
        console.log('Google Analytics initialized with GTM ID:', config.gtmId);
      }
    } catch (error) {
      console.error('Failed to initialize Google Analytics:', error);
    }
  }

  /**
   * Track a custom event
   */
  trackEvent(eventName: string, parameters?: Record<string, any>): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      // Send event through GTM dataLayer
      window.dataLayer.push({
        event: eventName,
        ...parameters,
      });

      // Also send to GA4 if configured
      if (this.config.ga4MeasurementId && window.gtag) {
        window.gtag('event', eventName, parameters);
      }

      if (this.config.debug) {
        console.log('GA event tracked:', eventName, parameters);
      }
    } catch (error) {
      console.error('Failed to track GA event:', error);
    }
  }

  /**
   * Track conversion event (for Google Ads)
   */
  trackConversion(conversionId: string, parameters?: Record<string, any>): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      // Push conversion event to dataLayer
      window.dataLayer.push({
        event: 'conversion',
        conversionId: conversionId,
        ...parameters,
      });

      if (this.config.debug) {
        console.log('GA conversion tracked:', conversionId, parameters);
      }
    } catch (error) {
      console.error('Failed to track GA conversion:', error);
    }
  }

  /**
   * Track user engagement events
   */
  trackUserEngagement(action: string, parameters?: Record<string, any>): void {
    this.trackEvent('user_engagement', {
      engagement_action: action,
      ...parameters,
    });
  }

  /**
   * Track business conversion events
   */
  trackBusinessConversion(conversionType: string, value?: number, currency: string = 'USD'): void {
    const parameters: Record<string, any> = {
      conversion_type: conversionType,
    };

    if (value !== undefined) {
      parameters.value = value;
      parameters.currency = currency;
    }

    this.trackEvent('business_conversion', parameters);
  }

  /**
   * Set user properties
   */
  setUserProperty(property: string, value: any): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      window.dataLayer.push({
        user_properties: {
          [property]: value,
        },
      });

      if (this.config.debug) {
        console.log('GA user property set:', property, value);
      }
    } catch (error) {
      console.error('Failed to set GA user property:', error);
    }
  }

  /**
   * Check if GA is initialized and enabled
   */
  isEnabled(): boolean {
    return this.initialized && this.config?.enabled !== false;
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): GoogleAnalyticsConfig | null {
    return this.config;
  }
}

// Export singleton instance
export const googleAnalytics = GoogleAnalytics.getInstance();

// Utility function to get GA configuration from environment
export function getGoogleAnalyticsConfig(): GoogleAnalyticsConfig {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  const enabled = process.env.NEXT_PUBLIC_GA_ENABLED !== 'false'; // Default true
  const debug = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_GA_DEBUG === 'true';

  if (!gtmId) {
    console.warn('NEXT_PUBLIC_GTM_ID is not set. Google Analytics will not be initialized.');
    return {
      gtmId: '',
      enabled: false,
      debug: false,
    };
  }

  return {
    gtmId,
    ga4MeasurementId,
    enabled,
    debug,
  };
}
