"use client";

import React, { useState, useEffect } from 'react';
import { DialogProvider } from '../providers/DialogProvider';

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: {
    headers: string[];
    rows: Array<Array<{ column: string; value: unknown }>>; // Now expects multiple rows
    message?: string;
    messageId?: string;
    tableIndex?: number;
    title?: string;
  };
  onSubmit: (editedRows: Array<Array<{ column: string; value: unknown }>>) => void; // Now submits multiple rows
  activeSheet?: string;
}

export default function EditRowModal({ isOpen, onClose, preview, onSubmit, activeSheet }: EditRowModalProps) {
  const [editedRowsData, setEditedRowsData] = useState<Array<Array<{ column: string; value: unknown }>>>([]); // State for multiple rows
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

  // Initialize editedRowsData when preview changes
  useEffect(() => {
    if (preview.rows && preview.rows.length > 0) {
      setEditedRowsData(preview.rows.map(row => [...row])); // Initialize with all rows
    }
  }, [preview]);

  const handleInputChange = (rowIndex: number, cellIndex: number, value: string) => {
    const newEditedRowsData = [...editedRowsData];
    newEditedRowsData[rowIndex][cellIndex] = { ...newEditedRowsData[rowIndex][cellIndex], value };
    setEditedRowsData(newEditedRowsData);
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      // Pass all edited rows data back to parent component
      onSubmit(editedRowsData);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full flex flex-col max-h-[95vh] sm:max-h-[calc(100vh-2rem)]"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Edit Row Data</h2>
            {activeSheet && (
              <p className="text-sm text-gray-400 mt-1">Sheet: {activeSheet}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl sm:text-2xl font-bold p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-800 active:scale-95"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Content - scrollable area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Preview message if available */}
          {preview.message && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <p className="text-blue-200 text-sm">{preview.message}</p>
            </div>
          )}

          {/* Input fields for each row */}
          {editedRowsData.map((row, rowIndex) => (
            <div key={rowIndex} className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800">
              <h3 className="text-lg font-semibold text-white mb-4">Row {rowIndex + 1}</h3>
              <div className="space-y-4">
                {headers.map((header, cellIndex) => (
                  <div key={`${rowIndex}-${cellIndex}`}>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {header}
                    </label>
                    <input
                      type="text"
                      value={String(row[cellIndex]?.value || '')}
                      onChange={(e) => handleInputChange(rowIndex, cellIndex, e.target.value)}
                      className="w-full px-4 py-3 min-h-[48px] bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-base"
                      placeholder={`Enter ${header.toLowerCase()}`}
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer - always visible */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 p-4 sm:p-6 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-3 min-h-[48px] text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-md transition-colors active:scale-95 order-2 sm:order-1"
            title="Cancel (Esc)"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 min-h-[48px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors inline-flex items-center justify-center gap-2 active:scale-95 order-1 sm:order-2"
            title="Save Changes"
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


