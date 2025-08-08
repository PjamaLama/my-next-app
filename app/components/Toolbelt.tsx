'use client';
import React, { useEffect, useState } from 'react';

type Tool = { name: string; label: string; description?: string };

export default function Toolbelt({
  selected,
  onChange
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch('/api/tools');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!alive) return;
        setTools(Array.isArray(data.tools) ? data.tools : []);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const toggle = (name: string) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange(Array.from(set));
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Tools"
        aria-label="Tools"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6A4.5 4.5 0 1120 9.5l-5.586 5.586a2 2 0 01-2.828 0L8 11.5 3.5 16 2 14.5 6.5 10l3.586 3.586a2 2 0 002.828 0L18 8.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 z-[100] w-[300px] max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/90 backdrop-blur p-2 shadow-xl">
          <div className="text-[11px] text-white/80 px-1 pb-2 border-b border-white/10">Available tools</div>
          <ul className="space-y-1 pt-2">
            {tools.map(t => (
              <li key={t.name} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-white/5">
                <input
                  id={`tool_${t.name}`}
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.includes(t.name)}
                  onChange={() => toggle(t.name)}
                />
                <label htmlFor={`tool_${t.name}`} className="flex-1 cursor-pointer">
                  <div className="text-[12px] text-white/90 font-medium">{t.label || t.name}</div>
                  {t.description && <div className="text-[11px] text-white/60">{t.description}</div>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


