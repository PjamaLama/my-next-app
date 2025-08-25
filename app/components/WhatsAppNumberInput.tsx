"use client";

import React from 'react';

interface WhatsAppNumberInputProps {
  waId: string;
  setWaId: (waId: string) => void;
  countryCode: string;
  setCountryCode: (countryCode: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

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

const WhatsAppNumberInput: React.FC<WhatsAppNumberInputProps> = ({
  waId,
  setWaId,
  countryCode,
  setCountryCode,
  disabled = false,
  placeholder = "e.g., 659315189",
}) => {
  return (
    <div className="flex gap-2">
      <select
        value={countryCode}
        onChange={(e) => setCountryCode(e.target.value)}
        className="bg-white/5 rounded-lg border border-white/10 p-2 text-white/90 focus:ring-blue-500 focus:border-blue-500"
        disabled={disabled}
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
        placeholder={placeholder}
        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/90 focus:ring-blue-500 focus:border-blue-500"
        disabled={disabled}
      />
    </div>
  );
};

export default WhatsAppNumberInput;
