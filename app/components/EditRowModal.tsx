"use client";

import React, { useState } from 'react';

type PreviewRowCell = { column: string; value: unknown };
type PreviewPayload = { headers: string[]; rows: Array<Array<PreviewRowCell>>; message?: string };

interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: PreviewPayload | null;
  onSubmit: (rowData: Array<PreviewRowCell>) => void;
}

const EditRowModal: React.FC<EditRowModalProps> = ({ isOpen, onClose, preview, onSubmit }) => {
  const [rowData, setRowData] = useState<Array<PreviewRowCell>>(preview?.rows?.[0] || []);

  if (!isOpen || !preview) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1000]">
      <div className="bg-white text-gray-900 p-4 rounded w-[92vw] max-w-lg">
        <h2 className="text-lg font-semibold mb-4">Edit Row</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(rowData);
          }}
        >
          {preview.headers.map((h) => (
            <div key={h} className="mb-2">
              <label className="block text-sm font-medium mb-1">{h}</label>
              <input
                type="text"
                value={String(rowData.find((r) => r.column === h)?.value ?? '')}
                onChange={(e) =>
                  setRowData((prev) =>
                    prev.some((r) => r.column === h)
                      ? prev.map((r) => (r.column === h ? { ...r, value: e.target.value } : r))
                      : [...prev, { column: h, value: e.target.value }]
                  )
                }
                className="border border-gray-300 rounded p-2 w-full text-sm"
              />
            </div>
          ))}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
              Save
            </button>
            <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRowModal;


