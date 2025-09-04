"use client";

import React, { useEffect, useRef } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

interface PayPalSmartButtonsProps {
  amount: string;
  currency?: string;
  onSuccess: (details: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
}

export default function PayPalSmartButtons({
  amount,
  currency = 'USD',
  onSuccess,
  onError,
  disabled = false
}: PayPalSmartButtonsProps) {
  const paypalRef = useRef<HTMLDivElement>(null);
  const { user } = useFirebase();

  useEffect(() => {
    if (!user || disabled) return;

    // Load PayPal SDK if not already loaded
    if (!window.paypal) {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'AZXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'}&currency=${currency}&components=buttons`;
      script.async = true;
      document.head.appendChild(script);

      script.onload = () => initializePayPal();
    } else {
      initializePayPal();
    }

    function initializePayPal() {
      if (!window.paypal || !paypalRef.current) return;

      window.paypal.Buttons({
        createOrder: async (data: any, actions: any) => {
          try {
            const token = await user.getIdToken();

            const response = await fetch('/api/paypal/create-order', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                amount,
                currency,
              }),
            });

            if (!response.ok) {
              throw new Error('Failed to create order');
            }

            const orderData = await response.json();
            return orderData.id;
          } catch (error) {
            console.error('Error creating order:', error);
            throw error;
          }
        },

        onApprove: async (data: any, actions: any) => {
          try {
            const token = await user.getIdToken();

            const response = await fetch('/api/paypal/capture-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                orderId: data.orderID,
                paypalToken: data.orderID, // For backward compatibility
              }),
            });

            if (!response.ok) {
              throw new Error('Payment capture failed');
            }

            const orderData = await response.json();
            onSuccess(orderData);
          } catch (error) {
            console.error('Error capturing payment:', error);
            onError(error);
          }
        },

        onError: (error: any) => {
          console.error('PayPal error:', error);
          onError(error);
        },

        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'paypal'
        }
      }).render(paypalRef.current);
    }
  }, [user, amount, currency, onSuccess, onError, disabled]);

  return (
    <div className="paypal-buttons-container">
      <div ref={paypalRef} />
      {!user && (
        <p className="text-sm text-gray-400 mt-2">Please sign in to complete payment</p>
      )}
      {disabled && (
        <p className="text-sm text-gray-400 mt-2">Payment processing...</p>
      )}
    </div>
  );
}
