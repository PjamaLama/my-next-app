"use client";

import React, { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { Trash2, Download, Eye, Shield, BarChart3, Settings } from 'lucide-react';
import {
  getConsentStatus,
  updateConsent,
  resetConsent,
  hasAnalyticsConsent,
  isCCPAOptOut,
  setCCPAOptOut
} from '@/lib/analytics/consentManager';

export default function PrivacyControls() {
  const { user } = useFirebase();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Analytics consent state
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [ccpaOptOut, setCCPAOptOutState] = useState(false);
  const [consentStatus, setConsentStatus] = useState<any>(null);

  useEffect(() => {
    // Load current consent status
    const status = getConsentStatus();
    setAnalyticsConsent(hasAnalyticsConsent());
    setCCPAOptOutState(isCCPAOptOut());
    setConsentStatus(status);
  }, []);

  const handleAnalyticsConsentChange = (enabled: boolean) => {
    setAnalyticsConsent(enabled);
    updateConsent({ analytics: enabled });

    setMessage({
      type: 'success',
      text: `Analytics ${enabled ? 'enabled' : 'disabled'}. Changes will take effect on next page load.`
    });

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCCPAOptOutChange = (optOut: boolean) => {
    setCCPAOptOutState(optOut);
    setCCPAOptOut(optOut);

    setMessage({
      type: 'success',
      text: `Analytics ${optOut ? 'opted out' : 'opted in'} under CCPA.`
    });

    setTimeout(() => setMessage(null), 3000);
  };

  if (!user) return null;

  const handleDataExport = async () => {
    setIsLoading(true);
    setMessage(null);
    
    try {
      // This would call an API endpoint to export user data
      const response = await fetch('/api/user/export-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-data-${user.uid}-${new Date().toISOString().split('T')[0]}.json`;

        try {
          // Safely append and remove the element
          document.body.appendChild(a);
          a.click();

          // Clean up with error handling
          if (a.parentNode === document.body) {
            document.body.removeChild(a);
          }
        } catch (error) {
          console.warn('Failed to download file:', error);
          // Fallback: try opening in new tab
          window.open(url, '_blank');
        } finally {
          // Always revoke the URL
          window.URL.revokeObjectURL(url);
        }

        setMessage({ type: 'success', text: 'Data exported successfully!' });
      } else {
        throw new Error('Failed to export data');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to export data. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDataDeletion = async () => {
    if (!confirm('Are you sure you want to delete all your data? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/user/delete-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Your data has been deleted successfully. You will be logged out.' });
        // Log out the user after successful deletion
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        throw new Error('Failed to delete data');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete data. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <Shield className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Privacy Controls</h2>
        <p className="text-gray-600">
          Manage your data and privacy settings
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <Download className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900">Export Your Data</h3>
            <p className="text-sm text-gray-600 mt-1">
              Download a copy of all your data including profile information, chat history, and preferences.
            </p>
            <button
              onClick={handleDataExport}
              disabled={isLoading}
              className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Exporting...' : 'Export Data'}
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <Eye className="w-6 h-6 text-yellow-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Data We Store</h3>
              <p className="text-sm text-gray-600 mt-1">
                We only store minimal data: your email, display name, profile picture, and preferences. 
                We do NOT store your actual spreadsheet content or data.
              </p>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                <li>• User profile information (email, name, photo)</li>
                <li>• Spreadsheet IDs and sheet names (not content)</li>
                <li>• Chat history and preferences</li>
                <li>• Beta tester status</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <BarChart3 className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Analytics & Tracking</h3>
              <p className="text-sm text-gray-600 mt-1">
                Control how we use analytics to improve our service. We use Google Analytics and Microsoft Clarity for usage insights.
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Analytics Tracking</label>
                    <p className="text-xs text-gray-500">Help us improve by sharing anonymous usage data</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={analyticsConsent}
                      onChange={(e) => handleAnalyticsConsentChange(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {consentStatus?.inCCPARegion && (
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-900">CCPA Opt-out</label>
                      <p className="text-xs text-gray-500">Do not sell or share my personal information</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={ccpaOptOut}
                        onChange={(e) => handleCCPAOptOutChange(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Delete Your Data</h3>
              <p className="text-sm text-gray-600 mt-1">
                Permanently delete all your data from our system. This action cannot be undone.
              </p>
              <button
                onClick={handleDataDeletion}
                disabled={isLoading}
                className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Deleting...' : 'Delete All Data'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-sm text-gray-500">
        <p>
          For additional privacy concerns, contact us at{' '}
          <a href="mailto:privacy@sheetyai.com" className="text-blue-600 hover:underline">
            privacy@sheetyai.com
          </a>
        </p>
      </div>
    </div>
  );
}
