"use client";

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { trackAddPaymentInfo, createUserData } from '../../lib/metaConversionsAPI';
import { useFirebase } from '../providers/FirebaseProvider';

interface PayPalSubscriptionProps {
  planId?: string;
  clientId: string;
  amount: string;
  onSuccess?: (subscriptionId: string) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export default function PayPalSubscription({
  planId,
  clientId,
  amount,
  onSuccess,
  onError,
  onCancel
}: PayPalSubscriptionProps) {
  const { user } = useFirebase();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializePayPal();
  }, []);

  const initializePayPal = async () => {
    try {
      // Load PayPal SDK
      if (!window.paypal) {
        await loadPayPalSDK();
      }

      // Get or create plan
      const planIdToUse = planId || await getOrCreatePlan();

      // Render PayPal button
      renderPayPalButton(planIdToUse);

      // Track AddPaymentInfo when PayPal button is ready
      const trackPaymentInfo = async () => {
        const userData = createUserData({
          email: user?.email || undefined,
          clientUserAgent: navigator.userAgent
        });

        await trackAddPaymentInfo({
          userData,
          eventSourceUrl: window.location.href,
          testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
        });
      };

      trackPaymentInfo();

      setIsLoading(false);
    } catch (err: any) {
      console.error('PayPal initialization error:', err);
      setError(err.message || 'Failed to load PayPal');
      setIsLoading(false);
      if (onError) {
        onError(err);
      }
    }
  };

  const loadPayPalSDK = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if PayPal SDK is already loaded
      if (window.paypal) {
        resolve();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Failed to load PayPal SDK')));
        return;
      }

      // Use sandbox in development if sandbox credentials are available
      const hasSandboxCredentials = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID;
      const isProduction = process.env.NODE_ENV === 'production' || !hasSandboxCredentials;

      const paypalUrl = isProduction ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';
      const paypalClientId = isProduction
        ? clientId
        : process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID || clientId;

      const script = document.createElement('script');
      script.src = `${paypalUrl}/sdk/js?client-id=${paypalClientId}&components=buttons&vault=true&intent=subscription`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load PayPal SDK'));

      try {
        // Safely append to head to avoid hydration issues
        if (document.head) {
          document.head.appendChild(script);
        } else {
          // Fallback to body if head is not available
          document.body.appendChild(script);
        }
      } catch (error) {
        reject(new Error(`Failed to append PayPal script: ${error}`));
      }
    });
  };

  const getOrCreatePlan = async (): Promise<string> => {
    const response = await fetch('/api/paypal/manage-plan', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get subscription plan');
    }

    console.log('✅ Subscription plan ready:', data.plan.id);
    return data.plan.id;
  };

  const renderPayPalButton = (planIdToUse: string) => {
    if (!window.paypal) {
      console.warn('PayPal SDK not loaded, skipping button render');
      return;
    }

    // Wait for the DOM element to be available
    const waitForContainer = () => {
      const container = document.getElementById('paypal-button-container');
      if (container) {
        try {
          // Clear any existing content in the container safely
          while (container.firstChild) {
            container.removeChild(container.firstChild);
          }

          window.paypal.Buttons({
            createSubscription: (data: any, actions: any) =>
              actions.subscription.create({ plan_id: planIdToUse }),

            onApprove: (data: any) => {
              console.log('PayPal subscription approved:', data);
              const successUrl = `${window.location.origin}/paypal-success?type=subscription&subscription_id=${data.subscriptionID}`;
              window.location.href = successUrl;
              if (onSuccess) onSuccess(data.subscriptionID);
            },

            onError: (err: any) => {
              console.error('PayPal subscription error:', err);
              if (onError) onError(err);
            },

            onCancel: (data: any) => {
              console.log('PayPal subscription cancelled:', data);
              if (onCancel) onCancel();
            }
          }).render('#paypal-button-container');
        } catch (error) {
          console.error('Failed to render PayPal button:', error);
          if (onError) onError(error);
        }
      } else {
        // If container not found, wait a bit and try again (max 10 attempts)
        let attempts = 0;
        const maxAttempts = 10;
        const retryInterval = setInterval(() => {
          attempts++;
          const retryContainer = document.getElementById('paypal-button-container');
          if (retryContainer || attempts >= maxAttempts) {
            clearInterval(retryInterval);
            if (retryContainer) {
              waitForContainer();
            } else {
              console.error('PayPal button container not found after maximum attempts');
              if (onError) onError(new Error('PayPal button container not available'));
            }
          }
        }, 100);
      }
    };

    waitForContainer();
  };

  if (error) {
    return (
      <div className="text-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
        <div className="text-gray-300 text-sm mb-4">
          Monthly subscription: <span className="text-white font-semibold">${amount}</span>
        </div>

        <div id="paypal-button-container" className="flex justify-center">
          {isLoading && (
            <div className="flex items-center gap-2 text-blue-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading PayPal...
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center space-y-1">
          <p>🔒 Secure payment powered by PayPal</p>
          <p>📅 Cancel anytime • 30-day money back guarantee</p>
        </div>
      </div>
    </div>
  );
}