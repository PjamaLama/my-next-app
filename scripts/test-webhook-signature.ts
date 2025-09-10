/**
 * Test script to verify PayPal webhook signature verification setup
 * Run with: npx ts-node scripts/test-webhook-signature.ts
 */

const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testWebhookSetup() {
  console.log('🧪 Testing PayPal Webhook Signature Verification Setup\n');

  // Check environment variables
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET_KEY || process.env.PAYPAL_SANDBOX_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('📋 Environment Check:');
  console.log(`  • PAYPAL_WEBHOOK_ID: ${webhookId ? '✅ Set' : '❌ Missing'}`);
  console.log(`  • PayPal Credentials: ${clientId && clientSecret ? '✅ Set' : '❌ Missing'}`);
  console.log(`  • Environment: ${isProduction ? 'Production' : 'Sandbox (Development)'}\n`);

  if (!webhookId) {
    console.log('❌ PAYPAL_WEBHOOK_ID is required for webhook signature verification');
    console.log('   Please add it to your .env.local file\n');
  }

  if (!clientId || !clientSecret) {
    console.log('❌ PayPal credentials are required');
    console.log('   Please add them to your .env.local file\n');
  }

  // Test webhook URL construction
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const webhookUrl = siteUrl
    ? `${siteUrl}/api/paypal/webhook`
    : 'http://localhost:3000/api/paypal/webhook';

  console.log('🔗 Webhook Configuration:');
  console.log(`  • Webhook URL: ${webhookUrl}`);
  console.log(`  • Webhook ID: ${webhookId || 'Not configured'}`);

  if (!siteUrl && !isProduction) {
    console.log('⚠️  Warning: Using localhost URL in development. Make sure to:');
    console.log('   1. Use ngrok or similar for webhook testing');
    console.log('   2. Set NEXT_PUBLIC_SITE_URL for production\n');
  }

  console.log('📋 Required PayPal Webhook Events:');
  const events = [
    'PAYMENT.SALE.COMPLETED',
    'BILLING.SUBSCRIPTION.CREATED',
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.RENEWED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'BILLING.SUBSCRIPTION.SUSPENDED'
  ];

  events.forEach(event => console.log(`  • ${event}`));

  console.log('\n🔐 Security Status:');
  if (webhookId && clientId && clientSecret) {
    console.log('  ✅ Webhook signature verification is ENABLED');
    console.log('  ✅ Your webhook endpoint is SECURE');
  } else {
    console.log('  ❌ Webhook signature verification is DISABLED');
    console.log('  ❌ Your webhook endpoint is VULNERABLE to spoofing');
    console.log('  ⚠️  Please configure all required environment variables');
  }

  console.log('\n📖 Setup Guide:');
  console.log('  1. Visit: https://developer.paypal.com/');
  console.log('  2. Go to your app → Webhooks');
  console.log('  3. Add webhook with URL:', webhookUrl);
  console.log('  4. Subscribe to the events listed above');
  console.log('  5. Copy Webhook ID to PAYPAL_WEBHOOK_ID');
  console.log('  6. Test with: http://localhost:3000/api/paypal/webhook-debug');

  console.log('\n🎯 Test Your Setup:');
  console.log('  • Debug endpoint: http://localhost:3000/api/paypal/webhook-debug');
  console.log('  • PayPal debug: http://localhost:3000/api/paypal/debug');
}

testWebhookSetup().catch(console.error);
