"use client";

import React, { useState, useEffect } from 'react';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import { useSearchParams } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';

const WhatsAppLinkForm = () => {
  const { user } = useFirebase();
  const { waId: initialWaId, setWaId: setContextWaId } = useServiceAccount();
  const [waId, setWaId] = useState(initialWaId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchParams = useSearchParams();

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
    return /^\d{10,15}$/.test(id);
  };

  const handleSave = async () => {
    if (!user) {
      setError('You must be logged in to save your WhatsApp number.');
      return;
    }
    if (!validateWaId(waId)) {
      setError('Invalid format. Please use 10-15 digits without country code.');
      return;
    }
    setError('');
    setIsSaving(true);
    setSuccess('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/user/update-wa-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wa_id: waId }),
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
          Format: 1234567890 (no + or country code).
        </p>
        <div className="relative">
          <input
            type="text"
            value={waId}
            onChange={(e) => setWaId(e.target.value)}
            placeholder="e.g., 27659315189"
            className="bg-white/5 rounded-lg border border-white/10 p-2 w-full text-white/90"
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
