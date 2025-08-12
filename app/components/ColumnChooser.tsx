"use client";
import React from 'react';

export type ColumnChooserProps = {
  headers: string[];
  onSelect: (header: string) => void;
  onCancel?: () => void;
  title?: string;
};

export default function ColumnChooser({ headers, onSelect, onCancel, title }: ColumnChooserProps) {
  const uniqueHeaders = Array.from(
    new Set((headers || []).map(h => String(h ?? '').trim()).filter(Boolean))
  );

  if (!uniqueHeaders.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        No headers available. Load a sheet first.
      </div>
    );
  }

  return (
    <div className="w-full rounded-md border border-gray-200 bg-white p-3">
      <div className="mb-2 text-sm font-medium text-gray-800">{title || 'Select a column'}</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {uniqueHeaders.map((h, i) => (
          <button
            key={`${i}-${h}`}
            type="button"
            onClick={() => onSelect(h)}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-700">
              {i + 1}
            </span>
            <span>{h}</span>
          </button>
        ))}
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
      )}
    </div>
  );
}


