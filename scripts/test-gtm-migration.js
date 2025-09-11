/**
 * Test script for GTM migration verification
 * Run this in browser console to test dataLayer events
 */

console.log('🧪 GTM Migration Test Suite');
console.log('==========================');

// Test 1: Check GTM script loaded
console.log('\n📋 Test 1: GTM Script Loading');
try {
  const gtmScript = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
  if (gtmScript) {
    console.log('✅ GTM script found:', gtmScript.src);
  } else {
    console.log('❌ GTM script not found');
  }
} catch (error) {
  console.log('❌ Error checking GTM script:', error);
}

// Test 2: Check dataLayer initialization
console.log('\n📋 Test 2: dataLayer Initialization');
try {
  if (typeof window.dataLayer !== 'undefined') {
    console.log('✅ dataLayer initialized');
    console.log('📊 Current dataLayer length:', window.dataLayer.length);
    console.log('📊 Last 3 dataLayer entries:', window.dataLayer.slice(-3));
  } else {
    console.log('❌ dataLayer not initialized');
  }
} catch (error) {
  console.log('❌ Error checking dataLayer:', error);
}

// Test 3: Simulate conversion events
console.log('\n📋 Test 3: Event Simulation');

const testEvents = [
  {
    name: 'sign_up',
    data: { value: 0, currency: 'USD' },
    description: 'Account creation event'
  },
  {
    name: 'first_message',
    data: { value: 0, currency: 'USD' },
    description: 'First message sent event'
  },
  {
    name: 'purchase',
    data: { value: 19.97, currency: 'USD', transaction_id: Date.now().toString() },
    description: 'Pro upgrade purchase event'
  }
];

testEvents.forEach((testEvent, index) => {
  setTimeout(() => {
    console.log(`🚀 Simulating ${testEvent.description}...`);
    try {
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: testEvent.name,
          ...testEvent.data
        });
        console.log(`✅ Event "${testEvent.name}" pushed to dataLayer:`, testEvent.data);
      } else {
        console.log(`❌ Cannot simulate ${testEvent.name} - window not available`);
      }
    } catch (error) {
      console.log(`❌ Error simulating ${testEvent.name}:`, error);
    }
  }, index * 1000);
});

// Test 4: Check for existing tracking conflicts
console.log('\n📋 Test 4: Tracking Conflicts Check');

setTimeout(() => {
  console.log('🔍 Checking for tracking conflicts...');

  // Check if both GTM and direct gtag exist
  const hasGTM = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
  const hasDirectGtag = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');

  if (hasGTM && hasDirectGtag) {
    console.log('⚠️ WARNING: Both GTM and direct gtag scripts detected - potential conflict');
  } else if (hasGTM) {
    console.log('✅ Only GTM detected - no conflicts');
  } else if (hasDirectGtag) {
    console.log('⚠️ Only direct gtag detected - migration may not be complete');
  } else {
    console.log('❌ No Google tracking scripts detected');
  }

  // Check for Meta Pixel
  const hasMetaPixel = document.querySelector('script[src*="connect.facebook.net"]');
  if (hasMetaPixel) {
    console.log('✅ Meta Pixel detected');
  } else {
    console.log('❌ Meta Pixel not found');
  }

  // Check for TikTok Pixel
  const hasTikTokPixel = document.querySelector('script[src*="analytics.tiktok.com"]');
  if (hasTikTokPixel) {
    console.log('✅ TikTok Pixel detected');
  } else {
    console.log('❌ TikTok Pixel not found');
  }

}, 4000);

// Test 5: Performance check
console.log('\n📋 Test 5: Performance Metrics');

setTimeout(() => {
  console.log('📊 Performance check...');

  // Check dataLayer size
  if (window.dataLayer) {
    const dataLayerSize = JSON.stringify(window.dataLayer).length;
    console.log(`📏 dataLayer size: ${dataLayerSize} bytes`);

    if (dataLayerSize > 100000) {
      console.log('⚠️ dataLayer size is large - consider cleanup');
    } else {
      console.log('✅ dataLayer size is reasonable');
    }
  }

  // Check for errors
  const errors = [];
  if (typeof window.gtag === 'undefined') {
    errors.push('Direct gtag not available (expected after migration)');
  }
  if (!window.dataLayer) {
    errors.push('dataLayer not initialized');
  }

  if (errors.length === 0) {
    console.log('✅ No critical errors detected');
  } else {
    console.log('❌ Issues found:', errors);
  }

  console.log('\n🎯 Test Summary:');
  console.log('- Check browser network tab for GTM requests');
  console.log('- Verify events in GTM Preview mode');
  console.log('- Check Google Ads and GA4 dashboards');
  console.log('- Monitor for console errors');

}, 5000);

console.log('\n⏳ Running tests... (results will appear above)');
console.log('💡 Tip: Open GTM Preview mode and watch for events');
console.log('🔗 GTM Preview: https://tagmanager.google.com/ > Container > Preview');
