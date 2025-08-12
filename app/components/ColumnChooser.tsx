"use client";
import React from 'react';

export type ColumnChooserProps = {
  headers: string[];
  onSelect: (header: string) => void;
  title?: string;
};

export default function ColumnChooser({ headers, onSelect, title }: ColumnChooserProps) {
  const uniqueHeaders = Array.from(new Set((headers || []).map((h) => String(h ?? '').trim()).filter(Boolean)));

  if (!uniqueHeaders.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        No headers available. Load a sheet first.
      </div>
    );
  }

  return (
    <div className="w-full">
      {title ? <div className="mb-2 text-sm font-medium text-gray-800">{title}</div> : null}
      <div className="flex flex-wrap gap-2">
        {uniqueHeaders.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onSelect(h)}
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}


