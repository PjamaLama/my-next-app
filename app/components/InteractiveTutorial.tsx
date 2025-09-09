"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTutorial } from '../providers/TutorialProvider';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void; // Action to perform when step is completed
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'excel-conversion',
    title: 'Convert Excel Files to Google Sheets',
    description: 'Upload your Excel file to Google Drive, right-click → Open with → Google Sheets. Copy the new Google Sheets URL.',
    targetSelector: '[data-tutorial="spreadsheet-input"]',
    position: 'bottom'
  },
  {
    id: 'spreadsheet-input',
    title: 'Connect Your Google Sheet',
    description: 'Paste your Google Sheets URL here to connect your data. We support Excel files converted to Google Sheets format.',
    targetSelector: '[data-tutorial="spreadsheet-input"]',
    position: 'bottom'
  },
  {
    id: 'sheet-selection',
    title: 'Select Sheets to Work With',
    description: 'Choose which sheets from your spreadsheet you want to edit or analyze. Only structured sheets (with headers) are fully supported.',
    targetSelector: '[data-tutorial="sheet-selector"]',
    position: 'top'
  },
  {
    id: 'chat-input',
    title: 'Chat with Your Data',
    description: 'Type natural language commands to analyze, edit, or generate insights from your spreadsheet data.',
    targetSelector: '[data-tutorial="chat-input"]',
    position: 'top'
  },
  {
    id: 'file-upload',
    title: 'Upload Additional Files',
    description: 'Upload more Excel files, CSVs, or images to process them alongside your connected spreadsheet.',
    targetSelector: '[data-tutorial="file-upload"]',
    position: 'top'
  }
];

interface InteractiveTutorialProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function InteractiveTutorial({ isVisible, onClose }: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setHighlightedElement(null);
      return;
    }

    // Find and highlight the target element for current step
    const step = TUTORIAL_STEPS[currentStep];
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector);
      setHighlightedElement(element);
    }

    // Add tutorial data attributes to key elements
    const addTutorialAttributes = () => {
      // Find spreadsheet input (likely in a form or input field)
      const inputs = document.querySelectorAll('input[type="text"], input[type="url"]');
      inputs.forEach(input => {
        const htmlInput = input as HTMLInputElement;
        if (htmlInput.placeholder?.toLowerCase().includes('spreadsheet') ||
            htmlInput.placeholder?.toLowerCase().includes('google') ||
            htmlInput.placeholder?.toLowerCase().includes('sheet')) {
          input.setAttribute('data-tutorial', 'spreadsheet-input');
        }
      });

      // Find sheet selector
      const sheetSelectors = document.querySelectorAll('[class*="sheet"], [class*="Sheet"]');
      sheetSelectors.forEach(el => {
        if (el.textContent?.includes('Available Sheets') || el.textContent?.includes('sheet')) {
          el.setAttribute('data-tutorial', 'sheet-selector');
        }
      });

      // Find chat input
      const chatInputs = document.querySelectorAll('textarea, input[type="text"]');
      chatInputs.forEach(input => {
        const htmlInput = input as HTMLInputElement | HTMLTextAreaElement;
        if (htmlInput.placeholder?.toLowerCase().includes('message') ||
            htmlInput.placeholder?.toLowerCase().includes('ask') ||
            htmlInput.placeholder?.toLowerCase().includes('chat')) {
          input.setAttribute('data-tutorial', 'chat-input');
        }
      });

      // Find file upload
      const fileUploads = document.querySelectorAll('input[type="file"], button');
      fileUploads.forEach(el => {
        if (el.textContent?.includes('upload') ||
            el.textContent?.includes('file') ||
            el.getAttribute('type') === 'file') {
          el.setAttribute('data-tutorial', 'file-upload');
        }
      });
    };

    addTutorialAttributes();
  }, [isVisible, currentStep]);

  const nextStep = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = TUTORIAL_STEPS[currentStep];

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px] pointer-events-none"
        style={{
          maskImage: highlightedElement ? `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3cdefs%3e%3cmask id='mask'%3e%3crect width='100%25' height='100%25' fill='white'/%3e%3crect x='${highlightedElement.getBoundingClientRect().left}' y='${highlightedElement.getBoundingClientRect().top}' width='${highlightedElement.getBoundingClientRect().width}' height='${highlightedElement.getBoundingClientRect().height}' fill='black' rx='8'/%3e%3c/mask%3e%3c/defs%3e%3crect width='100%25' height='100%25' mask='url(%23mask)'/%3e%3c/svg%3e")` : undefined,
          WebkitMaskImage: highlightedElement ? `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3cdefs%3e%3cmask id='mask'%3e%3crect width='100%25' height='100%25' fill='white'/%3e%3crect x='${highlightedElement.getBoundingClientRect().left}' y='${highlightedElement.getBoundingClientRect().top}' width='${highlightedElement.getBoundingClientRect().width}' height='${highlightedElement.getBoundingClientRect().height}' fill='black' rx='8'/%3e%3c/mask%3e%3c/defs%3e%3crect width='100%25' height='100%25' mask='url(%23mask)'/%3e%3c/svg%3e")` : undefined
        }}
      />

      {/* Highlight ring around target element */}
      {highlightedElement && (
        <div
          className="fixed z-[95] pointer-events-none"
          style={{
            left: highlightedElement.getBoundingClientRect().left - 4,
            top: highlightedElement.getBoundingClientRect().top - 4,
            width: highlightedElement.getBoundingClientRect().width + 8,
            height: highlightedElement.getBoundingClientRect().height + 8,
            border: '2px solid #10b981',
            borderRadius: '12px',
            boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.2)',
            animation: 'pulse 2s infinite'
          }}
        />
      )}

      {/* Tutorial tooltip */}
      <div className={`fixed z-[100] max-w-sm ${getTooltipPosition(step.position, highlightedElement)}`}>
        <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {currentStep + 1}
              </div>
              <h3 className="text-white font-semibold text-sm">{step.title}</h3>
            </div>
        <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
        >
              <X className="w-4 h-4" />
        </button>
          </div>

          {/* Content */}
          <p className="text-gray-300 text-sm mb-4 leading-relaxed">
            {step.description}
          </p>

        {/* Progress indicator */}
          <div className="flex items-center gap-1 mb-4">
            {TUTORIAL_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-emerald-500' : 'bg-gray-700'
                }`}
              />
            ))}
        </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
          <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            Previous
          </button>

            <span className="text-xs text-gray-500">
              {currentStep + 1} of {TUTORIAL_STEPS.length}
            </span>

          <button
              onClick={nextStep}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
              {currentStep === TUTORIAL_STEPS.length - 1 ? (
              <>
                  <Check className="w-3 h-3" />
                  Finish
              </>
            ) : (
              <>
                Next
                  <ChevronRight className="w-3 h-3" />
              </>
            )}
          </button>
          </div>
        </div>

        {/* Arrow pointer */}
        {highlightedElement && (
          <div
            className={`absolute w-0 h-0 ${getArrowStyles(step.position)}`}
            style={getArrowPosition(step.position, highlightedElement)}
          />
        )}
      </div>
    </>
  );
}

// Helper functions for positioning
function getTooltipPosition(position: string = 'top', element?: Element | null) {
  if (!element) return 'top-4 left-4';

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  switch (position) {
    case 'top':
      return `left-[${centerX}px] top-[${rect.top - 120}px] -translate-x-1/2`;
    case 'bottom':
      return `left-[${centerX}px] top-[${rect.bottom + 16}px] -translate-x-1/2`;
    case 'left':
      return `left-[${rect.left - 320}px] top-[${centerY}px] -translate-y-1/2`;
    case 'right':
      return `left-[${rect.right + 16}px] top-[${centerY}px] -translate-y-1/2`;
    default:
      return 'top-4 left-4';
  }
}

function getArrowStyles(position: string = 'top') {
  const baseStyles = 'border-solid border-gray-900 border-white/20';

  switch (position) {
    case 'top':
      return `${baseStyles} border-t-0 border-r-[6px] border-b-[6px] border-l-[6px] border-r-transparent border-l-transparent`;
    case 'bottom':
      return `${baseStyles} border-t-[6px] border-r-[6px] border-b-0 border-l-[6px] border-r-transparent border-l-transparent`;
    case 'left':
      return `${baseStyles} border-t-[6px] border-r-[6px] border-b-[6px] border-l-0 border-t-transparent border-b-transparent`;
    case 'right':
      return `${baseStyles} border-t-[6px] border-r-0 border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent`;
    default:
      return baseStyles;
  }
}

function getArrowPosition(position: string = 'top', element?: Element | null) {
  if (!element) return {};

  switch (position) {
    case 'top':
      return { bottom: '-6px', left: '50%', transform: 'translateX(-50%)' };
    case 'bottom':
      return { top: '-6px', left: '50%', transform: 'translateX(-50%)' };
    case 'left':
      return { right: '-6px', top: '50%', transform: 'translateY(-50%)' };
    case 'right':
      return { left: '-6px', top: '50%', transform: 'translateY(-50%)' };
    default:
      return {};
  }
}