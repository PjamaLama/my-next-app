"use client";

import React, { useState } from 'react';

interface SimpleButtonProps {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export default function SimpleButton({
  label,
  onClick,
  variant = 'primary',
  disabled = false
}: SimpleButtonProps) {
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = () => {
    if (!disabled) {
      setIsClicked(true);
      onClick?.();
      // Reset after a short delay for visual feedback
      setTimeout(() => setIsClicked(false), 150);
    }
  };

  const baseClasses = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  const variantClasses = variant === 'primary'
    ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
    : "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";
  const clickedClasses = isClicked ? "scale-95" : "";

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabledClasses} ${clickedClasses}`}
      data-testid="simple-button"
    >
      {label}
    </button>
  );
}
