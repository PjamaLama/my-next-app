"use client";

import React, { useMemo, useState } from "react";
import { useChat } from "../providers/ChatProvider";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, X, Pencil, Trash2, MessageSquare } from 'lucide-react';
dayjs.extend(relativeTime);

interface ChatSidebarProps {
  embedded?: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ embedded = false }) => {
  const { sessions, currentSessionId, setCurrentSessionId, createSession, deleteSession, renameSession, ensureSession } = useChat();
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const sortedSessions = useMemo(() => sessions, [sessions]);

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
    if (!embedded) setOpen(false);
  };

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const title = renameValue.trim() || 'Untitled';
    await renameSession(renamingId, title);
    setRenamingId(null);
  };

  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-2 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="w-4 h-4" />
            Chats
            <span className="text-xs text-gray-500">({sortedSessions.length})</span>
          </div>
          <button
            onClick={handleCreate}
            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs"
            disabled={creating}
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sortedSessions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">No chats yet</div>
          ) : (
            <ul className="space-y-1">
              {sortedSessions.map((s) => (
                <li key={s.id} className={`group rounded-lg border ${currentSessionId === s.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/10' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <div className="flex items-start gap-2 p-3">
                    <button onClick={() => handleSelect(s.id)} className="flex-1 text-left min-w-0">
                      {renamingId === s.id ? (
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-sm"
                          autoFocus
                        />
                      ) : (
                        <div className="truncate font-medium text-sm">{s.title || 'Untitled'}</div>
                      )}
                      <div className="text-xs text-gray-500 truncate mt-0.5">{s.lastMessageSnippet || ' '}</div>
                      <div className="text-[10px] text-gray-400 mt-1">Updated {dayjs(s.updatedAt).fromNow()}</div>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startRename(s.id, s.title)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Rename">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => { if (confirm('Delete this chat?')) deleteSession(s.id); }} className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Default drawer mode (used previously)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-3 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 border border-white/20 min-h-[44px]"
        aria-label="Open chat history"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">Chats</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[70] w-full max-w-[90vw] sm:max-w-sm md:max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">Chat History</span>
                <span className="text-xs text-gray-500">{sortedSessions.length} chats</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  disabled={creating}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sortedSessions.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">No chats yet</div>
              ) : (
                <ul className="space-y-1">
                  {sortedSessions.map((s) => (
                    <li key={s.id} className={`group rounded-lg border ${currentSessionId === s.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/10' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <div className="flex items-start gap-2 p-3">
                        <button onClick={() => handleSelect(s.id)} className="flex-1 text-left min-w-0">
                          {renamingId === s.id ? (
                            <input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-sm"
                              autoFocus
                            />
                          ) : (
                            <div className="truncate font-medium text-sm">{s.title || 'Untitled'}</div>
                          )}
                          <div className="text-xs text-gray-500 truncate mt-0.5">{s.lastMessageSnippet || ' '}</div>
                          <div className="text-[10px] text-gray-400 mt-1">Updated {dayjs(s.updatedAt).fromNow()}</div>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startRename(s.id, s.title)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Rename">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => { if (confirm('Delete this chat?')) deleteSession(s.id); }} className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSidebar;
