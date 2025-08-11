"use client";

import React, { useState } from "react";

interface SheetSetupHelperProps {
  serviceAccountEmail?: string;
  initialOpen?: boolean;
}

const SheetSetupHelper: React.FC<SheetSetupHelperProps> = ({ serviceAccountEmail, initialOpen = false }) => {
  const [open, setOpen] = useState<boolean>(initialOpen);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);
  const [copiedHeaders, setCopiedHeaders] = useState<boolean>(false);

  const templateUrl = process.env.NEXT_PUBLIC_SHEET_TEMPLATE_URL || "";
  const csvTemplateHref = "/templates/structured-sheet-template.csv";
  const exampleHeaders = "Date,Description,Amount,Category,Notes";

  const handleCopyEmail = async () => {
    if (!serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 1200);
    } catch {
      // ignore
    }
  };

  const handleCopyHeaders = async () => {
    try {
      await navigator.clipboard.writeText(exampleHeaders);
      setCopiedHeaders(true);
      setTimeout(() => setCopiedHeaders(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="px-3 py-2 bg-black/10 border-t border-white/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left text-xs text-white/80 hover:text-white"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM11 7h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>
          <span>Sheet setup help</span>
        </span>
        <svg className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
      </button>

      {open && (
        <div className="mt-2 space-y-3 text-xs text-white/80">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="font-medium text-white mb-1">Recommended format</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Row 1: column names (headers), one per column</li>
              <li>Rows 2+: one entry per row</li>
              <li>Keep columns consistent across rows</li>
            </ul>
            <div className="mt-2 inline-flex flex-wrap gap-2">
              {templateUrl && (
                <a
                  href={templateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Use Google Sheets template
                </a>
              )}
              <a
                href={csvTemplateHref}
                download
                className="px-2 py-1 rounded-md border border-white/20 text-white/90 hover:border-white/50"
              >
                Download CSV template
              </a>
              <button
                onClick={handleCopyHeaders}
                className="px-2 py-1 rounded-md border border-white/20 text-white/90 hover:border-white/50"
                title="Copy example header row"
              >
                {copiedHeaders ? "Copied headers!" : "Copy example headers"}
              </button>
            </div>
            <div className="mt-2 text-white/70">
              Example header row:
              <div className="mt-1 font-mono text-[11px] bg-black/40 border border-white/10 rounded px-2 py-1 break-all">
                {exampleHeaders}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="font-medium text-white mb-1">Share access</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open your Google Sheet and click “Share”.</li>
              <li>Add the service account email below as an Editor.</li>
              <li>Paste the sheet URL or ID in the box above and click Add.</li>
            </ol>
            {!!serviceAccountEmail && (
              <div className="mt-2 flex items-center justify-between rounded bg-black/30 border border-white/10 px-2 py-1.5">
                <span className="truncate mr-2">{serviceAccountEmail}</span>
                <button
                  onClick={handleCopyEmail}
                  className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-white/20 text-white/90 hover:border-white/50"
                  aria-label="Copy service account email"
                >
                  {copiedEmail ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
            {!serviceAccountEmail && (
              <div className="mt-2 text-white/60">Service account email will appear here when configured.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SheetSetupHelper;


