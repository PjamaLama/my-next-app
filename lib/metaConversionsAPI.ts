/**
 * Facebook Conversions API Integration for SheetyAI
 * Handles server-side event tracking for Meta/Facebook advertising
 */

import crypto from 'crypto';

// Types for Conversions API
export interface UserData {
  em?: string[]; // Email (hashed)
  ph?: string[]; // Phone (hashed)
  fn?: string[]; // First name (hashed)
  ln?: string[]; // Last name (hashed)
  db?: string[]; // Date of birth (hashed)
  ge?: string[]; // Gender (hashed)
  ct?: string[]; // City (hashed)
  st?: string[]; // State (hashed)
  zp?: string[]; // Zip code (hashed)
  country?: string[]; // Country (hashed)
  external_id?: string[]; // External ID
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string; // Facebook Click ID
  fbp?: string; // Facebook Browser ID
}

export interface CustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  content_type?: string;
  order_id?: string;
  predicted_ltv?: number;
  num_items?: number;
  search_string?: string;
  status?: string;
  item_number?: string;
  delivery_category?: string;
  [key: string]: any;
}

export interface AttributionData {
  attribution_share?: string;
}

export interface OriginalEventData {
  event_name: string;
  event_time: number;
}

export interface ConversionEvent {
  event_name: string;
  event_time: number;
  event_source_url?: string;
  action_source: 'website' | 'app' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'other';
  event_id?: string;
  user_data?: UserData;
  custom_data?: CustomData;
  attribution_data?: AttributionData;
  original_event_data?: OriginalEventData;
}

export interface ConversionsAPIPayload {
  data: ConversionEvent[];
  test_event_code?: string; // For testing
}

// Configuration
const API_VERSION = 'v18.0';
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1478214820196184';
const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN;

/**
 * Hash user data for privacy compliance
 */
export const hashUserData = (data: string): string => {
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
};

/**
 * Normalize email for hashing
 */
export const normalizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

/**
 * Normalize phone for hashing
 */
export const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

/**
 * Send events to Facebook Conversions API
 */
export const sendConversionEvents = async (
  events: ConversionEvent[],
  testEventCode?: string
): Promise<{ success: boolean; response?: any; error?: string }> => {
  if (!ACCESS_TOKEN) {
    console.warn('Meta Conversions API token not configured');
    return { success: false, error: 'Access token not configured' };
  }

  const payload: ConversionsAPIPayload = {
    data: events,
    ...(testEventCode && { test_event_code: testEventCode })
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Conversions API error:', responseData);
      return {
        success: false,
        error: responseData.error?.message || 'Unknown error',
        response: responseData
      };
    }

    console.log('Conversions API success:', responseData);
    return { success: true, response: responseData };
  } catch (error) {
    console.error('Conversions API request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
};

/**
 * Send a single conversion event
 */
export const sendConversionEvent = async (
  event: ConversionEvent,
  testEventCode?: string
): Promise<{ success: boolean; response?: any; error?: string }> => {
  return sendConversionEvents([event], testEventCode);
};

/**
 * Create user data object with proper hashing
 */
export const createUserData = (params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}): UserData => {
  const userData: UserData = {};

  if (params.email) {
    userData.em = [hashUserData(normalizeEmail(params.email))];
  }

  if (params.phone) {
    userData.ph = [hashUserData(normalizePhone(params.phone))];
  }

  if (params.firstName) {
    userData.fn = [hashUserData(params.firstName)];
  }

  if (params.lastName) {
    userData.ln = [hashUserData(params.lastName)];
  }

  if (params.city) {
    userData.ct = [hashUserData(params.city)];
  }

  if (params.state) {
    userData.st = [hashUserData(params.state)];
  }

  if (params.zipCode) {
    userData.zp = [hashUserData(params.zipCode)];
  }

  if (params.country) {
    userData.country = [hashUserData(params.country)];
  }

  if (params.externalId) {
    userData.external_id = [params.externalId];
  }

  if (params.clientIpAddress) {
    userData.client_ip_address = params.clientIpAddress;
  }

  if (params.clientUserAgent) {
    userData.client_user_agent = params.clientUserAgent;
  }

  if (params.fbc) {
    userData.fbc = params.fbc;
  }

  if (params.fbp) {
    userData.fbp = params.fbp;
  }

  return userData;
};

/**
 * Get current Unix timestamp
 */
export const getCurrentTimestamp = (): number => {
  return Math.floor(Date.now() / 1000);
};

// Event helper functions for common conversions

/**
 * Track Purchase event
 */
export const trackPurchase = async (params: {
  userData?: UserData;
  value: number;
  currency?: string;
  contentName?: string;
  contentIds?: string[];
  orderId?: string;
  numItems?: number;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'Purchase',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    custom_data: {
      value: params.value,
      currency: params.currency || 'USD',
      content_name: params.contentName,
      content_ids: params.contentIds,
      order_id: params.orderId,
      num_items: params.numItems,
    },
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track View Content event
 */
export const trackViewContent = async (params: {
  userData?: UserData;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'ViewContent',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    custom_data: {
      content_name: params.contentName,
      content_ids: params.contentIds,
      content_type: params.contentType,
    },
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Complete Registration event
 */
export const trackCompleteRegistration = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'CompleteRegistration',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Initiate Checkout event
 */
export const trackInitiateCheckout = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'InitiateCheckout',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Subscribe event
 */
export const trackSubscribe = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'Subscribe',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Add Payment Info event
 */
export const trackAddPaymentInfo = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'AddPaymentInfo',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Lead event
 */
export const trackLead = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'Lead',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

/**
 * Track Contact event
 */
export const trackContact = async (params: {
  userData?: UserData;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
}): Promise<{ success: boolean; response?: any; error?: string }> => {
  const event: ConversionEvent = {
    event_name: 'Contact',
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    user_data: params.userData,
    ...(params.eventSourceUrl && { event_source_url: params.eventSourceUrl }),
  };

  return sendConversionEvent(event, params.testEventCode);
};

// Integration with existing Meta Pixel tracking

/**
 * Combined tracking - sends to both Meta Pixel and Conversions API
 * Includes deduplication by using the same event_id
 */
export const trackCombinedEvent = async (params: {
  eventName: string;
  pixelParameters?: any;
  conversionsParameters: {
    userData?: UserData;
    customData?: CustomData;
    eventSourceUrl?: string;
    clientUserAgent?: string;
    testEventCode?: string;
  };
  eventId?: string; // For deduplication
}): Promise<{ pixelSuccess: boolean; conversionsSuccess: boolean; conversionsResponse?: any; conversionsError?: string }> => {
  const eventId = params.eventId || `event_${getCurrentTimestamp()}_${Math.random().toString(36).substr(2, 9)}`;

  // Track with Meta Pixel (client-side)
  let pixelSuccess = false;
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      window.fbq('track', params.eventName, params.pixelParameters);
      console.log(`Meta Pixel: Tracked ${params.eventName}`, params.pixelParameters);
      pixelSuccess = true;
    } catch (error) {
      console.error('Meta Pixel tracking failed:', error);
    }
  }

  // Track with Conversions API (server-side)
  const conversionsEvent: ConversionEvent = {
    event_name: params.eventName,
    event_time: getCurrentTimestamp(),
    action_source: 'website',
    event_id: eventId,
    user_data: params.conversionsParameters.userData,
    custom_data: params.conversionsParameters.customData,
    ...(params.conversionsParameters.eventSourceUrl && {
      event_source_url: params.conversionsParameters.eventSourceUrl
    }),
  };

  const conversionsResult = await sendConversionEvent(conversionsEvent, params.conversionsParameters.testEventCode);

  return {
    pixelSuccess,
    conversionsSuccess: conversionsResult.success,
    conversionsResponse: conversionsResult.response,
    conversionsError: conversionsResult.error,
  };
};

/**
 * Combined Purchase tracking with deduplication
 */
export const trackCombinedPurchase = async (params: {
  userData?: UserData;
  value: number;
  currency?: string;
  contentName?: string;
  contentIds?: string[];
  orderId?: string;
  numItems?: number;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
  eventId?: string;
}): Promise<{ pixelSuccess: boolean; conversionsSuccess: boolean; conversionsResponse?: any; conversionsError?: string }> => {
  const eventId = params.eventId || `purchase_${getCurrentTimestamp()}_${Math.random().toString(36).substr(2, 9)}`;

  // Pixel parameters (existing format)
  const pixelParameters = {
    value: params.value,
    currency: params.currency || 'USD',
    content_name: params.contentName || 'SheetyAI Pro Subscription',
    content_type: 'product',
    content_ids: params.contentIds || ['sheetyai_pro_monthly'],
    product_catalog_id: 'SHEETYAI_PRO_CATALOG',
    num_items: params.numItems || 1,
  };

  return trackCombinedEvent({
    eventName: 'Purchase',
    pixelParameters,
    conversionsParameters: params,
    eventId,
  });
};

/**
 * Combined View Content tracking with deduplication
 */
export const trackCombinedViewContent = async (params: {
  userData?: UserData;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  eventSourceUrl?: string;
  clientUserAgent?: string;
  testEventCode?: string;
  eventId?: string;
}): Promise<{ pixelSuccess: boolean; conversionsSuccess: boolean; conversionsResponse?: any; conversionsError?: string }> => {
  const eventId = params.eventId || `view_${getCurrentTimestamp()}_${Math.random().toString(36).substr(2, 9)}`;

  // Pixel parameters (existing format)
  const pixelParameters = {
    content_ids: params.contentIds || ['sheetyai_pro_monthly'],
    content_type: params.contentType || 'product',
    product_catalog_id: 'SHEETYAI_PRO_CATALOG',
  };

  return trackCombinedEvent({
    eventName: 'ViewContent',
    pixelParameters,
    conversionsParameters: params,
    eventId,
  });
};
