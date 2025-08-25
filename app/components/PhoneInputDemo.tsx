"use client";

import React, { useState } from 'react';
import PhoneNumberInput from './PhoneNumberInput';

const PhoneInputDemo = () => {
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [phone3, setPhone3] = useState('');
  const [phone4, setPhone4] = useState('');

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold text-white mb-6">Phone Input Component Demo</h2>
      
      {/* Default state */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Default Phone Input</label>
        <PhoneNumberInput
          value={phone1}
          onChange={setPhone1}
          placeholder="Enter phone number"
        />
      </div>

      {/* Error state */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Error State</label>
        <PhoneNumberInput
          value={phone2}
          onChange={setPhone2}
          placeholder="Enter phone number"
          error={true}
        />
        <p className="text-xs text-red-400">This field has an error</p>
      </div>

      {/* Success state */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Success State</label>
        <PhoneNumberInput
          value={phone3}
          onChange={setPhone3}
          placeholder="Enter phone number"
          success={true}
        />
        <p className="text-xs text-green-400">Phone number is valid</p>
      </div>

      {/* Different sizes */}
      <div className="space-y-4">
        <label className="text-sm font-medium text-white/80">Size Variants</label>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/60">Small</label>
            <PhoneNumberInput
              value=""
              onChange={() => {}}
              placeholder="Small size"
              size="sm"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">Medium (default)</label>
            <PhoneNumberInput
              value=""
              onChange={() => {}}
              placeholder="Medium size"
              size="md"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">Large</label>
            <PhoneNumberInput
              value=""
              onChange={() => {}}
              placeholder="Large size"
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Disabled state */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80">Disabled State</label>
        <PhoneNumberInput
          value="+1234567890"
          onChange={() => {}}
          placeholder="Enter phone number"
          disabled={true}
        />
      </div>
    </div>
  );
};

export default PhoneInputDemo;
