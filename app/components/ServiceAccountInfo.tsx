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
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="glass rounded-xl border border-white/10 p-4 mb-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-white">Service Account Email</h3>
        <div className="relative">
          <div className="bg-white/5 rounded-lg border border-white/10 p-2 pr-12 flex items-center justify-between break-all">
            <code className="text-xs sm:text-sm font-mono text-white/90 select-all">
              {serviceAccountEmail}
            </code>
          </div>
          <button
            onClick={copyToClipboard}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/90 hover:bg-white/20 hover:scale-105 transition"
            aria-label="Copy service account email"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l4 4 10-10" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="8" y="8" width="11" height="11" rx="2.5"/>
                <path d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-white/70">
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Share your Google Sheet with this email address to grant access
        </p>
      </div>
    </div>
  );
};

export default ServiceAccountInfo; 