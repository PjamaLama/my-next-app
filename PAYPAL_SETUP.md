# 🚀 PayPal Setup Guide

## The Problem
Your app is showing `invalid_client` error because PayPal credentials are missing or incorrect.

## Quick Fix

### 1. Get PayPal Credentials
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Sign in with your PayPal account
3. Click "My Apps & Credentials"
4. Create a new app or use existing one

### 2. Copy Credentials
For **Sandbox** (testing):
- **Client ID**: Your sandbox client ID
- **Secret**: Your sandbox secret

For **Production** (live payments):
- **Client ID**: Your live client ID
- **Secret**: Your live secret

### 3. Add to Environment Variables

Create/update your `.env.local` file:

```bash
# For Development (Sandbox)
PAYPAL_CLIENT_ID=AZXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PAYPAL_SECRET_KEY=EPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PAYPAL_WEBHOOK_ID=WH-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# For Production (Live)
# PAYPAL_CLIENT_ID=AZXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
# PAYPAL_SECRET_KEY=EPXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
# PAYPAL_WEBHOOK_ID=WH-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 4. Configure Webhooks (Important for Security)

**For Sandbox:**
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Navigate to your app → "Webhooks"
3. Click "Add Webhook"
4. Set Webhook URL: `http://localhost:3000/api/paypal/webhook`
5. Subscribe to these events:
   - `PAYMENT.SALE.COMPLETED`
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.RENEWED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
6. Copy the Webhook ID and add it to your `.env.local` as `PAYPAL_WEBHOOK_ID`

**For Production:**
- Use your production domain instead of localhost
- Follow the same webhook setup process

### 5. Test Setup

Visit: `http://localhost:3000/api/paypal/debug`

This will show you:
- ✅ Whether credentials are set
- ✅ Environment (development/sandbox)
- 🧪 Test your credentials

**New Webhook Debug:** `http://localhost:3000/api/paypal/webhook-debug`
- ✅ Whether webhook is configured
- ✅ Required headers for signature verification
- 📋 Setup instructions

### 6. Restart Development Server

```bash
npm run dev
```

## Expected Flow

1. User clicks "Upgrade to Pro"
2. Modal shows pricing plans (Free + Pro)
3. User clicks Pro → Shows PayPal payment screen
4. User clicks "Continue to PayPal" → Redirects to PayPal
5. User completes payment → Returns to app as Pro user

## Troubleshooting

**Still getting errors?**
- Check the debug page: `http://localhost:3000/api/paypal/debug`
- Make sure you're using **Sandbox** credentials for development
- Verify credentials are not expired
- Check console for detailed error messages

**Need help?**
- The debug page will show exactly what's wrong
- Console logs will show detailed error information
