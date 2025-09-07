/**
 * Examples for using the Meta Conversions API
 * This file demonstrates how to implement the Conversions API in your application
 */

import {
  trackPurchase,
  trackViewContent,
  trackCompleteRegistration,
  trackInitiateCheckout,
  trackSubscribe,
  trackAddPaymentInfo,
  trackCombinedPurchase,
  trackCombinedViewContent,
  createUserData,
  sendConversionEvents,
  ConversionEvent,
  UserData
} from './metaConversionsAPI';

/**
 * Example: Track a purchase event
 */
export const examplePurchaseTracking = async () => {
  // Create user data (with proper hashing)
  const userData = createUserData({
    email: 'user@example.com',
    phone: '+1234567890',
    firstName: 'John',
    lastName: 'Doe',
    clientIpAddress: '192.168.1.1',
    clientUserAgent: 'Mozilla/5.0...'
  });

  // Track purchase with Conversions API
  const result = await trackPurchase({
    userData,
    value: 19.97,
    currency: 'USD',
    contentName: 'SheetyAI Pro Monthly',
    contentIds: ['sheetyai_pro_monthly'],
    orderId: 'order_12345',
    numItems: 1,
    eventSourceUrl: 'https://sheetyai.com/pro',
    testEventCode: 'TEST12345' // Remove this for production
  });

  console.log('Purchase tracking result:', result);
  return result;
};

/**
 * Example: Combined tracking (both Meta Pixel and Conversions API)
 */
export const exampleCombinedPurchaseTracking = async () => {
  const userData = createUserData({
    email: 'user@example.com',
    clientUserAgent: 'Mozilla/5.0...'
  });

  // This sends to both Meta Pixel (client-side) and Conversions API (server-side)
  const result = await trackCombinedPurchase({
    userData,
    value: 199.97,
    currency: 'USD',
    contentName: 'SheetyAI Pro Yearly',
    contentIds: ['sheetyai_pro_yearly'],
    orderId: 'order_67890',
    numItems: 1,
    eventSourceUrl: 'https://sheetyai.com/pro',
    testEventCode: 'TEST67890'
  });

  console.log('Combined purchase tracking result:', result);
  return result;
};

/**
 * Example: Track user registration
 */
export const exampleRegistrationTracking = async () => {
  const userData = createUserData({
    email: 'newuser@example.com',
    clientUserAgent: 'Mozilla/5.0...'
  });

  const result = await trackCompleteRegistration({
    userData,
    eventSourceUrl: 'https://sheetyai.com/signup',
    testEventCode: 'TEST_REG_001'
  });

  console.log('Registration tracking result:', result);
  return result;
};

/**
 * Example: Batch multiple events
 */
export const exampleBatchEvents = async () => {
  const userData = createUserData({
    email: 'batch@example.com',
    clientUserAgent: 'Mozilla/5.0...'
  });

  const events: ConversionEvent[] = [
    {
      event_name: 'ViewContent',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: 'SheetyAI Pro Features',
        content_ids: ['pro_features_page']
      },
      event_source_url: 'https://sheetyai.com/pro'
    },
    {
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: userData,
      event_source_url: 'https://sheetyai.com/contact'
    }
  ];

  const result = await sendConversionEvents(events, 'TEST_BATCH_001');
  console.log('Batch events result:', result);
  return result;
};

/**
 * Example: How to integrate with your existing components
 */
export const integrateWithExistingComponents = {
  // In your PayPal success page
  paypalSuccessHandler: async (orderData: any) => {
    const userData = createUserData({
      email: orderData.customerEmail,
      clientUserAgent: navigator.userAgent
    });

    return await trackCombinedPurchase({
      userData,
      value: orderData.amount,
      currency: orderData.currency,
      contentName: orderData.productName,
      orderId: orderData.orderId,
      eventSourceUrl: window.location.href
    });
  },

  // In your signup form
  signupHandler: async (formData: { email: string; name: string }) => {
    const userData = createUserData({
      email: formData.email,
      firstName: formData.name.split(' ')[0],
      lastName: formData.name.split(' ').slice(1).join(' '),
      clientUserAgent: navigator.userAgent
    });

    return await trackCompleteRegistration({
      userData,
      eventSourceUrl: window.location.href
    });
  },

  // In your pricing page
  pricingPageView: async () => {
    const userData = createUserData({
      clientUserAgent: navigator.userAgent
    });

    return await trackCombinedViewContent({
      userData,
      contentName: 'Pricing Page',
      contentIds: ['pricing_page'],
      eventSourceUrl: window.location.href
    });
  }
};

/**
 * Environment setup reminder
 */
export const environmentSetup = {
  requiredEnvVars: [
    'META_CONVERSIONS_API_TOKEN',
    'NEXT_PUBLIC_META_PIXEL_ID'
  ],
  exampleEnvFile: `
# .env.local
META_CONVERSIONS_API_TOKEN=EAAQ1TZC3ZBYQEBPRTQzfZBej0lMsln9OlGm883afgmqdgyAro0JJupjrFzlCdf95zmSrQLCUeslxechA9YeaZAWOWiS6khfwtZBz3xOOEiCGyjGXGZBzP8XZBZAHx6qSfJTuCXmiyyOsrsZCZBOvF8EUHYvOMF9iCfcFgxpVdKVYkbSFGk8mOuXoKvcUKLdZCbK81zleQZDZD
NEXT_PUBLIC_META_PIXEL_ID=1447640459621523
  `
};

/**
 * Test your setup
 */
export const testSetup = async () => {
  console.log('Testing Conversions API setup...');

  const testResult = await trackPurchase({
    value: 0.01,
    currency: 'USD',
    contentName: 'Test Purchase',
    testEventCode: 'TEST_SETUP_001'
  });

  if (testResult.success) {
    console.log('✅ Conversions API is working correctly!');
  } else {
    console.error('❌ Conversions API setup failed:', testResult.error);
  }

  return testResult;
};
