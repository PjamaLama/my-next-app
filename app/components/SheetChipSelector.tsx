"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSheet } from '../providers/SheetProvider';
import { useDialog } from '../providers/DialogProvider';

const SheetChipSelector: React.FC = () => {
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames, sheetStructureCache, unstructuredOverrides, chosenBlockBySheet, setChosenBlockForSheet } = useSheet();
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

  // Lightweight refresh to pull updated sheet list (e.g., after conversion)
  const refreshSheetNames = async () => {
    if (!defaultSpreadsheetId) return;
    try {
      const res = await fetch(`/api/get-sheet-names?spreadsheetId=${defaultSpreadsheetId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverMsg = data?.error || data?.details || 'Failed to fetch sheet names';
        throw new Error(serverMsg);
      }
      setSheetNames(data.sheetNames);
    } catch (e) {
      console.warn('Failed to refresh sheet names:', e);
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
          <div className="mt-3 space-y-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              onClick={() =>
                notify({
                  title: 'Convert to Google Sheets',
                  tone: 'info',
                  okText: 'Got it',
                  description: (
                    <div className="space-y-3">
                      <div className="text-white/80 text-sm">
                        You can convert your file to Google Sheets in a few seconds:
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-white/80 text-sm">
                        <li>Open the file in Google Drive.</li>
                        <li>Click <span className="font-semibold">Open with → Google Sheets</span> (or upload and open in Sheets).</li>
                        <li>In Google Sheets, click <span className="font-semibold">File → Save as Google Sheets</span>.</li>
                        <li>Copy the new Sheet URL and paste the ID here.</li>
                      </ol>
                      {/* Embedded image in modal */}
                      <div className="rounded-lg overflow-hidden border border-white/10 bg-black/30 p-2">
                        <img
                          src="/templates/convert-to-google-sheets.png"
                          alt="How to convert to Google Sheets"
                          className="w-full h-auto max-w-[520px] max-h-72 mx-auto object-contain"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ),
                })
              }
            >
              How to convert (quick steps)
            </button>

            {/* Inline image fallback spot (no external link) */}
            <div className="rounded-lg overflow-hidden border border-white/10 bg-black/20 p-2">
              <img
                src="/templates/convert-to-google-sheets.png"
                alt="How to convert to Google Sheets"
                className="w-full h-auto max-w-[420px] max-h-56 mx-auto object-contain"
                loading="lazy"
              />
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
    <div className="space-y-3">
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
                  <span title="Unstructured format" className="ml-1 inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-300/40">
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
          {selectedSheetNames.some(n => (unstructuredOverrides[n] ?? (sheetStructureCache[n] ? !sheetStructureCache[n].isStructured : false))) && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-gray-700 bg-gray-800 hover:bg-gray-700 whitespace-nowrap"
              onClick={async () => {
                const spreadsheetId = defaultSpreadsheetId;
                const targets = selectedSheetNames.filter(n => (unstructuredOverrides[n] ?? (sheetStructureCache[n] ? !sheetStructureCache[n].isStructured : false)));
                if (!spreadsheetId || targets.length === 0) return;
                try {
                  const results = await Promise.allSettled(targets.map(async (name) => {
                    const resp = await fetch('/api/genkit-tool-execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        toolCall: { function: { name: 'convert_unstructured_sheet', arguments: JSON.stringify({ spreadsheetId, sheetName: name }) } }
                      })
                    });
                    if (!resp.ok) throw new Error(await resp.text());
                    return resp.json();
                  }));
                  const okCount = results.filter(r => r.status === 'fulfilled').length;
                  const failCount = results.length - okCount;
                  // Refresh sheet list so the new structured sheets appear
                  await refreshSheetNames();
                  await notify({
                    title: failCount === 0 ? 'Conversion complete' : 'Conversion partially complete',
                    description: failCount === 0 ? `Converted ${okCount} sheet${okCount !== 1 ? 's' : ''}.` : `Converted ${okCount}, ${failCount} failed.`,
                    tone: failCount === 0 ? 'success' : 'warning',
                    okText: 'OK'
                  });
                } catch (e) {
                  console.error(e);
                  await notify({
                    title: 'Conversion error',
                    description: 'An error occurred while converting selected sheets.',
                    tone: 'danger',
                    okText: 'Close'
                  });
                }
              }}
              title="Convert selected unstructured sheets into structured sheets"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M5 4h14a1 1 0 011 1v6a1 1 0 01-1 1h-6v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v4h4V6H6zm6 0v4h6V6h-6zM6 12v6h6v-6H6z"/>
              </svg>
              <span className="hidden sm:inline">Convert</span>
            </button>
          )}
          {/* Chart generation controls removed as per request */}
        </div>
      </div>

      {/* Block selector for transparency and manual override (first selected sheet) */}
      {selectedSheetNames.length > 0 && (() => {
        const sheetName = selectedSheetNames[0];
        const blocks = sheetStructureCache[sheetName]?.blocks || [];
        if (!blocks || blocks.length === 0) return null;
        const chosen = chosenBlockBySheet[sheetName];
        return (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-200">
            <span className="opacity-80">Block:</span>
            <select
              className="bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90"
              value={chosen == null ? '' : String(chosen)}
              onChange={(e) => {
                const idx = e.target.value === '' ? null : Number(e.target.value);
                setChosenBlockForSheet(sheetName, idx);
              }}
            >
              <option value="">Auto</option>
              {blocks.map((b, i) => (
                <option key={i} value={i}>{`Header@${b.headerRowIndex + 1} Rows ${b.startRowIndex + 1}-${b.endRowIndex + 1}`}</option>
              ))}
            </select>
            {chosen != null && blocks[chosen] && (
              <span className="opacity-60">Selected: {`Header@${blocks[chosen].headerRowIndex + 1}`}</span>
            )}
          </div>
        );
      })()}
      
      {/* Help text */}
      {selectedSheetNames.length === 0 && sheetNames.length > 0 && (
        <div className="text-xs text-gray-400 text-center py-2">
          Click on sheets above to select which ones to edit
        </div>
      )}
      
      {/* Selected sheets summary removed per request */}
    </div>
  );
};

export default SheetChipSelector;
