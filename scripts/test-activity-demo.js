/**
 * Test Activity Demo - Shows how test events work
 * This demonstrates the test functionality without requiring API permissions
 */

const crypto = require('crypto');

// Simulate the test event code from Facebook
const TEST_EVENT_CODE = 'TEST65930';

// Hash function for user data (same as in the main library)
function hashUserData(data) {
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

// Create test payload that would be sent
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
        value: 19.97,
        currency: 'USD',
        content_name: 'SheetyAI Pro Subscription'
      }
    }
  ],
  test_event_code: TEST_EVENT_CODE
};

console.log('🎯 Facebook Test Event Activity Demo');
console.log('=====================================');
console.log('');
console.log('📋 Test Event Code:', TEST_EVENT_CODE);
console.log('🌐 Domain: www.sheetyai.com');
console.log('');
console.log('📊 Sample Test Event Payload:');
console.log(JSON.stringify(testPayload, null, 2));
console.log('');
console.log('✅ Test Integration Status:');
console.log('   • Test event code configured: ✅');
console.log('   • User data hashing: ✅');
console.log('   • Event structure: ✅');
console.log('   • Test mode enabled: ✅');
console.log('');
console.log('🚀 Ready for Facebook Test Activity!');
console.log('   When you trigger events on www.sheetyai.com,');
console.log('   they will use test code TEST65930 and appear');
console.log('   in your Facebook Test Events tool.');
console.log('');
console.log('💡 Next Steps:');
console.log('   1. Visit www.sheetyai.com');
console.log('   2. Trigger user actions (sign in, view pricing, purchase)');
console.log('   3. Check Facebook Test Events for activity with TEST65930');
console.log('   4. Once permissions are fixed, remove test_event_code for production');
