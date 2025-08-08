"use client";
import React, { useState } from 'react';

export default function Toolbelt({
  responsePrefs,
  onChangeResponsePrefs,
  onGenerateReport,
  onPreviewUpdates,
  onApplyUpdates
}: {
  responsePrefs: { charts: boolean; stats: boolean };
  onChangeResponsePrefs: (next: { charts: boolean; stats: boolean }) => void;
  onGenerateReport: () => void;
  onPreviewUpdates?: () => void;
  onApplyUpdates?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Report settings"
        aria-label="Report settings"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6A4.5 4.5 0 1120 9.5l-5.586 5.586a2 2 0 01-2.828 0L8 11.5 3.5 16 2 14.5 6.5 10l3.586 3.586a2 2 0 002.828 0L18 8.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 z-[100] w-[300px] max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/90 backdrop-blur p-3 shadow-xl">
          <div className="pb-2 border-b border-white/10">
            <div className="text-[11px] text-white/80">Response preferences</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChangeResponsePrefs({ ...responsePrefs, charts: !responsePrefs.charts })}
                className={`${responsePrefs.charts ? 'border-sky-400/60 bg-sky-500/10 text-sky-200' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'} text-[11px] px-2 py-1 rounded border`}
                title="Prefer responses with charts when applicable"
              >
                Charts
              </button>
              <button
                type="button"
                onClick={() => onChangeResponsePrefs({ ...responsePrefs, stats: !responsePrefs.stats })}
                className={`${responsePrefs.stats ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'} text-[11px] px-2 py-1 rounded border`}
                title="Prefer responses with stats/insights when applicable"
              >
                Stats
              </button>
            </div>
          </div>
          <div className="pt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-white/70">Actions</div>
            <button
              type="button"
              onClick={() => { setOpen(false); onGenerateReport(); }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-400/40"
              title="Generate a report with charts and statistics"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 15l3-3 2 2 5-5" />
              </svg>
              Generate report
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); onPreviewUpdates && onPreviewUpdates(); }}
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[12px] bg-white/5 hover:bg-white/10 text-white border border-white/15"
              title="Preview spreadsheet updates without applying"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview updates
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onApplyUpdates && onApplyUpdates(); }}
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[12px] bg-sky-600 hover:bg-sky-700 text-white border border-sky-400/40"
              title="Apply updates to the spreadsheet"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
              </svg>
              Apply changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

