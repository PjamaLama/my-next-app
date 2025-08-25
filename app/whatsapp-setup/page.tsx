
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import SpreadsheetManagerModal from '../components/SpreadsheetManagerModal';
import ServiceAccountInfo from '../components/ServiceAccountInfo';

function WhatsAppSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, joinBeta } = useFirebase();
  const { serviceAccountEmail } = useServiceAccount();

  const [waId, setWaId] = useState('');
  const [isLinked, setIsLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const waIdFromParams = searchParams.get('wa_id');
    if (waIdFromParams) {
      setWaId(waIdFromParams);
    }
  }, [searchParams]);

  const handleLinkWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{10,15}$/.test(waId)) {
      setError('Please enter a valid WhatsApp number (10-15 digits).');
      return;
    }

    if (!user) {
      // If user is not logged in, start the sign-up/login process.
      // We can't pass state through the redirect, so the user will have to re-enter the number after login.
      // A better UX would involve storing the wa_id in session storage and retrieving it post-login.
      sessionStorage.setItem('pending_wa_id', waId);
      joinBeta(); // This will trigger the Google Sign-in flow
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/user/update-wa-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ wa_id: waId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link WhatsApp number.');
      }

      setIsLinked(true);
      // Automatically open the spreadsheet manager after successful linking
      setTimeout(() => setIsModalOpen(true), 1000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // On page load after redirect from login, check for pending wa_id
  useEffect(() => {
      if(user && sessionStorage.getItem('pending_wa_id')) {
          const pendingId = sessionStorage.getItem('pending_wa_id');
          if(pendingId) {
            setWaId(pendingId);
            sessionStorage.removeItem('pending_wa_id');
          }
      }
  }, [user])

  if (loading) {
    return <div className="text-center p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        <div className="glass p-8 rounded-xl shadow-lg">
          <h1 className="text-2xl font-bold text-center mb-2">Link Your WhatsApp</h1>
          <p className="text-center text-gray-300 mb-6">
            Connect your WhatsApp to start interacting with your Google Sheets.
          </p>

          {isLinked ? (
            <div className="text-center bg-green-900/50 border border-green-500 p-4 rounded-lg">
              <p className="font-semibold">✅ Your WhatsApp is linked!</p>
              <p className="text-sm text-gray-200 mt-2">
                You can now message us to interact with your sheets.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Manage Spreadsheets
              </button>
            </div>
          ) : (
            <form onSubmit={handleLinkWhatsApp}>
              <div className="mb-4">
                <label htmlFor="wa_id" className="block text-sm font-medium text-gray-300 mb-2">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  id="wa_id"
                  value={waId}
                  onChange={(e) => setWaId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 15551234567"
                  required
                  disabled={isSubmitting}
                />
              </div>

              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting || !waId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                {isSubmitting ? 'Linking...' : 'Link WhatsApp & Add Spreadsheets'}
              </button>
            </form>
          )}

          <div className="mt-8">
            <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
             <p className="text-xs text-gray-400 text-center mt-4">
                You need to share your Google Sheet with this service account to give us access. Set permissions to &quot;Editor&quot;.
            </p>
          </div>
        </div>
      </div>
      <SpreadsheetManagerModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

// Wrap the component in Suspense because useSearchParams must be used in a suspense boundary.
export default function WhatsAppSetupPage() {
    return (
        <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
            <WhatsAppSetupContent />
        </Suspense>
    );
}
