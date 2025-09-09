/**
 * TikTok Pixel Integration for SheetyAI
 * Handles tracking events and conversions for TikTok Ads
 */

declare global {
  interface Window {
    ttq?: {
      track: (eventName: string, parameters?: any) => void;
      page: () => void;
      identify: (userData?: any) => void;
    };
  }
}

export interface TikTokPurchaseData {
  value: number;
  currency: string;
  content_name?: string;
  content_type?: string;
  content_id?: string;
  quantity?: number;
}

export interface TikTokEventData {
  content_name?: string;
  content_type?: string;
  content_id?: string;
  value?: number;
  currency?: string;
  [key: string]: any;
}

// Product catalog configuration (matching Meta pixel)
export const TIKTOK_PRODUCT_CATALOG = {
  pro_monthly: {
    content_id: 'sheetyai_pro_monthly',
    content_name: 'SheetyAI Pro Monthly Subscription',
    price: 19.97,
    currency: 'USD',
    content_type: 'product'
  },
  pro_yearly: {
    content_id: 'sheetyai_pro_yearly',
    content_name: 'SheetyAI Pro Yearly Subscription',
    price: 199.97,
    currency: 'USD',
    content_type: 'product'
  }
};

/**
 * Track a custom event to TikTok pixel
 */
export const trackTikTokEvent = (eventName: string, parameters?: TikTokEventData) => {
  console.log(`🎯 TikTok Event Called: ${eventName}`, parameters); // Always log when function is called

  if (typeof window !== 'undefined' && window.ttq) {
    try {
      window.ttq.track(eventName, parameters);
      console.log(`✅ TikTok Pixel: Tracked ${eventName}`, parameters);

      // Debug logging for development
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 TikTok Debug - Pixel loaded:', !!window.ttq);
        console.log('🔍 TikTok Debug - Event:', eventName, parameters);
      }
    } catch (error) {
      console.warn('❌ TikTok tracking error:', error);
      console.warn('❌ Error details:', error.message);
    }
  } else {
    console.warn('❌ TikTok pixel not loaded - Check pixel base code installation');
    console.warn('💡 Make sure the TikTok pixel base code is properly installed in layout.tsx');
    console.warn('💡 ttq object:', typeof window !== 'undefined' ? window.ttq : 'window undefined');
  }
};

/**
 * Track a purchase event
 */
export const trackTikTokPurchase = (purchaseData: TikTokPurchaseData) => {
  const defaultParams: TikTokPurchaseData = {
    content_name: 'SheetyAI Pro Subscription',
    content_type: 'product',
    content_id: 'sheetyai_pro_monthly',
    quantity: 1,
    ...purchaseData
  };

  trackTikTokEvent('CompletePayment', defaultParams);
};

/**
 * Track product view
 */
export const trackTikTokViewContent = (productId: string = 'sheetyai_pro_monthly') => {
  const product = TIKTOK_PRODUCT_CATALOG[productId as keyof typeof TIKTOK_PRODUCT_CATALOG] ||
                  TIKTOK_PRODUCT_CATALOG.pro_monthly;

  trackTikTokEvent('ViewContent', {
    content_name: product.content_name,
    content_type: product.content_type,
    content_id: product.content_id
  });
};

/**
 * Track add to cart (for subscription signup)
 */
export const trackTikTokAddToCart = (productId: string = 'sheetyai_pro_monthly') => {
  const product = TIKTOK_PRODUCT_CATALOG[productId as keyof typeof TIKTOK_PRODUCT_CATALOG] ||
                  TIKTOK_PRODUCT_CATALOG.pro_monthly;

  trackTikTokEvent('AddToCart', {
    content_name: product.content_name,
    content_type: product.content_type,
    content_id: product.content_id,
    value: product.price,
    currency: product.currency,
    quantity: 1
  });
};

/**
 * Track initiate checkout
 */
export const trackTikTokInitiateCheckout = (productId: string = 'sheetyai_pro_monthly') => {
  const product = TIKTOK_PRODUCT_CATALOG[productId as keyof typeof TIKTOK_PRODUCT_CATALOG] ||
                  TIKTOK_PRODUCT_CATALOG.pro_monthly;

  trackTikTokEvent('InitiateCheckout', {
    content_name: product.content_name,
    content_type: product.content_type,
    content_id: product.content_id,
    value: product.price,
    currency: product.currency,
    quantity: 1
  });
};

/**
 * Track user engagement events (account creation, first message, etc.)
 */
export const trackTikTokUserEngagement = (action: string, parameters?: TikTokEventData) => {
  trackTikTokEvent('UserEngagement', {
    action,
    ...parameters
  });
};

/**
 * Track lead generation (account creation)
 */
export const trackTikTokLead = (parameters?: TikTokEventData) => {
  trackTikTokEvent('Lead', {
    content_name: 'Account Creation',
    content_type: 'lead',
    ...parameters
  });
};

/**
 * Track custom conversion events
 */
export const trackTikTokConversion = (conversionType: string, parameters?: TikTokEventData) => {
  trackTikTokEvent(conversionType, parameters);
};

/**
 * Initialize TikTok Pixel (called from layout)
 */
export const initTikTokPixel = (pixelId: string) => {
  if (typeof window !== 'undefined') {
    console.log(`TikTok Pixel initialized with ID: ${pixelId}`);
  }
};
