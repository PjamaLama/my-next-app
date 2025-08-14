"use client";

import React, { useState } from 'react';
import { useSheet } from "../providers/SheetProvider";
import { useDialog } from "../providers/DialogProvider";

type PreviewRowCell = { column: string; value: unknown };
type PreviewPayload = { headers: string[]; rows: Array<Array<PreviewRowCell>>; message?: string };

// Simple Edit modal for row value updates.
interface EditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: PreviewPayload | null;
  onSubmit?: (rowData: Array<PreviewRowCell>) => void;
}

const EditRowModal: React.FC<EditRowModalProps> = ({ isOpen, onClose, preview, onSubmit }) => {
  const { defaultSpreadsheetId, selectedSheetNames, sheetDataCache, setSheetDataCache } = useSheet();
  const { notify } = useDialog();
  const [rowData, setRowData] = useState<Array<PreviewRowCell>>(preview?.rows?.[0] || []);

  if (!isOpen || !preview) return null;

  // Determine headers from preview first, then fall back to cached sheet headers
  const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
  const cachedHeaders: string[] = activeSheet && Array.isArray(sheetDataCache?.[activeSheet]) && sheetDataCache[activeSheet].length > 0
    ? (sheetDataCache[activeSheet][0] as string[])
    : [];
  const headers: string[] = Array.isArray(preview.headers) && preview.headers.length > 0 ? preview.headers : cachedHeaders;

  const handleSave = async () => {
    try {
      // Build a row object using all headers; prefer edited values where provided
      const rowObj: Record<string, unknown> = {};
      headers.forEach((h) => {
        const found = rowData.find((r) => r.column === h);
        rowObj[h] = found ? found.value : '';
      });

      // Construct tool call to apply_structured_rows with commit: true
      const toolCall = {
        function: {
          name: 'apply_structured_rows',
          arguments: JSON.stringify({ rows: [rowObj], commit: true })
        }
      } as const;

      const resp = await fetch('/api/genkit-tool-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCall, context: { spreadsheetId: defaultSpreadsheetId, sheetNames: selectedSheetNames } })
      });

      if (!resp.ok) {
        try { const err = await resp.json(); await notify({ title: 'Failed', description: String(err?.error || err?.result || 'Apply failed'), tone: 'danger' }); } catch {}
        return;
      }

      // Re-hydrate current sheet on success
      if (defaultSpreadsheetId && activeSheet) {
        try {
          const dataRes = await fetch('/api/get-sheet-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: activeSheet })
          });
          const json = await dataRes.json();
          if (json && json.data) setSheetDataCache((prev) => ({ ...prev, [activeSheet]: json.data }));
        } catch {}
      }

      // Optional: propagate edited row back to parent for any local state updates
      try { if (typeof onSubmit === 'function') onSubmit(rowData); } catch {}

      await notify({ title: 'Success', description: 'Update applied, added 1 row(s).', tone: 'success' });
      onClose();
    } catch {
      await notify({ title: 'Failed', description: 'Apply failed', tone: 'danger' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1000]">
      <div className="bg-white text-gray-900 p-4 rounded w-[92vw] max-w-lg">
        <h2 className="text-lg font-semibold mb-4">Edit Row</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {headers.map((h) => (
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


