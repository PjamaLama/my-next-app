"use client";

import React from 'react';
import PhoneNumberInput from './PhoneNumberInput';

interface WhatsAppNumberInputProps {
  waId: string;
  setWaId: (waId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const WhatsAppNumberInput: React.FC<WhatsAppNumberInputProps> = ({
  waId,
  setWaId,
  disabled = false,
  placeholder = "Enter phone number",
}) => {
  return (
    <PhoneNumberInput
      value={waId}
      onChange={(value) => {
        setWaId(value || '');
      }}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
};

export default WhatsAppNumberInput;
