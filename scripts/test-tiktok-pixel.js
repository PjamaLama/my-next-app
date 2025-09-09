/**
 * Test script for TikTok pixel setup
 * Run with: node scripts/test-tiktok-pixel.js
 */

const https = require('https');

console.log('🎯 Testing TikTok Pixel Setup...\n');

// Test the pixel endpoint
const pixelId = 'D2VDTKRC77U649U8UH9G';

console.log(`Pixel ID: ${pixelId}`);
console.log('Testing pixel endpoint...\n');

// Test the SDK endpoint (this is what the browser actually loads)
const testOptions = {
  hostname: 'analytics.tiktok.com',
  port: 443,
  path: `/i18n/pixel/sdk.js?sdkid=${pixelId}`,
  method: 'HEAD', // HEAD request to just check if endpoint exists
  timeout: 10000
};

const req = https.request(testOptions, (res) => {
  console.log(`✅ Pixel endpoint response: ${res.statusCode}`);

  if (res.statusCode === 200) {
    console.log('✅ Pixel endpoint is accessible');
    console.log('\n📋 Next steps to verify pixel:');
    console.log('1. Visit http://localhost:3000 in your browser');
    console.log('2. Open Developer Tools → Network tab');
    console.log('3. Look for requests to analytics.tiktok.com');
    console.log('4. You should see a test panel in bottom-right corner (dev mode only)');
    console.log('5. Click the test buttons to fire events');
    console.log('6. Use TikTok Pixel Helper browser extension to verify');
  } else {
    console.log('❌ Pixel endpoint returned error status');
  }

  res.on('data', () => {});
  res.on('end', () => {
    console.log('\n🔗 TikTok Pixel Helper: https://developers.tiktok.com/i18n/pixel/');
    console.log('💡 Install the TikTok Pixel Helper browser extension for easy testing');
  });
});

req.on('error', (error) => {
  console.error('❌ Failed to test pixel endpoint:', error.message);
  console.log('\n🔗 TikTok Pixel Helper: https://developers.tiktok.com/i18n/pixel/');
});

req.on('timeout', () => {
  console.log('⏰ Request timed out - pixel endpoint may be slow');
  req.destroy();
});

req.end();
