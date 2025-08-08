"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const ChartRenderer = dynamic(() => import('../components/ChartRenderer'), { ssr: false });

type Section = {
  title: string;
  charts?: Array<{ kind: 'bar'|'line'|'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> }>;
  tables?: Array<{ title?: string; headers: string[]; rows: string[][]; footer?: string[]; summary?: string }>;
  insights?: string[];
};

function ReportContent() {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<any>(null);
  useEffect(() => {
    const key = searchParams?.get('key') ?? null;
    if (!key) { setReport(null); return; }
    try {
      const raw = sessionStorage.getItem(key);
      setReport(raw ? JSON.parse(raw) : null);
    } catch { setReport(null); }
  }, [searchParams]);

  if (!report) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold">No report found</div>
          <div className="text-white/70 mt-2 text-sm">Please generate a report from the main page.</div>
        </div>
      </div>
    );
  }

  const sections = (report.sections || []) as Section[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Report</h1>
          <div className="text-xs sm:text-sm text-white/70 mt-1">
            Spreadsheet: {report.spreadsheetId} · {Array.isArray(report.sheetNames) ? report.sheetNames.join(', ') : ''}
          </div>
        </div>

        <div className="space-y-6">
          {sections.map((sec, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
              <div className="text-base sm:text-lg font-semibold mb-2">{sec.title}</div>

              {Array.isArray(sec.insights) && sec.insights.length > 0 && (
                <ul className="mb-3 list-disc pl-5 text-sm text-white/90">
                  {sec.insights.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}

              {Array.isArray(sec.charts) && sec.charts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {sec.charts.map((spec, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <ChartRenderer spec={spec as any} />
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(sec.tables) && sec.tables.length > 0 && (
                <div className="space-y-3">
                  {sec.tables.map((t, ti) => (
                    <div key={ti} className="overflow-x-auto rounded-lg border border-white/10">
                      {t.title && (
                        <div className="px-3 py-2 border-b border-white/10 text-[11px] sm:text-[12px] font-semibold text-white/90">{t.title}</div>
                      )}
                      {t.summary && (
                        <div className="px-3 pt-2 text-[11px] sm:text-[12px] text-white/80">{t.summary}</div>
                      )}
                      <table className="min-w-full text-[11px] sm:text-[12px]">
                        <thead className="bg-sky-500/10">
                          <tr>{t.headers.map((h, hi) => (<th key={hi} className="px-2 sm:px-3 py-1.5 sm:py-2 text-left font-semibold text-sky-200 whitespace-nowrap border-b border-white/10">{h}</th>))}</tr>
                        </thead>
                        <tbody>
                          {t.rows.map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? 'bg-white/0' : 'bg-white/[0.03]'}>
                              {row.map((cell, ci) => (<td key={ci} className="px-2 sm:px-3 py-1.5 sm:py-2 text-white/90 whitespace-nowrap border-b border-white/10">{String(cell)}</td>))}
                            </tr>
                          ))}
                        </tbody>
                        {Array.isArray(t.footer) && t.footer.length > 0 && (
                          <tfoot>
                            <tr className="bg-white/[0.04]">
                              {t.footer.map((cell, fi) => (<td key={fi} className="px-2 sm:px-3 py-1.5 sm:py-2 text-white/95 font-semibold border-t border-white/10">{String(cell)}</td>))}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen text-white flex items-center justify-center">Loading report…</div>}>
      <ReportContent />
    </Suspense>
  );
}


