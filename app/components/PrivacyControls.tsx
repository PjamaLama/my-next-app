"use client";

import React, { useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { Trash2, Download, Eye, Shield } from 'lucide-react';

export default function PrivacyControls() {
  const { user } = useFirebase();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
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
