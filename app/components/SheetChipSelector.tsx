"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSheet } from '../providers/SheetProvider';
import { useDialog } from '../providers/DialogProvider';

const SheetChipSelector: React.FC = () => {
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames, sheetStructureCache, unstructuredOverrides, setUnstructuredOverride } = useSheet();
  const { notify } = useDialog();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSheetNamesRef = useRef(selectedSheetNames);
  const setSelectedSheetNamesRef = useRef(setSelectedSheetNames);

  // Update refs when values change
  useEffect(() => {
    selectedSheetNamesRef.current = selectedSheetNames;
  }, [selectedSheetNames]);

  useEffect(() => {
    setSelectedSheetNamesRef.current = setSelectedSheetNames;
  }, [setSelectedSheetNames]);

  useEffect(() => {
    if (defaultSpreadsheetId) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/get-sheet-names?spreadsheetId=${defaultSpreadsheetId}`)
        .then(res => {
          if (!res.ok) {
            throw new Error('Failed to fetch sheet names');
          }
          return res.json();
        })
        .then(data => {
          setSheetNames(data.sheetNames);
          // Only set default selection if no sheets are currently selected
          if (data.sheetNames.length > 0 && selectedSheetNamesRef.current.length === 0) {
            setSelectedSheetNamesRef.current([data.sheetNames[0]]);
          }
        })
        .catch(err => {
          setError(err.message);
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [defaultSpreadsheetId]); // Only depend on defaultSpreadsheetId

  const toggleSheetSelection = (sheetName: string) => {
    console.log('=== Toggle Sheet Selection ===');
    console.log('Sheet name:', sheetName);
    console.log('Current selectedSheetNames:', selectedSheetNames);
    console.log('Is currently selected:', selectedSheetNames.includes(sheetName));
    
    const newSelected = selectedSheetNames.includes(sheetName)
      ? selectedSheetNames.filter(name => name !== sheetName)
      : [...selectedSheetNames, sheetName];
    
    console.log('New selectedSheetNames:', newSelected);
    setSelectedSheetNames(newSelected);
  };

  if (!defaultSpreadsheetId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading sheets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-red-600 dark:text-red-400">Error: {error}</span>
        </div>
      </div>
    );
  }

  console.log('=== Render Debug ===');
  console.log('sheetNames:', sheetNames);
  console.log('selectedSheetNames:', selectedSheetNames);
  console.log('isLoading:', isLoading);
  console.log('error:', error);

  return (
    <div className="space-y-3">
      {/* Header with selection count */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Sheets to Edit
        </h3>
        {selectedSheetNames.length > 0 && (
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border bg-white dark:bg-gray-800 hover:bg-gray-50"
            onClick={async () => {
              // Offer convert action for the first selected unstructured sheet
              const first = selectedSheetNames.find(n => (unstructuredOverrides[n] ?? (sheetStructureCache[n] ? !sheetStructureCache[n].isStructured : false)));
              if (!first) return;
              const spreadsheetId = defaultSpreadsheetId;
              try {
                const resp = await fetch('/api/genkit-tool-execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    toolCall: { function: { name: 'convert_unstructured_sheet', arguments: JSON.stringify({ spreadsheetId, sheetName: first }) } }
                  })
                });
                if (!resp.ok) {
                  const t = await resp.text();
                  console.error('Convert failed:', t);
                  await notify({
                    title: 'Conversion failed',
                    description: 'Could not convert the sheet. Please try again later.',
                    tone: 'danger',
                    okText: 'Close'
                  });
                } else {
                  const j = await resp.json();
                  await notify({
                    title: 'Structured sheet created',
                    description: `New sheet: ${j.newSheetName}`,
                    tone: 'success',
                    okText: 'Great'
                  });
                }
              } catch (e) {
                console.error(e);
                await notify({
                  title: 'Conversion error',
                  description: 'An error occurred during conversion.',
                  tone: 'danger',
                  okText: 'Close'
                });
              }
            }}
            title="Convert selected unstructured sheet into a new structured sheet"
          >
            Convert to structured
          </button>
        )}
        {selectedSheetNames.length > 0 && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
            {selectedSheetNames.length} selected
          </span>
        )}
      </div>
      
      {/* Sheet chips */}
      <div className="flex flex-wrap gap-2">
        {sheetNames.map(name => {
          const isSelected = selectedSheetNames.includes(name);
          const structure = sheetStructureCache[name];
          const isUnstructured = unstructuredOverrides[name] ?? (structure ? !structure.isStructured : false);
          return (
            <button
              key={name}
              onClick={() => toggleSheetSelection(name)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                focus:outline-none
                ${isSelected
                  ? 'text-green-700 dark:text-green-300 border-2 border-green-500/80 bg-green-50 dark:bg-green-900/20 shadow-sm'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                }
              `}
            >
              {/* Sheet icon */}
              <div className="flex items-center gap-2">
                {isSelected && (
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                )}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{name}</span>
                {isUnstructured && (
                  <span title="Unstructured format" className="ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300/60">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm.75 5a.75.75 0 00-1.5 0v7a.75.75 0 001.5 0V7zm-1 10a1 1 0 102 0 1 1 0 00-2 0z"/></svg>
                    Unstructured
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Help text */}
      {selectedSheetNames.length === 0 && sheetNames.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
          Click on sheets above to select which ones to edit
        </div>
      )}
      
      {/* Selected sheets summary */}
      {selectedSheetNames.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Ready to edit {selectedSheetNames.length} sheet{selectedSheetNames.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300 space-y-2">
            <div>Selected: {selectedSheetNames.join(', ')}</div>
            <div className="flex flex-wrap gap-2">
              {selectedSheetNames.map(name => {
                const structure = sheetStructureCache[name];
                const isUnstructured = unstructuredOverrides[name] ?? (structure ? !structure.isStructured : false);
                return (
                  <label key={`ovr-${name}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border bg-white dark:bg-gray-800">
                    <input
                      type="checkbox"
                      className="accent-amber-600"
                      checked={isUnstructured}
                      onChange={e => setUnstructuredOverride(name, e.target.checked)}
                    />
                    Treat {name} as unstructured
                    {structure && (
                      <span className="ml-1 text-[10px] text-gray-500">(detected {Math.round(structure.confidence*100)}% structured)</span>
                    )}
                  </label>
                );
              })}
            </div>
            {selectedSheetNames.some(n => (unstructuredOverrides[n] ?? (sheetStructureCache[n] ? !sheetStructureCache[n].isStructured : false))) && (
              <div className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                Updates on unstructured sheets will attempt cell-level writes and may be less accurate.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SheetChipSelector;
