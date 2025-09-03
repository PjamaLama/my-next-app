"use client";

import { useEffect } from 'react';

// Extend window interface for PayPal
declare global {
  interface Window {
    paypal?: any;
  }
}

export default function PayPalScriptLoader() {
  useEffect(() => {
    // Only load PayPal script on client side
    if (typeof window === 'undefined') return;

    // Check if script is already loaded
    if (window.paypal) return;

    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID';

    // Create and append script
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    script.async = true;

    // Handle script load
    script.onload = () => {
      console.log('PayPal SDK loaded successfully');
    };

    script.onerror = () => {
      console.error('Failed to load PayPal SDK');
    };

    document.head.appendChild(script);

    // Cleanup function
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return null; // This component doesn't render anything
}
