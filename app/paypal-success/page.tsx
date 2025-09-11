"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { trackCombinedPurchase, createUserData } from '../../lib/metaConversionsAPI';

function PayPalSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useFirebase();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing your payment...');

  useEffect(() => {
    // Track Google Ads conversion using dataLayer for GTM
    const trackGoogleAdsConversion = () => {
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'purchase',
          value: 19.97,
          currency: 'USD',
          transaction_id: Date.now().toString()
        });
        console.log('Google Ads conversion tracked via GTM dataLayer');
      } else {
        console.warn('Google Ads conversion tracking failed - window not available');
      }
    };

    // Track Meta Pixel Purchase event with Conversions API
    const trackMetaPixelPurchase = async () => {
      if (user?.email) {
        const userData = createUserData({
          email: user.email,
          clientUserAgent: navigator.userAgent,
          clientIpAddress: undefined // Will be set server-side if available
        });

        await trackCombinedPurchase({
          userData,
          value: 19.97,
          currency: 'USD',
          contentName: 'SheetyAI Pro Subscription',
          contentIds: ['sheetyai_pro_monthly'],
          eventSourceUrl: window.location.href,
          testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
        });
      }
    };

    const handlePaymentSuccess = async () => {
      if (!searchParams) {
        setStatus('error');
        setMessage('Invalid URL parameters. Please try again.');
        return;
      }

      const paymentType = searchParams.get('type');
      const subscriptionId = searchParams.get('subscription_id');
      const paypalToken = searchParams.get('paypal_token');

      // Handle PayPal Subscription
      if (paymentType === 'subscription' && subscriptionId) {
        setMessage('Processing your PayPal subscription...');

        if (!user) {
          setStatus('error');
          setMessage('User not authenticated. Please log in and try again.');
          return;
        }

        try {
          // Call our subscription success API
          const token = await user.getIdToken();
          const response = await fetch(`/api/paypal/subscription-success?subscription_id=${subscriptionId}`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            setStatus('success');
            setMessage('🎉 Welcome to SheetyAI Pro! Your PayPal subscription is now active.');
            trackGoogleAdsConversion();
            await trackMetaPixelPurchase();

            // Redirect to main page after showing success message
            setTimeout(() => {
              router.push('/');
            }, 3000);
          } else {
            const error = await response.json();
            setStatus('error');
            setMessage(`Subscription setup failed: ${error.error || 'Please contact support.'}`);
          }
        } catch (error) {
          console.error('Subscription processing error:', error);
          setStatus('error');
          setMessage('Subscription processing failed. Please try again or contact support.');
        }
        return;
      }

      // Handle regular PayPal payment
      if (!paypalToken) {
        setStatus('error');
        setMessage('Missing payment token. Please try again.');
        return;
      }

      if (!user) {
        setStatus('error');
        setMessage('User not authenticated. Please log in and try again.');
        return;
      }

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/paypal/capture-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ paypalToken }),
        });

        if (response.ok) {
          const data = await response.json();
          setStatus('success');
          setMessage('🎉 Welcome to SheetyAI Pro! Your payment was successful.');
          trackGoogleAdsConversion();
          await trackMetaPixelPurchase();

          // Redirect to main page after showing success message
          setTimeout(() => {
            router.push('/');
          }, 3000);
        } else {
          const error = await response.json();
          setStatus('error');
          setMessage(`Payment processing failed: ${error.error || 'Please contact support.'}`);
        }
      } catch (error) {
        console.error('Payment capture error:', error);
        setStatus('error');
        setMessage('Payment processing failed. Please try again or contact support.');
      }
    };

    handlePaymentSuccess();
  }, [searchParams, user, router]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-white mb-2">Processing Payment</h1>
            <p className="text-gray-300">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-gray-300 mb-4">{message}</p>
            <p className="text-sm text-gray-400">
              You will be redirected to the main page in a few seconds...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Payment Error</h1>
            <p className="text-gray-300 mb-4">{message}</p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Return to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PayPalSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
          <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-spin" />
          <h1 className="text-2xl font-bold text-white mb-2">Loading...</h1>
          <p className="text-gray-300">Please wait while we process your payment.</p>
        </div>
      </div>
    }>
      <PayPalSuccessContent />
    </Suspense>
  );
}
