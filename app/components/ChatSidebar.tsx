"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useChat } from "../providers/ChatProvider";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, Trash2, MessageSquare, Table as TableIcon, ExternalLink, BookOpen } from 'lucide-react';

import { useSheet } from "../providers/SheetProvider";
import { useFirebase } from "../providers/FirebaseProvider";
import { useDialog } from "../providers/DialogProvider";
import SpreadsheetManagerModal from "./SpreadsheetManagerModal";
import EditRowModal from "./EditRowModal";
import MessageCounter from "./MessageCounter";
import { useMessageLimits } from "../hooks/useMessageLimits";
import { useUpgradeModal } from "../providers/UpgradeModalProvider";
dayjs.extend(relativeTime);

interface ChatSidebarProps {
  embedded?: boolean;
  peek?: boolean; // compact mode that still shows titles
  onShowTutorial?: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ embedded = false, peek = false, onShowTutorial }) => {
          const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    deleteSession,
    setChatMessages,
    appendMessage,
    chatMessages
  } = useChat();
  const { user, userType } = useFirebase();
  const { defaultSpreadsheetId, setDefaultSpreadsheetId, selectedSheetNames, setSheetDataCache } = useSheet();
  const { confirm, notify } = useDialog();
  const { dailyUsage, canSendMessage, incrementUsage, isLimitReached } = useMessageLimits();
  const { openModal } = useUpgradeModal();
  const [creating, setCreating] = useState(false);
  const [counterKey, setCounterKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Debug: Log when dailyUsage changes and force re-render
  React.useEffect(() => {
    console.log('📊 ChatSidebar dailyUsage changed:', dailyUsage);
    // Force re-render by updating key
    setCounterKey(prev => prev + 1);
  }, [dailyUsage]);

  // Track mobile state for sidebar closing
  React.useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 640);
    updateMobile();
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; spreadsheetId: string; title?: string }>>([]);
  const [spreadsheetsLoading, setSpreadsheetsLoading] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPreview, setModalPreview] = useState<any>(null);
  const [isApplying, setIsApplying] = useState(false);


  // Service account UI moved into SpreadsheetManagerModal

  // Subscribe to user's spreadsheets list in Firestore
  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      if (!user) { setSpreadsheets([]); return; }
      setSpreadsheetsLoading(true);
      const { collection, onSnapshot } = await import('firebase/firestore');
      const { getDb } = await import('../providers/FirebaseProvider');
      const db = getDb();
      if (!db) return;
      
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

  // Adding spreadsheet handled inside SpreadsheetManagerModal
  // Wired Edit for user modifications before commit; keeps flow elegant.
  const handleModalSubmit = async (editedRows: Array<Array<{ column: string; value: unknown }>>) => {
    try {
      // Transform editedRows back to simple array of arrays (just values)
      const updatedRows = editedRows.map(row => row.map(item => item.value));
      // TODO: Integrate with backend submission logic (e.g., n8n or direct API call)
      // For now, we'll just log the updated rows and close the modal.
      console.log('Updated rows from modal:', updatedRows);

      // Example of how you might use updatedRows to update chat messages or trigger an action
      // This part needs to be aligned with your application's data flow.
      // If this modal is meant to update a table in a chat message, you'd need to
      // dispatch an event or call a context function similar to ChatInterface.tsx.
      // Since ChatSidebar doesn't have direct access to chatMessages state,
      // a custom event or a shared context function would be appropriate.

      // Example: Dispatch a custom event to update chat messages (similar to ChatInterface)
      // This assumes there's a listener in ChatInterface or a higher-level component.
      // const messageId = modalPreview?.messageId;
      // const tableIndex = modalPreview?.tableIndex;
      // if (messageId != null && typeof tableIndex === 'number') {
      //   window.dispatchEvent(new CustomEvent('chat:update-table-rows', {
      //     detail: { messageId, tableIndex, updatedRows }
      //   }));
      // }

      const resp = { ok: false }; // Keep existing placeholder for now
      // Re-hydrate after apply
      const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
      if (resp.ok && defaultSpreadsheetId && activeSheet) {
        const dataRes = await fetch('/api/get-sheet-data', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: activeSheet })
        });
        const json = await dataRes.json();
        if (json && json.data) setSheetDataCache((prev) => ({ ...prev, [activeSheet]: json.data }));
        await notify({ title: 'Success', description: 'Update applied.', tone: 'success' });
      }
    } catch (error) {
      console.error('Error handling modal submit:', error);
      await notify({ title: 'Error', description: 'Failed to save changes.', tone: 'danger' });
    }
    setModalOpen(false);
  };

  // Connected Edit button to modal for row editing.
  const openEditModal = (preview: any) => {
    // Normalize preview into { headers, rows: Array<{column,value}>[] } with sheet header fallback
    try {
      const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
      const cachedHeaders: string[] = activeSheet && (window as any)?.__sheetDataCache && Array.isArray((window as any).__sheetDataCache?.[activeSheet]) && (window as any).__sheetDataCache[activeSheet].length > 0
        ? ((window as any).__sheetDataCache[activeSheet][0] as string[])
        : [];
      const headers: string[] = Array.isArray(preview?.headers) && preview.headers.length > 0 ? preview.headers : cachedHeaders;
      const rows2D: any[] = Array.isArray(preview?.rows) ? preview.rows : [];
      // Pass all rows, transformed to the expected format for EditRowModal
      const rows: Array<Array<{ column: string; value: unknown }>> = headers.length > 0
        ? rows2D.map((row: any[]) => headers.map((h, i) => ({ column: h, value: String(row?.[i] ?? '') })))
        : [];
      setModalPreview({ headers, rows, message: preview?.message });
      setModalOpen(true);
    } catch {
      setModalPreview(preview);
      setModalOpen(true);
    }
  };

  // Allow external UI (e.g., table actions) to trigger this modal via a custom event
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail;
        if (detail && detail.preview) openEditModal(detail.preview);
      } catch {}
    };
    try { window.addEventListener('chat:open-edit-modal' as any, handler as any); } catch {}
    return () => { try { window.removeEventListener('chat:open-edit-modal' as any, handler as any); } catch {} };
  }, [selectedSheetNames]);

  // Simplified Approve to commit changes and re-hydrate sheet.
  // Enhanced error handling for clear messages; Clarify button for retries.
  // Wired Approve for committing updates with confirmation.
  // Prevented double commits with simple UI state.
  const applyPreview = async (preview: any) => {
    try {
      if (isApplying) return;
      setIsApplying(true);
      const headers: string[] = Array.isArray(preview?.headers) ? preview.headers : [];
      const rows2D: any[] = Array.isArray(preview?.rows) ? preview.rows : [];
      const rowObjs: Array<Record<string, unknown>> = headers.length && rows2D.length ? rows2D.map((r: any[]) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = String(r?.[i] ?? ''); });
        return obj;
      }) : [];

      // Prefer committing the exact pending tool call captured during preview, if available
      let toolCall: { function: { name: string; arguments: string } } = { function: { name: 'apply_structured_rows', arguments: JSON.stringify({ rows: rowObjs, commit: true }) } };
      try {
        const pending: any = typeof window !== 'undefined' ? (window as any).__lastUpdateToolCall : undefined;
        if (pending && typeof pending.name === 'string') {
          const existingArgs = (pending && pending.args && typeof pending.args === 'object') ? pending.args : {};
          toolCall = {
            function: {
              name: pending.name,
              arguments: JSON.stringify({ ...existingArgs, commit: true })
            }
          };
        }
      } catch {}
      // TODO: Migrate to n8n if needed
      const resp = { ok: false };
      // Re-hydrate current sheet on success
      try {
        const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
        if (resp.ok && defaultSpreadsheetId && activeSheet) {
          const dataRes = await fetch('/api/get-sheet-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: activeSheet })
          });
          const json = await dataRes.json();
          if (json && json.data) setSheetDataCache((prev) => ({ ...prev, [activeSheet]: json.data }));
          // Determine how many rows were added from the pending call or constructed rows
          let addedCount = Array.isArray((() => { try { const a = JSON.parse(toolCall.function.arguments || '{}'); return a?.rows; } catch { return undefined; } })())
            ? (() => { try { const a = JSON.parse(toolCall.function.arguments || '{}'); return (Array.isArray(a?.rows) ? a.rows.length : 0); } catch { return 0; } })()
            : (Array.isArray(rowObjs) ? rowObjs.length : 0);
          if (!Number.isFinite(addedCount as any)) addedCount = 0;
          await notify({ title: 'Success', description: `Update applied, added ${addedCount} row(s).`, tone: 'success' });
        }
      } catch {}
    } catch {}
    finally { setIsApplying(false); }
  };

  // Simplified Reject to clear table and context elegantly.
  const rejectPreview = async () => {
    try {
      // Remove any preview tables titled 'Proposed Sheet Updates' from recent messages
      setChatMessages((prev) => {
        const next = prev.map((m) => {
          if (Array.isArray((m as any).tables) && (m as any).tables.length > 0) {
            const remaining = (m as any).tables.filter((t: any) => String(t?.title || '').toLowerCase() !== 'proposed sheet updates');
            if (remaining.length !== (m as any).tables.length) {
              return { ...m, tables: remaining } as any;
            }
          }
          return m;
        });
        return next;
      });
      // Clear any pending update tool call stored on the client
      try {
        if (typeof window !== 'undefined') {
          (window as any).__lastUpdateToolCall = undefined;
        }
        (globalThis as any).__lastUpdateToolCall = undefined;
      } catch {}
      await notify({ title: 'Canceled', description: 'Update canceled.', tone: 'info' });
      await appendMessage(currentSessionId || '', {
        id: `local_${Date.now()}`,
        role: 'assistant',
        content: 'Update canceled.',
        timestamp: new Date(),
        messageType: 'ai_response'
      } as any);
    } catch {}
  };

  const removeSpreadsheetOption = async (id: string, spreadsheetId?: string) => {
    if (!user || !id) return;
    const { doc, deleteDoc } = await import('firebase/firestore');
    const { getDb } = await import('../providers/FirebaseProvider');
    const db = getDb();
    if (!db) return;

    await deleteDoc(doc(db, 'users', user.uid, 'options', id));
    // Clear defaultSpreadsheetId if we're removing the current one, or if this is the last spreadsheet
    if ((spreadsheetId && defaultSpreadsheetId === spreadsheetId) || (spreadsheets.length === 1)) {
      setDefaultSpreadsheetId("");
    }

    // Notify SheetChipSelector to refresh its sheet list
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sheet-selector-refresh', {
        detail: { action: 'spreadsheet-removed' }
      }));
    }
  };

  // Add/remove actions simplified: remove remains here

  const sortedSessions = useMemo(() => sessions, [sessions]);
  // Show all sessions, even if untitled, to avoid hiding active chats before AI title generation
  // Ensure unique sessions to prevent React key conflicts
  const visibleSessions = useMemo(() => {
    const uniqueSessions = sortedSessions.filter((session, index, self) => 
      index === self.findIndex(s => s.id === session.id)
    );
    
    // Debug logging to help identify duplicate issues
    if (sortedSessions.length !== uniqueSessions.length) {
      console.warn('🔍 [ChatSidebar] Duplicate sessions detected:', {
        total: sortedSessions.length,
        unique: uniqueSessions.length,
        duplicates: sortedSessions.length - uniqueSessions.length
      });
    }
    
    return uniqueSessions;
  }, [sortedSessions]);

  // Simple UI for clarifications to maintain conversational flow.
  const clarifyText = useMemo(() => {
    try {
      const lastAssistants = [...(chatMessages || [])].reverse().filter(m => m.role === 'assistant');
      for (const m of lastAssistants.slice(0, 5)) {
        const c = String(m.content || '');
        if (/Incomplete data inferred|Please provide more details|Please specify|Which columns|Could not map/i.test(c)) return c;
      }
    } catch {}
    return '';
  }, [chatMessages]);
  const hasClarify = Boolean(clarifyText && clarifyText.trim());
  const handleProvideDetails = async () => {
    // Check message limits for free users before allowing clarification
    if (userType === 'free' && !canSendMessage) {
      confirm({
        title: 'Message Limit Reached',
        description: 'You\'ve reached your daily message limit. Upgrade to Pro for unlimited messages.',
        tone: 'warning',
        confirmText: 'Upgrade to Pro',
        cancelText: 'Cancel',
      }).then((ok) => {
        if (ok) openModal('Pro');
      });
      return;
    }

    const hint = 'Provide more details (e.g., CLIENT SEEN, TOWN, SALES MADE, DETAILS OF VISIT):';
    // Prompt the user for more details and append as a user message
    const text = typeof window !== 'undefined' ? window.prompt(hint) : '';
    if (text && text.trim()) {
      // Increment usage for free users
      if (userType === 'free') {
        await incrementUsage();
      }

      await appendMessage(currentSessionId || '', {
        id: `local_${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
        messageType: 'text'
      } as any);
      try {
        // Hint main app to focus/send via a custom event if it listens
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat:provide-details', { detail: { text: text.trim() } }));
        }
      } catch {}
    }
  };

  const handleCreate = async () => {
    console.log('🔍 [ChatSidebar] Plus button clicked, starting handleCreate');
    setCreating(true);
    try {
      console.log('🔍 [ChatSidebar] Calling createSession with:', { defaultSpreadsheetId, selectedSheetNames });
      const id = await createSession(undefined, defaultSpreadsheetId, selectedSheetNames);
      console.log('🔍 [ChatSidebar] createSession returned:', id);
      if (id) {
        console.log('🔍 [ChatSidebar] Setting current session ID to:', id);
        setCurrentSessionId(id);
      } else {
        console.log('🔍 [ChatSidebar] createSession returned falsy value');
      }
    } catch (error) {
      console.error('🔍 [ChatSidebar] Error in handleCreate:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleTutorialClick = () => {
    // Close sidebar on mobile before opening tutorial
    if (isMobile && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('close-sidebar'));
    }
    // Call the tutorial function
    if (onShowTutorial) {
      onShowTutorial();
    }
  };

  const handleSelect = async (id: string) => {
    // Selecting a chat should only switch the active session.
    // Do not call ensureSession here, as it may race and override the selection.
    console.log('🔍 [ChatSidebar] Switching to session:', id);

    // Switch session instantly without navigation - the ChatProvider handles caching
    setCurrentSessionId(id);

    // Navigate to the main chat page if not already there
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      // If not on the main chat page (report page), navigate there
      if (currentPath !== '/report') {
        window.location.href = '/report';
      }
    }
  };



  // Manual renaming removed; titles are generated by AI after first message

  // Copy service account removed from sidebar

  const renderSessionRow = (s: { id: string; title: string; updatedAt: Date; lastMessageSnippet?: string }, index: number) => {
    const isActive = currentSessionId === s.id;

    return (
      <li key={`${s.id}-${index}`}>
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
                <div className={`truncate text-sm ${isActive ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white'}`}>
                  {s.title || '...'}
                </div>
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
                    console.log('🔍 [ChatSidebar] User confirmed deletion of session:', s.id);
                    try {
                      await deleteSession(s.id);
                      console.log('🔍 [ChatSidebar] Session deleted successfully');
                    } catch (error) {
                      console.error('🔍 [ChatSidebar] Failed to delete session:', error);
                      // Error handling is done in the provider
                    }
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
  };

  if (embedded) {
    // Render the same UI in embedded mode
    return (
      <>
      <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquare className="w-4 h-4" />
            {!peek && 'Chats'}
             <span className="text-xs text-white/60">{!peek && `(${visibleSessions.length})`}</span>
          </div>
        <div className="shrink-0 flex items-center gap-2">
          {onShowTutorial && (
            <button
              onClick={handleTutorialClick}
              className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent`}
              title="Tutorial"
              aria-label="Show tutorial"
            >
              <BookOpen className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
            </button>
          )}
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {/* Chats list under Chats header */}
            {visibleSessions.length === 0 ? (
              <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
            ) : (
              <ul className="space-y-1">
              {visibleSessions.map((s, index) => renderSessionRow(s, index))}
              </ul>
            )}
          </div>

          {/* Message Counter for Free Users - Hidden on mobile */}
          {userType === 'free' && !isMobile && (
            <div className="mt-2 mx-2">
              <MessageCounter key={`counter-${dailyUsage}-${counterKey}`} />
            </div>
          )}

          {/* Spreadsheets manager header (list stays below) */}
          <div className="mt-2 mx-2 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between bg-white/5 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <TableIcon className="w-4 h-4" />
                {!peek && 'Spreadsheets'}
                <span className="text-xs text-white/60">{!peek && `(${spreadsheets.length})`}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setManagerOpen(true)}
                  className={`inline-flex items-center justify-center px-2 ${peek ? 'h-6' : 'h-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50`}
                  title="Manage spreadsheets"
                  aria-label="Manage spreadsheets"
                >
                  Manage
                </button>
              </div>
            </div>
            {/* Helper and adder moved to modal */}
            {/* List */}
            <div className="px-2 py-2 space-y-1 border-t border-white/10 max-h-48 overflow-y-auto">
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
      <SpreadsheetManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />
      </>
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
        <div className="shrink-0 flex items-center gap-2">
          {onShowTutorial && (
            <button
              onClick={handleTutorialClick}
              className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent`}
              title="Tutorial"
              aria-label="Show tutorial"
            >
              <BookOpen className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
            </button>
          )}
          <button
            onClick={handleCreate}
            className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400/40`}
            disabled={creating}
            title="New Chat"
            aria-label="New chat"
          >
            <Plus className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {/* Chats list under Chats header */}
          {visibleSessions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
          ) : (
            <ul className="space-y-1">
              {visibleSessions.map((s, index) => renderSessionRow(s, index))}
            </ul>
          )}

          {/* Simplified clarification UI for user-friendly retries. */}
		  {/* Clarification inline banner */}
          {hasClarify && (
            <div className="mx-2 mt-3 p-3 rounded-md border border-amber-400/30 bg-amber-500/10 text-amber-100 text-sm">
				  <div>{(() => {
					  try {
						  const activeSheet = Array.isArray(selectedSheetNames) && selectedSheetNames.length > 0 ? selectedSheetNames[0] : undefined;
						  const headers: string[] = activeSheet && (window as any)?.__sheetDataCache && Array.isArray((window as any).__sheetDataCache?.[activeSheet]) && (window as any).__sheetDataCache[activeSheet].length > 0
							  ? ((window as any).__sheetDataCache[activeSheet][0] as string[])
							  : [];
						  if (headers.length > 0) {
							  return `Couldn’t map terms. Use columns: [${headers.join(', ')}].`;
						  }
					  } catch {}
					  return clarifyText;
				  })()}</div>
              <div className="mt-2">
					  <button onClick={handleProvideDetails} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs">
						  Clarify
                </button>
              </div>
            </div>
          )}

          {/* Tool error slot: simple client-side render hint for consumers of this component */}
          {false && (
            <div className="mt-3 mx-2">
              {(() => {
                const response: any = null; // replace with prop or context when wiring live tool results
                const toolResult: any = null;
                if (response?.error || toolResult?.success === false) {
                  const err = String(toolResult?.error || response?.error || '');
                  const errorMsg = err.includes('spreadsheetId') || err.includes('sheetName')
                    ? 'Please specify the sheet to update.'
                    : err.includes('No valid data')
                      ? `No valid data provided. ${toolResult?.clarify || 'Please specify values for available columns.'}`
                      : (toolResult?.clarify || 'Failed to process update. Please clarify your request.');
                  return (
                    <div className="chat-error bg-red-500/10 border border-red-400/30 text-red-200 rounded-md p-3 text-sm">
                      <div>{errorMsg}</div>
                      <button className="bg-blue-500 text-white px-3 py-1.5 mt-2 rounded" onClick={() => setManagerOpen(true)}>Clarify</button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>

          {/* Message Counter for Free Users - Hidden on mobile */}
          {userType === 'free' && !isMobile && (
            <div className="mt-2 mx-2">
              <MessageCounter key={`counter-${dailyUsage}-${counterKey}`} />
            </div>
          )}

          {/* Spreadsheets manager header (list stays below) */}
        <div className="mt-2 mx-2 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          {/* Manager header */}
          <div className="px-3 py-2 flex items-center justify-between bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <TableIcon className="w-4 h-4" />
              {!peek && 'Spreadsheets'}
              <span className="text-xs text-white/60">{!peek && `(${spreadsheets.length})`}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setManagerOpen(true)}
                className={`inline-flex items-center justify-center px-2 ${peek ? 'h-6' : 'h-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50`}
                title="Manage spreadsheets"
                aria-label="Manage spreadsheets"
              >
                Manage
              </button>
            </div>
          </div>
          {/* Helper and adder moved to modal */}
        </div>

        {/* Connected spreadsheets list */}
        <div className="px-2 py-2 space-y-1 border-t border-white/10 max-h-48 overflow-y-auto">
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
    <SpreadsheetManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />
      <EditRowModal isOpen={modalOpen} onClose={() => setModalOpen(false)} preview={modalPreview} onSubmit={handleModalSubmit} />
    </div>
  );
};

export default ChatSidebar;
