"use client";

import React, { useState } from 'react';

interface ServiceAccountInfoProps {
  serviceAccountEmail: string;
}

const ServiceAccountInfo: React.FC<ServiceAccountInfoProps> = ({ serviceAccountEmail }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Service Account Email
          </h3>
          <button
            onClick={copyToClipboard}
            className="text-xs bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200 px-2 py-1 rounded flex items-center transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-between break-all">
          <code className="text-xs sm:text-sm font-mono text-gray-800 dark:text-gray-200">
            {serviceAccountEmail}
          </code>
        </div>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Share your Google Sheet with this email address to grant access
        </p>
      </div>
    </div>
  );
};

export default ServiceAccountInfo; 