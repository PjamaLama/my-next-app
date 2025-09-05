/**
 * Meta Pixel Integration for SheetyAI
 * Handles tracking events and product catalog integration
 */

declare global {
  interface Window {
    fbq: (action: string, eventName: string, parameters?: any) => void;
  }
}

export interface ProductData {
  id: string;
  name: string;
  price: number;
  currency: string;
  category?: string;
  brand?: string;
}

export interface PurchaseData {
  value: number;
  currency: string;
  content_name?: string;
  content_type?: string;
  content_ids?: string[];
  product_catalog_id?: string;
  num_items?: number;
}

// Product catalog configuration
export const PRODUCT_CATALOG = {
  id: 'SHEETYAI_PRO_CATALOG',
  products: {
    pro_monthly: {
      id: 'sheetyai_pro_monthly',
      name: 'SheetyAI Pro Monthly Subscription',
      price: 19.97,
      currency: 'USD',
      category: 'Software Subscription',
      brand: 'SheetyAI'
    },
    pro_yearly: {
      id: 'sheetyai_pro_yearly',
      name: 'SheetyAI Pro Yearly Subscription',
      price: 199.97,
      currency: 'USD',
      category: 'Software Subscription',
      brand: 'SheetyAI'
    }
  }
};

/**
 * Track a custom event
 */
export const trackEvent = (eventName: string, parameters?: any) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', eventName, parameters);
    console.log(`Meta Pixel: Tracked ${eventName}`, parameters);
  }
};

/**
 * Track a purchase event
 */
export const trackPurchase = (purchaseData: PurchaseData) => {
  const defaultParams: PurchaseData = {
    content_name: 'SheetyAI Pro Subscription',
    content_type: 'product',
    content_ids: ['sheetyai_pro_monthly'],
    product_catalog_id: PRODUCT_CATALOG.id,
    num_items: 1,
    ...purchaseData
  };

  trackEvent('Purchase', defaultParams);
};

/**
 * Track product view
 */
export const trackViewContent = (productId: string = 'sheetyai_pro_monthly') => {
  trackEvent('ViewContent', {
    content_ids: [productId],
    content_type: 'product',
    product_catalog_id: PRODUCT_CATALOG.id
  });
};

/**
 * Track add to cart (for subscription signup)
 */
export const trackAddToCart = (productId: string = 'sheetyai_pro_monthly') => {
  trackEvent('AddToCart', {
    content_ids: [productId],
    content_type: 'product',
    product_catalog_id: PRODUCT_CATALOG.id,
    value: 19.97,
    currency: 'USD'
  });
};

/**
 * Track initiate checkout
 */
export const trackInitiateCheckout = (productId: string = 'sheetyai_pro_monthly') => {
  trackEvent('InitiateCheckout', {
    content_ids: [productId],
    content_type: 'product',
    product_catalog_id: PRODUCT_CATALOG.id,
    value: 19.97,
    currency: 'USD',
    num_items: 1
  });
};

/**
 * Track user engagement events
 */
export const trackUserEngagement = (action: string, parameters?: any) => {
  trackEvent('trackCustom', {
    customEventName: 'UserEngagement',
    action,
    ...parameters
  });
};

/**
 * Initialize Meta Pixel (called from layout)
 */
export const initMetaPixel = (pixelId: string) => {
  if (typeof window !== 'undefined') {
    // Meta Pixel base code is already in layout.tsx
    // This function can be used for additional initialization if needed
    console.log(`Meta Pixel initialized with ID: ${pixelId}`);
  }
};
