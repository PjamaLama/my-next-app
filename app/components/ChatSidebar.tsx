"use client";

import React, { useMemo, useState } from "react";
import { useChat } from "../providers/ChatProvider";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, Pencil, Trash2, MessageSquare } from 'lucide-react';
dayjs.extend(relativeTime);

interface ChatSidebarProps {
  embedded?: boolean;
  peek?: boolean; // compact mode that still shows titles
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ embedded = false, peek = false }) => {
  const { sessions, currentSessionId, setCurrentSessionId, createSession, deleteSession, renameSession, ensureSession } = useChat();
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

  const renderSessionRow = (s: { id: string; title: string; updatedAt: string; lastMessageSnippet?: string }) => (
    <li key={s.id}>
      <div className={`group relative`}
           style={{ background: 'transparent' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect(s.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(s.id); }}
          className={`w-full text-left ${peek ? 'py-1.5 px-3' : 'py-2 px-3'} flex items-center gap-2 ${peek ? 'pr-10' : 'pr-12'} cursor-pointer select-none`}
          style={{ background: 'transparent' }}
        >
          <div className="min-w-0 flex-1">
            {renamingId === s.id ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="w-full px-2 py-1 rounded-md bg-transparent text-white text-sm focus:outline-none focus:ring-0"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className={`truncate text-sm ${currentSessionId === s.id ? 'text-white font-semibold' : 'text-white/80 group-hover:text-white'}`}>{s.title || 'Untitled'}</div>
              </div>
            )}
          </div>
          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); startRename(s.id, s.title); }}
              className="hidden sm:inline p-1 rounded-md border border-white/15 text-white/70 hover:text-white hover:border-white/40"
              title="Rename"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (confirm('Delete this chat?')) deleteSession(s.id); }}
              className="p-1 rounded-md border border-red-400/30 text-red-300 hover:text-red-200 hover:border-red-300/60"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
            <span className="text-xs text-white/60">{!peek && `(${sortedSessions.length})`}</span>
          </div>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent text-xs"
            disabled={creating}
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sortedSessions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
          ) : (
            <ul className="space-y-1">
            {sortedSessions.map((s) => renderSessionRow(s))}
            </ul>
          )}
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
          <span className="text-xs text-white/60">{!peek && `(${sortedSessions.length})`}</span>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          disabled={creating}
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sortedSessions.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/60 text-sm">No chats yet</div>
        ) : (
          <ul className="space-y-1">
            {sortedSessions.map((s) => renderSessionRow(s))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;
