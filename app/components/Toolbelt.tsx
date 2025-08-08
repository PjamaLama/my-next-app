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
        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        Toolbelt
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-[280px] max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/80 backdrop-blur p-2">
          <div className="text-[11px] text-white/80 px-1 pb-1">Available tools</div>
          <ul className="space-y-1">
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


