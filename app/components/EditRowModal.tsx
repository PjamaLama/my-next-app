"use client";

import React, { useState, useEffect } from 'react';
import { DialogProvider } from '../providers/DialogProvider';

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: {
    headers: string[];
    rows: Array<Array<{ column: string; value: unknown }>>;
    message?: string;
  };
  onSubmit: (rowData: Array<{ column: string; value: unknown }>) => void;
  activeSheet?: string;
}

export default function EditRowModal({ isOpen, onClose, preview, onSubmit, activeSheet }: EditRowModalProps) {
  const [rowData, setRowData] = useState<Array<{ column: string; value: unknown }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Safety check - if no preview data, don't render
  if (!preview || !preview.headers) {
    return null;
  }

  // Get headers from preview or fallback to cached headers
  const cachedHeaders: string[] = typeof window !== 'undefined' && (window as any)?.__sheetDataCache && Array.isArray((window as any).__sheetDataCache?.[activeSheet || '']) && (window as any).__sheetDataCache?.[activeSheet || ''].length > 0
    ? ((window as any).__sheetDataCache?.[activeSheet || ''][0] as string[])
    : [];
  const headers: string[] = Array.isArray(preview.headers) && preview.headers.length > 0 ? preview.headers : cachedHeaders;

  // Initialize rowData when preview changes
  useEffect(() => {
    if (preview.rows && preview.rows.length > 0) {
      setRowData([...preview.rows[0]]);
    }
  }, [preview]);

  const handleInputChange = (index: number, value: string) => {
    const newRowData = [...rowData];
    newRowData[index] = { ...newRowData[index], value };
    setRowData(newRowData);
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      // Pass the edited data back to parent component instead of submitting to backend
      onSubmit(rowData);
      onClose();
    } catch (error) {
      console.error('Error saving changes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Row Data</h2>
            {activeSheet && (
              <p className="text-sm text-gray-400 mt-1">Sheet: {activeSheet}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl font-bold"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Content - scrollable area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Preview message if available */}
          {preview.message && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <p className="text-blue-200 text-sm">{preview.message}</p>
            </div>
          )}

          {/* Input fields */}
          <div className="space-y-4">
            {headers.map((header, index) => (
              <div key={index}>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {header}
                </label>
                <input
                  type="text"
                  value={String(rowData[index]?.value || '')}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder={`Enter ${header.toLowerCase()}`}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer - always visible */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-md transition-colors"
            title="Cancel (Esc)"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors inline-flex items-center gap-2"
            title="Save Changes (Enter)"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes (Enter)'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


