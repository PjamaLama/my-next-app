"use client";

import React, { useEffect, useState } from 'react';
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokPurchase } from '../../lib/tiktokPixel';

/**
 * TikTok Pixel Test Component
 * Use this to verify TikTok pixel events are firing correctly
 */
export default function TikTokPixelTest() {
  const [pixelStatus, setPixelStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [lastEvent, setLastEvent] = useState<string>('');

  useEffect(() => {
    // Check if TikTok pixel is loaded
    const checkPixelStatus = () => {
      if (typeof window !== 'undefined' && (window as any).ttq) {
        setPixelStatus('loaded');
        console.log('✅ TikTok pixel is loaded and ready');
      } else {
        setPixelStatus('error');
        console.log('❌ TikTok pixel not found');
      }
    };

    // Check immediately and after a delay
    checkPixelStatus();
    const timeout = setTimeout(checkPixelStatus, 3000);

    return () => clearTimeout(timeout);
  }, []);

  const testEvent = (eventName: string, eventFunction: () => void) => {
    try {
      eventFunction();
      setLastEvent(`${eventName} - ${new Date().toLocaleTimeString()}`);
      console.log(`📤 Fired TikTok event: ${eventName}`);
    } catch (error) {
      console.error(`❌ Failed to fire TikTok event: ${eventName}`, error);
      setLastEvent(`Error: ${eventName} - ${new Date().toLocaleTimeString()}`);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg p-4 shadow-lg z-50 max-w-sm">
      <h3 className="text-lg font-semibold mb-2">TikTok Pixel Test</h3>

      <div className="mb-3">
        <div className="text-sm text-gray-600 mb-1">Pixel Status:</div>
        <div className={`text-sm font-medium ${
          pixelStatus === 'loaded' ? 'text-green-600' :
          pixelStatus === 'error' ? 'text-red-600' : 'text-yellow-600'
        }`}>
          {pixelStatus === 'loaded' ? '✅ Pixel Loaded' :
           pixelStatus === 'error' ? '❌ Pixel Not Found' : '⏳ Loading...'}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm text-gray-600 mb-1">Last Event:</div>
        <div className="text-xs font-mono bg-gray-100 p-1 rounded">
          {lastEvent || 'No events fired yet'}
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => testEvent('ViewContent', () => trackTikTokViewContent('sheetyai_pro_monthly'))}
          className="w-full text-xs bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
        >
          Test ViewContent
        </button>

        <button
          onClick={() => testEvent('InitiateCheckout', () => trackTikTokInitiateCheckout('sheetyai_pro_monthly'))}
          className="w-full text-xs bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600"
        >
          Test InitiateCheckout
        </button>

        <button
          onClick={() => testEvent('Purchase', () => trackTikTokPurchase({
            value: 19.97,
            currency: 'USD',
            content_name: 'SheetyAI Pro Subscription',
            content_type: 'product',
            content_id: 'sheetyai_pro_monthly'
          }))}
          className="w-full text-xs bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600"
        >
          Test Purchase
        </button>

        <button
          onClick={() => testEvent('Manual ttq Call', () => {
            if (typeof window !== 'undefined' && window.ttq) {
              window.ttq.track('ViewContent', { content_name: 'Manual Test' });
            }
          })}
          className="w-full text-xs bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600"
        >
          Manual ttq Call
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Check browser console and Network tab for TikTok events
      </div>
    </div>
  );
}
