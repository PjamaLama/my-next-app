import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../../lib/firebaseAdmin';
import crypto from 'crypto';
import https from 'https';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log('PayPal webhook received:', eventType, resource?.id);

    // Verify webhook signature for security
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const transmissionId = req.headers['paypal-transmission-id'] as string;
    const transmissionTime = req.headers['paypal-transmission-time'] as string;
    const transmissionSig = req.headers['paypal-transmission-sig'] as string;
    const authAlgo = req.headers['paypal-auth-algo'] as string;
    const certUrl = req.headers['paypal-cert-url'] as string;

    // Check if all required headers are present
    if (!webhookId || !transmissionId || !transmissionTime || !transmissionSig || !authAlgo || !certUrl) {
      console.error('PayPal webhook: Missing required headers for signature verification');
      return res.status(400).json({ error: 'Missing required webhook headers' });
    }

    // Get PayPal configuration - auto-detect environment
    const isProduction = process.env.NODE_ENV === 'production';

    const clientId = isProduction
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;

    const clientSecret = isProduction
      ? process.env.PAYPAL_SECRET_KEY
      : process.env.PAYPAL_SANDBOX_SECRET_KEY || process.env.PAYPAL_SECRET_KEY;

    if (!clientId || !clientSecret) {
      console.error('PayPal webhook: Missing PayPal credentials');
      return res.status(500).json({ error: 'PayPal configuration error' });
    }

    try {
      // Manual webhook signature verification following PayPal's documentation
      const isValid = await verifyPayPalWebhookSignature({
        webhookId,
        transmissionId,
        transmissionTime,
        transmissionSig,
        authAlgo,
        certUrl,
        webhookEvent: JSON.stringify(event)
      });

      if (!isValid) {
        console.error('PayPal webhook: Signature verification failed');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      console.log('✅ PayPal webhook signature verified successfully');
    } catch (verificationError) {
      console.error('PayPal webhook: Signature verification error:', verificationError);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();
    const auth = getAdminAuth();

    switch (eventType) {
      case 'PAYMENT.SALE.COMPLETED':
        // Handle successful payment
        await handlePaymentCompleted(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.CREATED':
        // Handle subscription creation (backup to our success handler)
        await handleSubscriptionCreated(db, auth, resource);
        break;

      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        // Handle subscription activation
        await handleSubscriptionActivated(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.RENEWED':
        // Handle subscription renewal
        await handleSubscriptionRenewed(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        // Handle subscription cancellation
        await handleSubscriptionCancelled(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        // Handle subscription suspension
        await handleSubscriptionSuspended(db, resource);
        break;

      case 'PAYMENT.SALE.PENDING':
        // Handle pending payment
        await handlePaymentPending(db, resource);
        break;

      case 'PAYMENT.SALE.DENIED':
        // Handle denied payment
        await handlePaymentDenied(db, resource);
        break;

      case 'PAYMENT.SALE.REFUNDED':
        // Handle refunded payment
        await handlePaymentRefunded(db, resource);
        break;

      case 'PAYMENT.SALE.REVERSED':
        // Handle reversed payment
        await handlePaymentReversed(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        // Handle subscription expiration
        await handleSubscriptionExpired(db, resource);
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        // Handle subscription payment failure
        await handleSubscriptionPaymentFailed(db, resource);
        break;

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });

  } catch (err: any) {
    console.error('PayPal webhook error:', err);
    // Still return 200 to prevent PayPal from retrying
    res.status(200).json({ error: err.message });
  }
}

async function handlePaymentCompleted(db: any, resource: any) {
  const subscriptionId = resource.billing_agreement_id;

  if (!subscriptionId) {
    console.log('No subscription ID in payment completed event');
    return;
  }

  console.log(`Payment completed for subscription: ${subscriptionId}`);

  // Update subscription status if needed
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // Update subscription status and extend end date if it's a renewal
    const subscriptionUpdate = {
      ...userData.subscription,
      status: 'active',
      lastPaymentDate: new Date(),
      lastUpdated: new Date()
    };

    await userDoc.ref.update({
      subscription: subscriptionUpdate
    });

    console.log(`✅ Updated subscription status for user ${userDoc.id}`);
  }
}

async function handleSubscriptionCreated(db: any, auth: any, resource: any) {
  console.log(`Subscription created: ${resource.id}`);
  // This is handled by our subscription-success API, but webhook provides backup
}

async function handleSubscriptionActivated(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription activated: ${subscriptionId}`);

  // Find user by subscription ID and ensure they're marked as pro
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'pro',
      'subscription.status': 'active',
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Activated subscription for user ${userDoc.id}`);
  }
}

async function handleSubscriptionRenewed(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription renewed: ${subscriptionId}`);

  // Find user and extend their subscription
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // Extend subscription by one month
    const currentEndDate = userData.subscription?.endDate?.toDate() || new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + 1);

    await userDoc.ref.update({
      userType: 'pro',
      'subscription.status': 'active',
      'subscription.endDate': newEndDate,
      'subscription.lastRenewalDate': new Date(),
      'subscription.lastUpdated': new Date()
    });

    console.log(`✅ Renewed subscription for user ${userDoc.id} until ${newEndDate.toISOString()}`);
  }
}

async function handleSubscriptionCancelled(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription cancelled: ${subscriptionId}`);

  // Find user and update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'free', // Downgrade to free
      'subscription.status': 'cancelled',
      'subscription.cancelledAt': new Date(),
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Cancelled subscription for user ${userDoc.id}`);
  }
}

async function handleSubscriptionSuspended(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription suspended: ${subscriptionId}`);

  // Find user and update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'free', // Suspend access
      'subscription.status': 'suspended',
      'subscription.suspendedAt': new Date(),
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Suspended subscription for user ${userDoc.id}`);
  }
}

async function handlePaymentPending(db: any, resource: any) {
  const subscriptionId = resource.billing_agreement_id;
  console.log(`Payment pending for subscription: ${subscriptionId}`);

  if (!subscriptionId) return;

  // Update subscription status to pending
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      'subscription.status': 'pending',
      'subscription.lastPaymentStatus': 'pending',
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Updated payment status to pending for user ${userDoc.id}`);
  }
}

async function handlePaymentDenied(db: any, resource: any) {
  const subscriptionId = resource.billing_agreement_id;
  console.log(`Payment denied for subscription: ${subscriptionId}`);

  if (!subscriptionId) return;

  // Update subscription status and potentially suspend
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // If this is a recurring subscription payment that failed, suspend the subscription
    if (userData?.subscription?.status === 'active') {
      await userDoc.ref.update({
        userType: 'free', // Temporarily suspend access
        'subscription.status': 'payment_failed',
        'subscription.lastPaymentStatus': 'denied',
        'subscription.paymentFailureDate': new Date(),
        'subscription.lastUpdated': new Date()
      });
      console.log(`✅ Suspended subscription due to payment denial for user ${userDoc.id}`);
    }
  }
}

async function handlePaymentRefunded(db: any, resource: any) {
  const subscriptionId = resource.billing_agreement_id;
  console.log(`Payment refunded for subscription: ${subscriptionId}`);

  if (!subscriptionId) return;

  // Update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'free', // Refund typically means cancel access
      'subscription.status': 'refunded',
      'subscription.refundDate': new Date(),
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Processed refund for user ${userDoc.id}`);
  }
}

async function handlePaymentReversed(db: any, resource: any) {
  const subscriptionId = resource.billing_agreement_id;
  console.log(`Payment reversed for subscription: ${subscriptionId}`);

  if (!subscriptionId) return;

  // Update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'free', // Reverse typically means cancel access
      'subscription.status': 'reversed',
      'subscription.reverseDate': new Date(),
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Processed payment reversal for user ${userDoc.id}`);
  }
}

async function handleSubscriptionExpired(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription expired: ${subscriptionId}`);

  // Find user and update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    await userDoc.ref.update({
      userType: 'free', // Subscription expired
      'subscription.status': 'expired',
      'subscription.expiredAt': new Date(),
      'subscription.lastUpdated': new Date()
    });
    console.log(`✅ Processed subscription expiration for user ${userDoc.id}`);
  }
}

async function handleSubscriptionPaymentFailed(db: any, resource: any) {
  const subscriptionId = resource.id;
  console.log(`Subscription payment failed: ${subscriptionId}`);

  // Find user and update subscription status
  const usersRef = db.collection('users');
  const querySnapshot = await usersRef.where('subscription.paypalSubscriptionId', '==', subscriptionId).get();

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // Check if this is a recurring failure - if so, suspend
    const failureCount = (userData?.subscription?.paymentFailureCount || 0) + 1;

    if (failureCount >= 3) {
      // Multiple failures - suspend subscription
      await userDoc.ref.update({
        userType: 'free',
        'subscription.status': 'suspended',
        'subscription.paymentFailureCount': failureCount,
        'subscription.suspendedAt': new Date(),
        'subscription.lastUpdated': new Date()
      });
      console.log(`✅ Suspended subscription after ${failureCount} payment failures for user ${userDoc.id}`);
    } else {
      // First failure - just update count
      await userDoc.ref.update({
        'subscription.status': 'payment_failed',
        'subscription.paymentFailureCount': failureCount,
        'subscription.lastPaymentFailure': new Date(),
        'subscription.lastUpdated': new Date()
      });
      console.log(`✅ Recorded payment failure (${failureCount}/3) for user ${userDoc.id}`);
    }
  }
}

// Manual PayPal webhook signature verification
async function verifyPayPalWebhookSignature(params: {
  webhookId: string;
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  authAlgo: string;
  certUrl: string;
  webhookEvent: string;
}): Promise<boolean> {
  try {
    const {
      webhookId,
      transmissionId,
      transmissionTime,
      transmissionSig,
      authAlgo,
      certUrl,
      webhookEvent
    } = params;

    // Create the expected signature string
    const expectedSignature = `${transmissionId}|${transmissionTime}|${webhookEvent}|${webhookId}`;

    // Fetch the PayPal certificate
    const certificate = await fetchCertificate(certUrl);
    if (!certificate) {
      console.error('Failed to fetch PayPal certificate');
      return false;
    }

    // Verify the signature based on algorithm
    const isValid = verifySignature(expectedSignature, transmissionSig, certificate, authAlgo);

    return isValid;
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
}

// Fetch certificate from PayPal's certificate URL
function fetchCertificate(certUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    https.get(certUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      console.error('Error fetching certificate:', err);
      resolve(null);
    });
  });
}

// Verify signature using the appropriate algorithm
function verifySignature(
  expectedSignature: string,
  transmissionSig: string,
  certificate: string,
  authAlgo: string
): boolean {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(expectedSignature, 'utf8');

    // Decode base64 signature
    const signature = Buffer.from(transmissionSig, 'base64');

    return verify.verify(certificate, signature);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
