// lib/analytics/microsoftClarity.ts

import clarity from '@microsoft/clarity';

export interface ClarityConfig {
  projectId: string;
  enabled?: boolean;
  debug?: boolean;
}

export class MicrosoftClarity {
  private static instance: MicrosoftClarity;
  private initialized = false;
  private config: ClarityConfig | null = null;

  private constructor() {}

  static getInstance(): MicrosoftClarity {
    if (!MicrosoftClarity.instance) {
      MicrosoftClarity.instance = new MicrosoftClarity();
    }
    return MicrosoftClarity.instance;
  }

  /**
   * Initialize Microsoft Clarity with the provided configuration
   */
  init(config: ClarityConfig): void {
    if (this.initialized) {
      console.warn('Microsoft Clarity is already initialized');
      return;
    }

    this.config = config;

    // Only initialize if enabled (default true in production, false in development)
    if (config.enabled === false) {
      console.log('Microsoft Clarity is disabled');
      return;
    }

    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.warn('Microsoft Clarity can only be initialized in browser environment');
      return;
    }

    try {
      clarity.init(config.projectId);

      if (config.debug) {
        console.log('Microsoft Clarity initialized with project ID:', config.projectId);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Microsoft Clarity:', error);
    }
  }

  /**
   * Track a custom event
   */
  trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      clarity.event(eventName);

      // If properties are provided, set them as tags
      if (properties) {
        Object.entries(properties).forEach(([key, value]) => {
          this.setTag(`${eventName}_${key}`, String(value));
        });
      }

      if (this.config.debug) {
        console.log('Clarity event tracked:', eventName, properties);
      }
    } catch (error) {
      console.error('Failed to track Clarity event:', error);
    }
  }

  /**
   * Identify a user (if you have user IDs)
   */
  identify(customerId: string, customSessionId?: string, customPageId?: string, friendlyName?: string): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      clarity.identify(customerId, customSessionId, customPageId, friendlyName);

      if (this.config.debug) {
        console.log('Clarity user identified:', customerId, customSessionId, customPageId, friendlyName);
      }
    } catch (error) {
      console.error('Failed to identify user in Clarity:', error);
    }
  }

  /**
   * Set custom tags for the current session
   */
  setTag(key: string, value: string): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      clarity.setTag(key, value);

      if (this.config.debug) {
        console.log('Clarity tag set:', key, value);
      }
    } catch (error) {
      console.error('Failed to set Clarity tag:', error);
    }
  }

  /**
   * Upgrade the current session (mark as important)
   */
  upgrade(reason: string = 'important'): void {
    if (!this.initialized || !this.config?.enabled) {
      return;
    }

    try {
      clarity.upgrade(reason);

      if (this.config.debug) {
        console.log('Clarity session upgraded:', reason);
      }
    } catch (error) {
      console.error('Failed to upgrade Clarity session:', error);
    }
  }

  /**
   * Check if Clarity is initialized and enabled
   */
  isEnabled(): boolean {
    return this.initialized && this.config?.enabled !== false;
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): ClarityConfig | null {
    return this.config;
  }
}

// Export singleton instance
export const clarityAnalytics = MicrosoftClarity.getInstance();

// Utility function to get Clarity configuration from environment
export function getClarityConfig(): ClarityConfig {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  const enabled = process.env.NEXT_PUBLIC_CLARITY_ENABLED !== 'false'; // Default true
  const debug = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_CLARITY_DEBUG === 'true';

  if (!projectId) {
    console.warn('NEXT_PUBLIC_CLARITY_PROJECT_ID is not set. Microsoft Clarity will not be initialized.');
    return {
      projectId: '',
      enabled: false,
      debug: false
    };
  }

  return {
    projectId,
    enabled,
    debug
  };
}
