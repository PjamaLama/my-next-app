"use client";

import React, { useState, useEffect } from 'react';
import { trackEvent, trackPurchase, PRODUCT_CATALOG } from '../../lib/metaPixel';

export default function MetaPixelTest() {
  const [pixelStatus, setPixelStatus] = useState<'unknown' | 'loaded' | 'not-loaded'>('unknown');
  const [lastEvent, setLastEvent] = useState<string>('');

  useEffect(() => {
    // Check if Meta Pixel is loaded
    const checkPixelStatus = () => {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        setPixelStatus('loaded');
      } else {
        setPixelStatus('not-loaded');
      }
    };

    // Check immediately and after a short delay
    checkPixelStatus();
    const timer = setTimeout(checkPixelStatus, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleTestEvent = (eventName: string, params?: any) => {
    trackEvent(eventName, params);
    setLastEvent(`${eventName} - ${new Date().toLocaleTimeString()}`);
  };

  const handleTestPurchase = () => {
    trackPurchase({
      value: 19.97,
      currency: 'USD'
    });
    setLastEvent(`Purchase - ${new Date().toLocaleTimeString()}`);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 max-w-md">
      <h3 className="text-lg font-semibold text-white mb-3">Meta Pixel Test Panel</h3>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">Pixel Status:</span>
          <span className={`text-sm font-medium ${
            pixelStatus === 'loaded' ? 'text-green-400' :
            pixelStatus === 'not-loaded' ? 'text-red-400' :
            'text-yellow-400'
          }`}>
            {pixelStatus === 'loaded' ? '✅ Loaded' :
             pixelStatus === 'not-loaded' ? '❌ Not Loaded' :
             '⏳ Checking...'}
          </span>
        </div>

        <div className="text-sm text-gray-300">
          <div>Pixel ID: {PRODUCT_CATALOG.id}</div>
          <div>Last Event: {lastEvent || 'None'}</div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleTestEvent('ViewContent', { content_name: 'Test Page' })}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            Test ViewContent
          </button>

          <button
            onClick={() => handleTestEvent('AddToCart', { content_ids: ['test_product'] })}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            Test AddToCart
          </button>

          <button
            onClick={handleTestPurchase}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 px-3 rounded transition-colors"
          >
            Test Purchase
          </button>
        </div>

        <div className="text-xs text-gray-400 mt-3">
          💡 Use Meta Pixel Helper extension to verify events are firing correctly.
        </div>
      </div>
    </div>
  );
}
