/**
 * Consent Manager for Analytics
 * Handles GDPR, CCPA, and other privacy regulations
 */

export interface ConsentSettings {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  necessary: boolean;
}

export const CONSENT_STORAGE_KEY = 'sheetyai_analytics_consent';
export const CCPA_OPT_OUT_KEY = 'ccpa_analytics_optout';

/**
 * Check if user is in GDPR region (EU)
 */
export const isInGDPRRegion = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check for EU country codes or EU-related indicators
  // This is a basic implementation - you might want to use a geo-IP service
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const euTimezones = ['Europe/', 'GMT'];

  return euTimezones.some(tz => timezone.includes(tz));
};

/**
 * Check if user is in CCPA region (California)
 */
export const isInCCPARegion = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Basic check - you might want to use a proper geo-IP service
  // For now, we'll rely on explicit opt-out signals
  return false; // Conservative approach
};

/**
 * Get stored consent settings
 */
export const getStoredConsent = (): ConsentSettings | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    const timestamp = parsed.timestamp;

    // Consent expires after 1 year
    if (Date.now() - timestamp > 365 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      return null;
    }

    return parsed.settings;
  } catch (error) {
    console.warn('Error reading consent settings:', error);
    return null;
  }
};

/**
 * Store consent settings
 */
export const storeConsent = (settings: ConsentSettings): void => {
  if (typeof window === 'undefined') return;

  try {
    const consentData = {
      settings,
      timestamp: Date.now(),
      version: '1.0'
    };

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
  } catch (error) {
    console.warn('Error storing consent settings:', error);
  }
};

/**
 * Check CCPA opt-out status
 */
export const isCCPAOptOut = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(CCPA_OPT_OUT_KEY) === 'true';
  } catch (error) {
    return false;
  }
};

/**
 * Set CCPA opt-out status
 */
export const setCCPAOptOut = (optOut: boolean): void => {
  if (typeof window === 'undefined') return;

  try {
    if (optOut) {
      localStorage.setItem(CCPA_OPT_OUT_KEY, 'true');
    } else {
      localStorage.removeItem(CCPA_OPT_OUT_KEY);
    }
  } catch (error) {
    console.warn('Error setting CCPA opt-out:', error);
  }
};

/**
 * Get default consent settings based on region
 */
export const getDefaultConsent = (): ConsentSettings => {
  const inGDPR = isInGDPRRegion();
  const inCCPA = isInCCPARegion();

  if (inGDPR || inCCPA) {
    // Conservative approach for privacy-regulated regions
    return {
      analytics: false,
      marketing: false,
      functional: false,
      necessary: true,
    };
  }

  // More permissive defaults for other regions
  return {
    analytics: true,
    marketing: true,
    functional: true,
    necessary: true,
  };
};

/**
 * Check if analytics consent is granted
 */
export const hasAnalyticsConsent = (): boolean => {
  // Always respect CCPA opt-out
  if (isCCPAOptOut()) return false;

  // Check stored consent
  const stored = getStoredConsent();
  if (stored) {
    return stored.analytics;
  }

  // Check default consent
  const defaults = getDefaultConsent();
  return defaults.analytics;
};

/**
 * Update consent settings
 */
export const updateConsent = (settings: Partial<ConsentSettings>): void => {
  const current = getStoredConsent() || getDefaultConsent();
  const updated = { ...current, ...settings };
  storeConsent(updated);
};

/**
 * Reset all consent settings
 */
export const resetConsent = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    localStorage.removeItem(CCPA_OPT_OUT_KEY);
  } catch (error) {
    console.warn('Error resetting consent:', error);
  }
};

/**
 * Get consent status summary
 */
export const getConsentStatus = () => {
  return {
    hasStoredConsent: !!getStoredConsent(),
    analyticsConsent: hasAnalyticsConsent(),
    ccpaOptOut: isCCPAOptOut(),
    inGDPRRegion: isInGDPRRegion(),
    inCCPARegion: isInCCPARegion(),
    storedConsent: getStoredConsent(),
    defaultConsent: getDefaultConsent(),
  };
};
