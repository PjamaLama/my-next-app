"use client";

import React, { useEffect, useState } from 'react';
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokPurchase } from '../../lib/tiktokPixel';
import { trackEvent, trackConversion, trackUserInteraction, trackFeatureUsage } from '../../lib/analytics/safeAnalytics';

declare global {
  interface Window {
    fbq?: (action: string, eventName: string, parameters?: any) => void;
    gtag?: (command: string, ...args: any[]) => void;
    clarity?: (command: string, ...args: any[]) => void;
    ttq?: {
      track: (eventName: string, parameters?: any) => void;
      page: () => void;
      identify: (userData?: any) => void;
    };
  }
}

/**
 * Comprehensive Tracking Status Panel
 * Shows status and allows testing of all tracking systems
 */
export default function TrackingStatusPanel() {
  const [trackingStatus, setTrackingStatus] = useState({
    tikTokPixel: false,
    googleAnalytics: false,
    metaPixel: false,
    microsoftClarity: false,
  });

  const [lastEvents, setLastEvents] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Check tracking systems status
  useEffect(() => {
    const checkStatus = () => {
      setTrackingStatus({
        tikTokPixel: !!(typeof window !== 'undefined' && window.ttq),
        googleAnalytics: !!(typeof window !== 'undefined' && window.gtag),
        metaPixel: !!(typeof window !== 'undefined' && window.fbq),
        microsoftClarity: !!(typeof window !== 'undefined' && window.clarity),
      });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Listen for page loads and track automatically
  useEffect(() => {
    const currentPath = window.location.pathname;
    addEventLog(`📄 Page loaded: ${currentPath}`);

    // Auto-track page view events
    setTimeout(() => {
      addEventLog('🎯 Auto-tracking page view events...');
      testAllPageViewEvents();
    }, 1000);
  }, []);

  const addEventLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLastEvents(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]); // Keep last 10 events
  };

  const testTikTokEvent = (eventName: string, eventFunction: () => void) => {
    try {
      eventFunction();
      addEventLog(`✅ TikTok: ${eventName}`);
    } catch (error) {
      addEventLog(`❌ TikTok Error: ${eventName}`);
    }
  };

  const testAllPageViewEvents = () => {
    // Test each tracking system
    if (trackingStatus.tikTokPixel) {
      trackTikTokViewContent('sheetyai_pro_monthly');
      addEventLog('📊 TikTok: ViewContent tracked');
    }

    if (trackingStatus.googleAnalytics) {
      trackEvent('page_view', { page_title: document.title, page_location: window.location.href });
      addEventLog('📊 Google Analytics: Page view tracked');
    }

    if (trackingStatus.metaPixel) {
      window.fbq?.('track', 'ViewContent', { content_name: 'Page View' });
      addEventLog('📊 Meta Pixel: ViewContent tracked');
    }

    if (trackingStatus.microsoftClarity) {
      window.clarity?.('event', 'page_view');
      addEventLog('📊 Microsoft Clarity: Page view tracked');
    }
  };

  const testConversionEvents = () => {
    addEventLog('🎯 Testing conversion events...');

    // Test account creation
    trackConversion('account_created');
    addEventLog('📊 Conversion: Account Created');

    // Test first message
    trackConversion('first_message_sent');
    addEventLog('📊 Conversion: First Message Sent');

    // Test user interaction
    trackUserInteraction('button', 'click', 'test_button');
    addEventLog('📊 User Interaction: Button Click');

    // Test feature usage
    trackFeatureUsage('tracking_panel', 'test');
    addEventLog('📊 Feature Usage: Tracking Panel Test');
  };

  const StatusIndicator = ({ active, label }: { active: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isExpanded ? (
        // Collapsed view
        <div
          className="bg-gray-900 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors shadow-lg"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className={`w-2 h-2 rounded-full ${trackingStatus.tikTokPixel ? 'bg-pink-500' : 'bg-gray-600'}`} />
              <div className={`w-2 h-2 rounded-full ${trackingStatus.googleAnalytics ? 'bg-blue-500' : 'bg-gray-600'}`} />
              <div className={`w-2 h-2 rounded-full ${trackingStatus.metaPixel ? 'bg-blue-600' : 'bg-gray-600'}`} />
              <div className={`w-2 h-2 rounded-full ${trackingStatus.microsoftClarity ? 'bg-red-500' : 'bg-gray-600'}`} />
            </div>
            <span className="text-sm font-medium">Tracking Status</span>
            <span className="text-xs opacity-75">▼</span>
          </div>
        </div>
      ) : (
        // Expanded view
        <div className="bg-gray-900 text-white rounded-lg shadow-xl max-w-sm max-h-96 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">Tracking Dashboard</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
            {/* Status Indicators */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300 mb-2">System Status:</h4>
              <StatusIndicator active={trackingStatus.tikTokPixel} label="TikTok Pixel" />
              <StatusIndicator active={trackingStatus.googleAnalytics} label="Google Analytics" />
              <StatusIndicator active={trackingStatus.metaPixel} label="Meta Pixel" />
              <StatusIndicator active={trackingStatus.microsoftClarity} label="Microsoft Clarity" />
            </div>

            {/* Event Log */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Recent Events:</h4>
              <div className="bg-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                {lastEvents.length === 0 ? (
                  <div className="text-xs text-gray-500">No events yet...</div>
                ) : (
                  lastEvents.map((event, index) => (
                    <div key={index} className="text-xs font-mono mb-1 break-all">
                      {event}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Test Buttons */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Test Events:</h4>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={testAllPageViewEvents}
                  className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded transition-colors"
                >
                  Page Views
                </button>

                <button
                  onClick={testConversionEvents}
                  className="text-xs bg-green-600 hover:bg-green-700 px-3 py-2 rounded transition-colors"
                >
                  Conversions
                </button>

                <button
                  onClick={() => testTikTokEvent('ViewContent', () => trackTikTokViewContent('sheetyai_pro_monthly'))}
                  className="text-xs bg-pink-600 hover:bg-pink-700 px-3 py-2 rounded transition-colors"
                >
                  TikTok Test
                </button>

                <button
                  onClick={() => addEventLog('🔄 Manual test logged')}
                  className="text-xs bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded transition-colors"
                >
                  Log Test
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 border-t border-gray-700">
            Development mode only • Auto-tracks page views
          </div>
        </div>
      )}
    </div>
  );
}
