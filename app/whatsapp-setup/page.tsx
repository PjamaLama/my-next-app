
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
  const [countryCode, setCountryCode] = useState('+1'); // Default to +1
  const [isLinked, setIsLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const countryCodes = [
    { code: '+1', name: 'USA/Canada (+1)' },
    { code: '+44', name: 'UK (+44)' },
    { code: '+27', name: 'South Africa (+27)' },
    { code: '+91', name: 'India (+91)' },
    { code: '+61', name: 'Australia (+61)' },
    { code: '+55', name: 'Brazil (+55)' },
    { code: '+49', name: 'Germany (+49)' },
    { code: '+33', name: 'France (+33)' },
    { code: '+81', name: 'Japan (+81)' },
    { code: '+86', name: 'China (+86)' },
  ];

  useEffect(() => {
    if (searchParams) {
      const waIdFromParams = searchParams.get('wa_id');
      if (waIdFromParams) {
        setWaId(waIdFromParams);
      }
    }
  }, [searchParams]);

  const handleLinkWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!waId.trim()) {
      setError('WhatsApp number cannot be empty.');
      return;
    }
    if (!validateWaId(waId)) {
      setError('Invalid format. Please use only digits for the WhatsApp number.');
      return;
    }

    if (!user) {
      // If user is not logged in, start the sign-up/login process.
      // We can't pass state through the redirect, so the user will have to re-enter the number after login.
      // We need to store the full number (country code + waId) in session storage.
      sessionStorage.setItem('pending_wa_id', `${countryCode}${waId}`);
      joinBeta(); // This will trigger the Google Sign-in flow
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const fullWaId = `${countryCode}${waId}`;
      const response = await fetch('/api/user/update-wa-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ wa_id: fullWaId }),
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
            if (pendingId.startsWith('+')) {
              // Attempt to find a matching country code
              let matchedCode = '';
              let remainingWaId = pendingId;
              for (const c of countryCodes) {
                if (pendingId.startsWith(c.code)) {
                  matchedCode = c.code;
                  remainingWaId = pendingId.substring(c.code.length);
                  break;
                }
              }
              setCountryCode(matchedCode || '+1'); // Fallback to +1 if no match
              setWaId(remainingWaId);
            } else {
              // If no country code, assume it's just the number and use default country code
              setCountryCode('+1'); // Or your desired default
              setWaId(pendingId);
            }
            sessionStorage.removeItem('pending_wa_id');
          }
      }
  }, [user, countryCodes])

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
            Format: Country Code + Number (e.g., +1 5551234567).
          </p>

          {isLinked ? (
            <div className="text-center bg-green-900/50 border border-green-500 p-4 rounded-lg">
              <p className="font-semibold">✅ Your WhatsApp is linked!</p>
              <p className="text-sm text-gray-200 mt-2">
                You can now message us to interact with your sheets.
              </p>
              <button
                onClick={() => {
                  setIsModalOpen(true);
                  router.push('/report'); // Navigate to chat page
                }}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Manage Spreadsheets & Go to Chat
              </button>
            </div>
          ) : (
            <form onSubmit={handleLinkWhatsApp}>
              <div className="mb-4">
                <label htmlFor="wa_id" className="block text-sm font-medium text-gray-300 mb-2">
                  WhatsApp Number
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-white"
                  >
                    {countryCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    id="wa_id"
                    value={waId}
                    onChange={(e) => setWaId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 659315189"
                    required
                    disabled={isSubmitting}
                  />
                </div>
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
