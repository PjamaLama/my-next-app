"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSheet } from '../providers/SheetProvider';
import { useDialog } from '../providers/DialogProvider';

const SheetChipSelector: React.FC = () => {
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames, sheetStructureCache, unstructuredOverrides } = useSheet();
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

  // Only fetch sheet names when explicitly requested or when there's a new spreadsheet ID
  const [hasInitialized, setHasInitialized] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Reset initialization state when spreadsheet changes
    if (defaultSpreadsheetId) {
      setHasInitialized(false);
      setSheetNames([]);
      setError(null);
    } else {
      // Clear everything when no spreadsheet is selected
      setHasInitialized(false);
      setSheetNames([]);
      setError(null);
      setSelectedSheetNamesRef.current([]);
    }
  }, [defaultSpreadsheetId]);

  // Listen for spreadsheet removal events and refresh accordingly
  useEffect(() => {
    const handleSpreadsheetRemoved = () => {
      if (defaultSpreadsheetId) {
        setRefreshTrigger(prev => prev + 1);
      }
    };

    // Listen for custom event when spreadsheet is removed
    const eventListener = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.action === 'spreadsheet-removed') {
        handleSpreadsheetRemoved();
      }
    };

    window.addEventListener('sheet-selector-refresh' as any, eventListener);

    return () => {
      window.removeEventListener('sheet-selector-refresh' as any, eventListener);
    };
  }, [defaultSpreadsheetId]);

  useEffect(() => {
    if (defaultSpreadsheetId && (!hasInitialized || refreshTrigger > 0)) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/get-sheet-names?spreadsheetId=${defaultSpreadsheetId}&forceRefresh=true`)
        .then(async res => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            const serverMsg = json?.error || json?.details || 'Failed to fetch sheet names';
            const hint = json?.hint ? ` — ${json.hint}` : '';
            throw new Error(`${serverMsg}${hint}`);
          }
          return json;
        })
        .then(data => {
          const names: string[] = Array.isArray(data.sheetNames) ? data.sheetNames : [];
          setSheetNames(names);
          // Drop stale selections that no longer exist
          const current = selectedSheetNamesRef.current;
          const pruned = current.filter((n: string) => names.includes(n));
          if (pruned.length !== current.length) {
            setSelectedSheetNamesRef.current(pruned);
          }
          // Only set default selection if no sheets are currently selected
          if (names.length > 0 && pruned.length === 0) {
            setSelectedSheetNamesRef.current([names[0]]);
          }
          setHasInitialized(true);
        })
        .catch(err => {
          setError(err.message);
          // Clear sheet names on error to ensure clean state
          setSheetNames([]);
          setSelectedSheetNamesRef.current([]);
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!defaultSpreadsheetId && (hasInitialized || refreshTrigger > 0)) {
      // Clear state when no spreadsheet is selected
      setSheetNames([]);
      setError(null);
      setSelectedSheetNamesRef.current([]);
      setHasInitialized(false);
      setIsLoading(false);
    }
  }, [defaultSpreadsheetId, hasInitialized, refreshTrigger]); // Also depend on refreshTrigger

  // Lightweight refresh to pull updated sheet list (e.g., after conversion)
  const refreshSheetNames = async () => {
    if (!defaultSpreadsheetId) {
      // Clear state when no spreadsheet is selected
      setSheetNames([]);
      setError(null);
      setSelectedSheetNamesRef.current([]);
      setHasInitialized(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/get-sheet-names?spreadsheetId=${defaultSpreadsheetId}&forceRefresh=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverMsg = data?.error || data?.details || 'Failed to fetch sheet names';
        throw new Error(serverMsg);
      }
      const names: string[] = Array.isArray(data.sheetNames) ? data.sheetNames : [];
      setSheetNames(names);
      // Drop stale selections that no longer exist
      const current = selectedSheetNamesRef.current;
      const pruned = current.filter((n: string) => names.includes(n));
      if (pruned.length !== current.length) {
        setSelectedSheetNamesRef.current(pruned);
      }
      // Only set default selection if no sheets are currently selected
      if (names.length > 0 && pruned.length === 0) {
        setSelectedSheetNamesRef.current([names[0]]);
      }
      setHasInitialized(true);
    } catch (e) {
      console.warn('Failed to refresh sheet names:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to refresh sheet names';
      setError(errorMessage);
      // Clear sheet names on error to ensure clean state
      setSheetNames([]);
      setSelectedSheetNamesRef.current([]);
    } finally {
      setIsLoading(false);
    }
  };

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

  // Also hide if we have no sheets and no error (clean state)
  if (sheetNames.length === 0 && !error && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
        <span className="ml-2 text-sm text-gray-400">Loading sheets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-red-400">Error: {error}</span>
        </div>
        {/* If not a Google Sheet, show in-app modal trigger and inline GIF spot */}
        {typeof error === 'string' && error.includes('The provided ID is not a Google Sheet') && (
          <div className="mt-3 space-y-3">
            {/* URL Format Error */}
            <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="text-xs text-red-200">
                  <div className="font-medium mb-2">❌ Invalid Google Sheets URL</div>
                  <div className="space-y-2">
                    <div className="text-red-300/80">
                      The URL you provided is not a valid Google Sheets link. Here's how to get the correct URL:
                    </div>
                    <div className="bg-red-900/30 border border-red-700/50 rounded p-2">
                      <div className="text-red-300 text-xs font-medium mb-1">Common Issues:</div>
                      <ul className="text-red-300/80 text-xs space-y-1 ml-2">
                        <li>• Using Excel file URL instead of Google Sheets</li>
                        <li>• Wrong format (needs to be sheets.google.com)</li>
                        <li>• Private sheet without proper sharing</li>
                        <li>• Invalid or incomplete URL</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step-by-Step Solution */}
            <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-xs text-amber-200">
                  <div className="font-medium mb-2">🔧 How to Get the Correct URL</div>
                  <div className="space-y-3">
                    {/* Excel Conversion Steps */}
                    <div>
                      <div className="font-medium text-amber-300 mb-1">If you have an Excel file:</div>
                      <ol className="list-decimal list-inside space-y-1 text-amber-300/80 ml-2">
                        <li>Upload your Excel file to <button
                            onClick={() => window.open('https://drive.google.com', '_blank')}
                            className="text-amber-400 underline hover:text-amber-300"
                          >Google Drive</button></li>
                        <li>Right-click the file → <strong>Open with → Google Sheets</strong></li>
                        <li>Click <strong>File → Save as Google Sheets</strong> (if prompted)</li>
                        <li>Copy the URL from your browser's address bar</li>
                        <li>Paste the Google Sheets URL here</li>
                      </ol>
                    </div>

                    {/* Existing Google Sheets Steps */}
                    <div>
                      <div className="font-medium text-amber-300 mb-1">If you already have a Google Sheet:</div>
                      <ol className="list-decimal list-inside space-y-1 text-amber-300/80 ml-2">
                        <li>Open your Google Sheet in a web browser</li>
                        <li>Copy the full URL from the address bar</li>
                        <li>Make sure the URL starts with <code className="bg-amber-900/50 px-1 rounded text-xs">https://docs.google.com/spreadsheets/</code></li>
                        <li>Ensure the sheet is shared publicly or you have access</li>
                      </ol>
                    </div>

                    {/* URL Format Examples */}
                    <div className="pt-2 border-t border-amber-800/30">
                      <div className="text-amber-300/80">
                        <div className="font-medium mb-1">✅ Correct URL format:</div>
                        <code className="bg-amber-900/50 px-2 py-1 rounded text-xs block">
                          https://docs.google.com/spreadsheets/d/1ABC123.../edit
                        </code>
                        <div className="font-medium mt-2 mb-1">❌ Wrong formats:</div>
                        <div className="text-amber-400/60 text-xs space-y-1">
                          <div>• Excel file URLs (.xlsx, .xls)</div>
                          <div>• Google Drive folder links</div>
                          <div>• Incomplete or broken URLs</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 px-3 py-2 rounded-md text-sm font-medium border border-white/15 bg-white/5 text-white/90 hover:bg-white/10 transition-colors"
                onClick={() => {
                  window.open('https://drive.google.com', '_blank');
                }}
              >
                📁 Open Google Drive
              </button>
              <button
                type="button"
                className="flex-1 px-3 py-2 rounded-md text-sm font-medium border border-white/15 bg-white/5 text-white/90 hover:bg-white/10 transition-colors"
                onClick={() => {
                  window.open('https://sheets.google.com', '_blank');
                }}
              >
                📊 Open Google Sheets
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  console.log('=== Render Debug ===');
  console.log('sheetNames:', sheetNames);
  console.log('selectedSheetNames:', selectedSheetNames);
  console.log('isLoading:', isLoading);
  console.log('error:', error);

  return (
    <div className="space-y-3" data-tutorial="sheet-selector">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/80">Available Sheets</h3>
        <button
          onClick={refreshSheetNames}
          disabled={isLoading}
          className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/70 hover:text-white/90 rounded transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      
      {/* Sheet chips with inline compact controls */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
        {sheetNames.map(name => {
          const isSelected = selectedSheetNames.includes(name);
          const structure = sheetStructureCache[name];
          const isUnstructured = unstructuredOverrides[name] ?? (structure ? !structure.isStructured : false);
          return (
            <div
              key={name}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggleSheetSelection(name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleSheetSelection(name);
                }
              }}
              className={`
                px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-[11px] sm:text-sm font-medium transition-all duration-200
                focus:outline-none
                ${isSelected
                  ? 'text-green-300 border-2 border-green-500/80 bg-green-900/20 shadow-sm'
                  : 'bg-gray-700 text-gray-200'
                }
              `}
            >
              {/* Sheet icon */}
              <div className="flex items-center gap-2">
                {isSelected && (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                )}
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate max-w-[40vw] sm:max-w-none">{name}</span>
                {/* Chart generation removed as per request */}
                {isUnstructured && (
                  <span
                    title={structure ? `Unstructured: ${structure.issues.join(', ')}` : "Unstructured format"}
                    className="ml-1 inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-300/40 cursor-help"
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm.75 5a.75.75 0 00-1.5 0v7a.75.75 0 001.5 0V7zm-1 10a1 1 0 102 0 1 1 0 00-2 0z"/></svg>
                    Unstructured
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {/* Right-aligned compact controls */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {selectedSheetNames.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-800/50 whitespace-nowrap">
              {selectedSheetNames.length} selected
            </span>
          )}
          {/* Chart generation controls removed as per request */}
        </div>
      </div>

      
      
      {/* Help text */}
      {selectedSheetNames.length === 0 && sheetNames.length > 0 && (
        <div className="text-xs text-gray-400 text-center py-2">
          Click on sheets above to select which ones to edit
        </div>
      )}

      {/* Enhanced error and help guidance */}
      {sheetNames.some(name => {
        const structure = sheetStructureCache[name];
        return structure && !structure.isStructured;
      }) && (
        <div className="mt-3 space-y-3">
          {/* Excel Conversion Issues */}
          <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="text-xs text-red-200">
                <div className="font-medium mb-2">❌ Sheet Format Issues Detected</div>
                <div className="space-y-2">
                  {sheetNames.map(name => {
                    const structure = sheetStructureCache[name];
                    if (!structure || structure.isStructured) return null;
                    return (
                      <div key={name} className="border-l-2 border-red-600/50 pl-2">
                        <div className="font-medium text-red-300">Sheet: {name}</div>
                        <div className="text-red-300/80 mt-1">
                          {structure.issues.map((issue, idx) => (
                            <div key={idx} className="mb-1">• {issue}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Step-by-Step Fix Instructions */}
          <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-amber-200">
                <div className="font-medium mb-2">🔧 How to Fix Your Sheets</div>
                <div className="space-y-3">
                  {/* Excel to Google Sheets Conversion */}
                  <div>
                    <div className="font-medium text-amber-300 mb-1">For Excel Files (.xlsx, .xls):</div>
                    <ol className="list-decimal list-inside space-y-1 text-amber-300/80 ml-2">
                      <li>Upload your Excel file to <button
                          onClick={() => window.open('https://drive.google.com', '_blank')}
                          className="text-amber-400 underline hover:text-amber-300"
                        >Google Drive</button></li>
                      <li>Right-click the file → <strong>Open with → Google Sheets</strong></li>
                      <li>If prompted, click <strong>Save as Google Sheets</strong></li>
                      <li>Copy the new Google Sheets URL and paste it above</li>
                    </ol>
                  </div>

                  {/* Formatting Issues */}
                  <div>
                    <div className="font-medium text-amber-300 mb-1">For Formatting Issues:</div>
                    <ol className="list-decimal list-inside space-y-1 text-amber-300/80 ml-2">
                      <li>Ensure the <strong>first row</strong> contains column headers (not data)</li>
                      <li>Add at least <strong>one row of data</strong> below the headers</li>
                      <li>Remove completely blank rows at the top of your sheet</li>
                      <li>Make sure headers are in row 1 (not row 2, 3, etc.)</li>
                    </ol>
                  </div>

                  {/* Additional Help */}
                  <div className="pt-2 border-t border-amber-800/30">
                    <div className="text-amber-300/80">
                      <strong>💡 Tip:</strong> Google automatically converts most Excel files. If you see formatting issues, try opening the file in Google Sheets and saving it again.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Selected sheets summary removed per request */}
    </div>
  );
};

export default SheetChipSelector;
