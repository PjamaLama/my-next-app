"use client";

import React from 'react';
import PhoneInput from 'react-phone-number-input';
import './PhoneInput.css';

interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: boolean;
  success?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = "Enter phone number",
  className = "",
  error = false,
  success = false,
  size = 'md',
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'text-sm';
      case 'lg':
        return 'text-base';
      default:
        return 'text-sm';
    }
  };

  const getStateClasses = () => {
    if (error) return 'PhoneInput--error';
    if (success) return 'PhoneInput--success';
    return '';
  };

  const handleChange = (newValue: string | undefined) => {
    // Ensure we always pass a string, never undefined
    const sanitizedValue = newValue || '';
    
    // Log for debugging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log('PhoneNumberInput onChange:', { 
        original: newValue, 
        sanitized: sanitizedValue,
        type: typeof newValue 
      });
    }
    
    // Always call onChange with a string value
    onChange(sanitizedValue);
  };

  return (
    <div className="relative">
      <PhoneInput
        international
        defaultCountry="US"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`${getSizeClasses()} ${getStateClasses()} ${className}`.trim()}
        countrySelectProps={{ unicodeFlags: true }}
        displayInitialValueAsLocalNumber={false}
      />
    </div>
  );
};

export default PhoneNumberInput;
