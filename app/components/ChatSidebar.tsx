"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useChat } from "../providers/ChatProvider";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, Trash2, MessageSquare, Table as TableIcon, ExternalLink, Copy, Check } from 'lucide-react';
import { useSheet } from "../providers/SheetProvider";
import { useFirebase } from "../providers/FirebaseProvider";
import { useDialog } from "../providers/DialogProvider";
dayjs.extend(relativeTime);

interface ChatSidebarProps {
  embedded?: boolean;
  peek?: boolean; // compact mode that still shows titles
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ embedded = false, peek = false }) => {
  const { sessions, currentSessionId, setCurrentSessionId, createSession, deleteSession, ensureSession } = useChat();
  const { user } = useFirebase();
  const { defaultSpreadsheetId, setDefaultSpreadsheetId } = useSheet();
  const { confirm } = useDialog();
  const [creating, setCreating] = useState(false);
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; spreadsheetId: string; title?: string }>>([]);
  const [spreadsheetsLoading, setSpreadsheetsLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newSheetId, setNewSheetId] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>("");
  const [serviceAccountChecked, setServiceAccountChecked] = useState(false);
  const [copiedServiceAccount, setCopiedServiceAccount] = useState(false);

  // Load service account email once for configuration tips
  useEffect(() => {
    if (serviceAccountChecked) return;
    fetch('/api/get-service-account')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { if (data?.email) setServiceAccountEmail(data.email); })
      .catch(() => {})
      .finally(() => setServiceAccountChecked(true));
  }, [serviceAccountChecked]);

  // Subscribe to user's spreadsheets list in Firestore
  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      if (!user) { setSpreadsheets([]); return; }
      setSpreadsheetsLoading(true);
      const { collection, onSnapshot } = await import('firebase/firestore');
      const { db } = await import('../providers/FirebaseProvider');
      const ref = collection(db, 'users', user.uid, 'options');
      unsub = onSnapshot(ref, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(x => typeof x.spreadsheetId === 'string')
          .map(x => ({ id: x.id, spreadsheetId: x.spreadsheetId as string, title: x.title as string | undefined }));
        setSpreadsheets(items);
        setSpreadsheetsLoading(false);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [user]);

  const saveSpreadsheetOption = async (spreadsheetId: string) => {
    if (!user || !spreadsheetId) return;
    const { collection, addDoc } = await import('firebase/firestore');
    const { db } = await import('../providers/FirebaseProvider');
    const optionsRef = collection(db, 'users', user.uid, 'options');
    const meta = await fetch(`/api/get-sheet-names?spreadsheetId=${encodeURIComponent(spreadsheetId)}`).then(r => r.json()).catch(() => ({}));
    await addDoc(optionsRef, { spreadsheetId, title: meta?.spreadsheetTitle || undefined });
  };

  const removeSpreadsheetOption = async (id: string, spreadsheetId?: string) => {
    if (!user || !id) return;
    const { doc, deleteDoc } = await import('firebase/firestore');
    const { db } = await import('../providers/FirebaseProvider');
    await deleteDoc(doc(db, 'users', user.uid, 'options', id));
    if ((spreadsheetId && defaultSpreadsheetId === spreadsheetId) || (spreadsheets.length === 1 && defaultSpreadsheetId)) {
      setDefaultSpreadsheetId("");
    }
  };

  const handleAddSpreadsheet = async () => {
    const normalizeSheetId = (input: string): string => {
      const trimmed = (input || '').trim();
      if (!trimmed) return '';
      // Try URL parsing to extract /spreadsheets/d/{ID}
      try {
        const url = new URL(trimmed);
        const segments = url.pathname.split('/').filter(Boolean);
        const dIndex = segments.findIndex((seg) => seg === 'd');
        if (dIndex !== -1 && segments[dIndex + 1]) {
          return segments[dIndex + 1];
        }
      } catch {
        // Not a full URL, fall through
      }
      // Fallback: split on "/d/" if present
      if (trimmed.includes('/d/')) {
        const afterD = trimmed.split('/d/')[1] || '';
        return afterD.split('/')[0] || trimmed;
      }
      return trimmed;
    };
    const parsedId = normalizeSheetId(newSheetId);
    if (!parsedId) return;
    setAddingSheet(true);
    try {
      await saveSpreadsheetOption(parsedId);
      setDefaultSpreadsheetId(parsedId);
      setNewSheetId("");
    } finally {
      setAddingSheet(false);
    }
  };

  const sortedSessions = useMemo(() => sessions, [sessions]);
  const visibleSessions = useMemo(
    () => sortedSessions.filter(s => (s.title || '').trim().length > 0),
    [sortedSessions]
  );

  const handleCreate = async () => {
    setCreating(true);
    try {
      const id = await createSession();
      if (id) setCurrentSessionId(id);
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = async (id: string) => {
    setCurrentSessionId(id);
    await ensureSession();
  };

  // Manual renaming removed; titles are generated by AI after first message

  const handleCopyServiceAccount = async () => {
    if (!serviceAccountEmail) return;
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopiedServiceAccount(true);
      setTimeout(() => setCopiedServiceAccount(false), 1500);
    } catch {}
  };

  const renderSessionRow = (s: { id: string; title: string; updatedAt: string; lastMessageSnippet?: string }) => (
    <li key={s.id}>
      <div className={`group relative`}
           style={{ background: 'transparent' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect(s.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(s.id); }}
          className={`w-full text-left ${peek ? 'py-1.5' : 'py-2'} pl-3 flex items-center gap-2 cursor-pointer select-none`}
          style={{ background: 'transparent' }}
        >
          <div className="min-w-0 flex-1 pl-6">
            <div className="flex items-center gap-2">
              <div className={`truncate text-sm ${currentSessionId === s.id ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white'}`}>{s.title || '...'}</div>
            </div>
          </div>
          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-1 shrink-0 mr-3">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const ok = await confirm({
                  title: 'Delete chat',
                  description: 'This will permanently delete this conversation. This action cannot be undone.',
                  tone: 'danger',
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                });
                if (ok) {
                  await deleteSession(s.id);
                  await ensureSession();
                }
              }}
              className={`grid place-items-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-red-400/30 text-red-300 hover:text-red-200 hover:border-red-300/60 focus:outline-none focus:ring-1 focus:ring-red-300/30 leading-none`}
              title="Delete"
              aria-label="Delete chat"
            >
              <Trash2 className={`${peek ? 'w-3 h-3' : 'w-3 h-3'} block`} />
            </button>
          </div>
        </div>
        {/* no floating hover actions in simple list mode */}
      </div>
    </li>
  );

  if (embedded) {
    // Render the same UI in embedded mode
    return (
      <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquare className="w-4 h-4" />
            {!peek && 'Chats'}
             <span className="text-xs text-white/60">{!peek && `(${visibleSessions.length})`}</span>
          </div>
        <div className="shrink-0">
          <button
            onClick={handleCreate}
            className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent`}
            disabled={creating}
            title="New Chat"
            aria-label="New chat"
          >
            <Plus className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          </button>
        </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto py-2">
            {/* Chats list under Chats header */}
            {visibleSessions.length === 0 ? (
              <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
            ) : (
              <ul className="space-y-1">
              {visibleSessions.map((s) => renderSessionRow(s))}
              </ul>
            )}
          </div>

          {/* Spreadsheets manager below chats (separate from chat scroll) */}
          <div className="mt-2 mx-3 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between bg-white/5 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <TableIcon className="w-4 h-4" />
                {!peek && 'Spreadsheets'}
                <span className="text-xs text-white/60">{!peek && `(${spreadsheets.length})`}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAddOpen(o => !o)}
                  className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50`}
                  title="Add spreadsheet"
                  aria-label="Add spreadsheet"
                >
                  <Plus className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                </button>
              </div>
            </div>
            {addOpen && (
              <div className="px-3 py-2 bg-black/10 border-b border-white/10 flex items-center gap-2">
                <input
                  value={newSheetId}
                  onChange={(e) => setNewSheetId(e.target.value)}
                  placeholder="Paste full Google Sheets URL or ID"
                  className="flex-1 px-2 py-1 text-xs rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none"
                />
                <button
                  onClick={handleAddSpreadsheet}
                  disabled={addingSheet}
                  className="px-2 py-1 rounded-md text-xs bg-blue-600 hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            )}
            {serviceAccountEmail && (
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="min-w-0 mr-2">
                  <div className="text-[11px] text-white/60">Service account</div>
                  <div className="text-xs text-white/90 truncate" title={serviceAccountEmail}>{serviceAccountEmail}</div>
                </div>
                <button
                  onClick={handleCopyServiceAccount}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 shrink-0"
                  title="Copy service account email"
                  aria-label="Copy service account email"
                >
                  {copiedServiceAccount ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
            {/* List */}
            <div className="px-2 py-2 space-y-1 border-t border-white/10">
              {spreadsheetsLoading && (
                <div className="text-xs text-white/60 px-2">Loading spreadsheets…</div>
              )}
              {!spreadsheetsLoading && spreadsheets.length === 0 && (
                <div className="text-xs text-white/60 px-2">No spreadsheets yet. Add one above.</div>
              )}
              {spreadsheets.map((s) => {
                const active = defaultSpreadsheetId === s.spreadsheetId;
                return (
                  <div key={s.id} className={`group flex items-center gap-1.5 px-2 h-9 rounded-md ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <button
                      onClick={() => setDefaultSpreadsheetId(s.spreadsheetId)}
                      className="flex-1 text-left min-w-0"
                      title={s.title || s.spreadsheetId}
                    >
                      <div className={`truncate text-xs ${active ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white'}`}>
                        {s.title || s.spreadsheetId}
                      </div>
                    </button>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(s.spreadsheetId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="grid place-items-center h-6 w-6 rounded text-white/70 hover:text-white"
                      title="Open in Google Sheets"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Remove spreadsheet',
                          description: 'Disconnect this spreadsheet from your account? You can add it again later.',
                          tone: 'warning',
                          confirmText: 'Remove',
                          cancelText: 'Cancel',
                        });
                        if (ok) await removeSpreadsheetOption(s.id, s.spreadsheetId);
                      }}
                      className="grid place-items-center h-6 w-6 rounded text-red-300 hover:text-red-200"
                      title="Remove"
                      aria-label="Remove spreadsheet"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-embedded: render the same persistent sidebar (no open/close button)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <MessageSquare className="w-4 h-4" />
          {!peek && 'Chats'}
          <span className="text-xs text-white/60">{!peek && `(${visibleSessions.length})`}</span>
        </div>
        <div className="shrink-0">
          <button
            onClick={handleCreate}
            className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-400/50`}
            disabled={creating}
            title="New Chat"
            aria-label="New chat"
          >
            <Plus className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-0 py-2">
          {/* Chats list under Chats header */}
          {visibleSessions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
          ) : (
            <ul className="space-y-1">
              {visibleSessions.map((s) => renderSessionRow(s))}
            </ul>
          )}
        </div>

        {/* Spreadsheets manager below chats (separate from chat scroll) */}
        <div className="mt-2 mx-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          {/* Manager header */}
          <div className="px-3 py-2 flex items-center justify-between bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <TableIcon className="w-4 h-4" />
              {!peek && 'Spreadsheets'}
              <span className="text-xs text-white/60">{!peek && `(${spreadsheets.length})`}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAddOpen(o => !o)}
                className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50`}
                title="Add spreadsheet"
                aria-label="Add spreadsheet"
              >
                <Plus className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
              </button>
            </div>
          </div>
          {addOpen && (
            <div className="px-3 py-2 bg-black/20 border-b border-white/10 flex items-center gap-2">
              <input
                value={newSheetId}
                onChange={(e) => setNewSheetId(e.target.value)}
                placeholder="Paste full Google Sheets URL or ID"
                className="flex-1 px-2 py-1 text-xs rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none"
              />
              <button
                onClick={handleAddSpreadsheet}
                disabled={addingSheet}
                className="px-2 py-1 rounded-md text-xs bg-blue-600 hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          )}
          {serviceAccountEmail && (
            <div className="px-3 py-2 bg-black/10">
              <div className="flex items-center justify-between rounded-md bg-white/5 border border-white/10 px-2 py-1.5">
                <div className="min-w-0 mr-2">
                  <div className="text-[11px] text-white/60">Service account</div>
                  <div className="text-xs text-white/90 truncate" title={serviceAccountEmail}>{serviceAccountEmail}</div>
                </div>
                <button
                  onClick={handleCopyServiceAccount}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 shrink-0"
                  title="Copy service account email"
                  aria-label="Copy service account email"
                >
                  {copiedServiceAccount ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Connected spreadsheets list */}
        <div className="px-2 py-2 space-y-1 border-t border-white/10">
          {spreadsheetsLoading && (
            <div className="text-xs text-white/60 px-2">Loading spreadsheets…</div>
          )}
          {!spreadsheetsLoading && spreadsheets.length === 0 && (
            <div className="text-xs text-white/60 px-2">No spreadsheets yet. Add one above.</div>
          )}
          {spreadsheets.map((s) => {
            const active = defaultSpreadsheetId === s.spreadsheetId;
            return (
              <div key={s.id} className={`group flex items-center gap-1.5 px-2 h-9 rounded-md ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <button
                  onClick={() => setDefaultSpreadsheetId(s.spreadsheetId)}
                  className="flex-1 text-left min-w-0"
                  title={s.title || s.spreadsheetId}
                >
                  <div className={`truncate text-xs ${active ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white'}`}>
                    {s.title || s.spreadsheetId}
                  </div>
                </button>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(s.spreadsheetId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid place-items-center h-6 w-6 rounded text-white/70 hover:text-white"
                  title="Open in Google Sheets"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => removeSpreadsheetOption(s.id, s.spreadsheetId)}
                  className="grid place-items-center h-6 w-6 rounded text-red-300 hover:text-red-200"
                  title="Remove"
                  aria-label="Remove spreadsheet"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChatSidebar;
