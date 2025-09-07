/**
 * Test script for Facebook Conversions API setup
 * Run with: node scripts/test-conversions-api.js
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const cleanKey = key.trim();
        const cleanValue = valueParts.join('=').trim();
        if (cleanKey && cleanValue) {
          envVars[cleanKey] = cleanValue;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.error('❌ Could not load .env.local file:', error.message);
    console.log('Please create .env.local with your META_CONVERSIONS_API_TOKEN');
    return {};
  }
}

// Load environment variables
const envVars = loadEnvFile();

// Test configuration
const PIXEL_ID = envVars.NEXT_PUBLIC_META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '1447640459621523';
const ACCESS_TOKEN = envVars.META_CONVERSIONS_API_TOKEN || process.env.META_CONVERSIONS_API_TOKEN || 'EAAQ1TZC3ZBYQEBPRTQzfZBej0lMsln9OlGm883afgmqdgyAro0JJupjrFzlCdf95zmSrQLCUeslxechA9YeaZAWOWiS6khfwtZBz3xOOEiCGyjGXGZBzP8XZBZAHx6qSfJTuCXmiyyOsrsZCZBOvF8EUHYvOMF9iCfcFgxpVdKVYkbSFGk8mOuXoKvcUKLdZCbK81zleQZDZD';
const API_VERSION = 'v18.0';

if (!ACCESS_TOKEN) {
  console.error('❌ META_CONVERSIONS_API_TOKEN environment variable not set');
  console.log('Please create .env.local file with:');
  console.log('META_CONVERSIONS_API_TOKEN=your_token_here');
  console.log('NEXT_PUBLIC_META_PIXEL_ID=1478214820196184');
  process.exit(1);
}

// Hash function for user data
function hashUserData(data) {
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

// Create test payload
const testPayload = {
  data: [
    {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: `test_${Date.now()}`,
      user_data: {
        em: [hashUserData('test@example.com')],
        client_user_agent: 'Test Script'
      },
      custom_data: {
        value: 0.01,
        currency: 'USD',
        content_name: 'Conversions API Test'
      }
    }
  ],
  test_event_code: 'TEST65930'
};

console.log('🚀 Testing Facebook Conversions API...');
console.log('Pixel ID:', PIXEL_ID);
console.log('Test Event Code:', testPayload.test_event_code);

// Check if we can access the pixel
console.log('\n🔍 Checking pixel access...');

const pixelCheckOptions = {
  hostname: 'graph.facebook.com',
  port: 443,
  path: `/v18.0/${PIXEL_ID}?access_token=${ACCESS_TOKEN}`,
  method: 'GET'
};

const pixelReq = https.request(pixelCheckOptions, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);

      if (res.statusCode === 200) {
        console.log('✅ Pixel is accessible!');
        console.log('Pixel info:', response.name || 'Unknown name');
        console.log('\n📤 Testing Conversions API...');
        makeConversionRequest();
      } else {
        console.log('❌ Cannot access pixel:', response.error?.message);
        console.log('\n💡 Possible solutions:');
        console.log('1. Verify the Pixel ID is correct');
        console.log('2. Ensure the access token has Conversions API permissions');
        console.log('3. Check if you need to use Dataset ID instead of Pixel ID');
        console.log('4. Verify the pixel is associated with your app/business account');
      }
    } catch (error) {
      console.error('❌ Failed to parse pixel response:', error.message);
    }
  });
});

pixelReq.on('error', (error) => {
  console.error('❌ Pixel check request failed:', error.message);
});

pixelReq.end();

function makeConversionRequest() {
  // Make the API request
  const postData = JSON.stringify(testPayload);
  const options = {
    hostname: 'graph.facebook.com',
    port: 443,
    path: `/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(data);

        if (res.statusCode === 200) {
          console.log('✅ Success! Conversions API is working correctly.');
          console.log('Response:', JSON.stringify(response, null, 2));

          if (response.events_received === 1) {
            console.log('✅ Test event was received successfully!');
            console.log('\n📝 Next steps:');
            console.log('1. Remove test_event_code from your production code');
            console.log('2. Integrate tracking into your components');
            console.log('3. Test with real user data (properly hashed)');
          }
        } else {
          console.log('❌ API Error:', response.error?.message || 'Unknown error');
          console.log('Full response:', response);
        }
      } catch (error) {
        console.error('❌ Failed to parse response:', error.message);
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.write(postData);
  req.end();
}
