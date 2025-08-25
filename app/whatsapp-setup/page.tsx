
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import SpreadsheetManagerModal from '../components/SpreadsheetManagerModal';
import ServiceAccountInfo from '../components/ServiceAccountInfo';
import PhoneNumberInput from '../components/PhoneNumberInput';

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
    if (searchParams) {
      const waIdFromParams = searchParams.get('wa_id');
      if (waIdFromParams) {
        setWaId(waIdFromParams);
      }
    }
  }, [searchParams]);

  const validateWaId = (id: string) => {
    // Handle empty or undefined values
    if (!id || typeof id !== 'string') {
      return false;
    }
    
    // Trim whitespace
    const trimmedId = id.trim();
    
    // Check if it's empty after trimming
    if (!trimmedId) {
      return false;
    }
    
    // E.164 format validation: +[country code][number] (1-15 digits total)
    // Examples: +1, +44, +1234567890, +44123456789
    return /^\+[1-9]\d{1,14}$/.test(trimmedId);
  };

  const handleLinkWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!waId.trim()) {
      setError('WhatsApp number cannot be empty.');
      return;
    }
    if (!validateWaId(waId)) {
      setError('Invalid format. Please enter a valid international phone number.');
      return;
    }

    if (!user) {
      // If user is not logged in, start the sign-up/login process.
      // We can't pass state through the redirect, so the user will have to re-enter the number after login.
      // We need to store the full number in session storage.
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
            The number will be automatically formatted with the correct country code.
          </p>

          {isLinked ? (
            <div className="text-center">
              <div className="text-green-400 text-2xl mb-4">✓</div>
              <h3 className="text-xl font-semibold text-white mb-2">WhatsApp Linked Successfully!</h3>
              <p className="text-gray-300 mb-6">
                Your WhatsApp number <span className="font-semibold">{waId}</span> is now linked to your account.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Manage Spreadsheets
                </button>
                <button
                  onClick={async () => {
                    if (!user) return;
                    try {
                      const token = await user.getIdToken();
                      const response = await fetch('/api/user/unlink-wa-id', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`,
                        },
                      });

                      if (response.ok) {
                        setIsLinked(false);
                        setWaId('');
                        // Refresh the page to update the UI
                        window.location.reload();
                      } else {
                        const data = await response.json();
                        setError(data.error || 'Failed to unlink WhatsApp number.');
                      }
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Unlink WhatsApp
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLinkWhatsApp}>
              <div className="mb-4">
                <label htmlFor="wa_id" className="block text-sm font-medium text-gray-300 mb-2">
                  WhatsApp Number
                </label>
                <PhoneNumberInput
                  value={waId}
                  onChange={(value) => setWaId(value || '')}
                  placeholder="Enter your WhatsApp number"
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
          <div className="text-center mt-6">
            <button
              onClick={() => router.push('/report')}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Chat
            </button>
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
