"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useSettings } from '../NavBar';

const GeminiKeyPrompt: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { setSettingsOpen } = useSettings();

  const openSettings = () => {
    setSettingsOpen(true);
  };

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="bg-yellow-500 rounded-full p-1 flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-1">
            Gemini API Key Required
          </h3>
          <p className="text-xs text-yellow-700 dark:text-yellow-200 mb-2">
            You need to add your Google Gemini API key to use this application.
          </p>
          
          {isExpanded ? (
            <div className="text-xs space-y-4 text-yellow-700 dark:text-yellow-200">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <h4 className="font-medium mb-2 text-gray-900 dark:text-gray-100">How to get your Gemini API key:</h4>
                <ol className="list-decimal pl-4 space-y-2">
                  <li>Go to <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">Google AI Studio</a></li>
                  <li>Sign in with your Google account</li>
                  <li>Click on "Get API key" or go to API keys section</li>
                  <li>Create a new API key or use an existing one</li>
                  <li>Copy the API key</li>
                </ol>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <h4 className="font-medium mb-2 text-gray-900 dark:text-gray-100">How to add your API key to Report AI:</h4>
                <ol className="list-decimal pl-4 space-y-2">
                  <li>Click the settings icon <span className="inline-block bg-gray-200 dark:bg-gray-700 rounded-full p-0.5"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span> in the navigation bar</li>
                  <li>Paste your API key in the input field</li>
                  <li>Click "Save API Key"</li>
                </ol>
              </div>
              
              <div className="pt-1 flex justify-end items-baseline">
                <button 
                  onClick={openSettings}
                  className="text-xs bg-yellow-200 dark:bg-yellow-800 hover:bg-yellow-300 dark:hover:bg-yellow-700 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-full transition-colors font-medium"
                >
                  Open Settings
                </button>
                <span 
                  onClick={() => setIsExpanded(false)}
                  className="text-xs text-yellow-800 dark:text-yellow-300 hover:underline"
                  role="button"
                  tabIndex={0}
                >
                  Show less
                </span>
              </div>
            </div>
          ) : (
            <div className="flex space-x-3 justify-end items-baseline">
              <button 
                onClick={openSettings}
                className="text-xs bg-yellow-200 dark:bg-yellow-800 hover:bg-yellow-300 dark:hover:bg-yellow-700 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-full transition-colors font-medium"
              >
                Open Settings
              </button>
              <span 
                onClick={() => setIsExpanded(true)}
                className="text-xs text-yellow-800 dark:text-yellow-300 hover:underline"
                role="button"
                tabIndex={0}
              >
                How to get an API key?
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeminiKeyPrompt; 