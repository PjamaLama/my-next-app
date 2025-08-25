"use client";

import React, { useState, useEffect } from 'react';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import { useSearchParams } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

const WhatsAppLinkForm = () => {
  const { user } = useFirebase();
  const { waId: initialWaId, setWaId: setContextWaId } = useServiceAccount();
  const [waId, setWaId] = useState(initialWaId || '');
  const [countryCode, setCountryCode] = useState('+1'); // Default to +1
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchParams = useSearchParams();

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
    const waIdFromQuery = searchParams?.get('wa_id');
    if (waIdFromQuery) {
      setWaId(waIdFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    setWaId(initialWaId || '');
  }, [initialWaId]);

  const validateWaId = (id: string) => {
    return /^\d+$/.test(id); // Only digits for the local number part
  };

  const handleSave = async () => {
    if (!user) {
      setError('You must be logged in to save your WhatsApp number.');
      return;
    }
    if (!waId.trim()) {
      setError('WhatsApp number cannot be empty.');
      return;
    }
    if (!validateWaId(waId)) {
      setError('Invalid format. Please use only digits for the WhatsApp number.');
      return;
    }
    setError('');
    setIsSaving(true);
    setSuccess('');

    try {
      const token = await user.getIdToken();
      const fullWaId = `${countryCode}${waId}`;
      const response = await fetch('/api/user/update-wa-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wa_id: fullWaId }),
      });

      if (response.ok) {
        setContextWaId(waId);
        setSuccess('WhatsApp number saved successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save WhatsApp number.');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  return (
    <div className="glass rounded-xl border border-white/10 p-4 mb-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-white">Link WhatsApp</h3>
        <p className="text-xs text-white/70">
          Enter your WhatsApp number to link it with SheetyAI for messaging.
          Format: Country Code + Number (e.g., +1 5551234567).
        </p>
        <div className="flex gap-2">
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="bg-white/5 rounded-lg border border-white/10 p-2 text-white/90 focus:ring-blue-500 focus:border-blue-500"
          >
            {countryCodes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="tel"
            value={waId}
            onChange={(e) => setWaId(e.target.value)}
            placeholder="e.g., 659315189"
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/90 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-400">{success}</p>}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/20 rounded-lg p-2"
        >
          {isSaving ? 'Saving...' : 'Save WhatsApp Number'}
        </button>
      </div>
    </div>
  );
};

export default WhatsAppLinkForm;
