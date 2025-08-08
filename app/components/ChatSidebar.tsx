"use client";

import React, { useMemo, useState } from "react";
import { useChat } from "../providers/ChatProvider";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Plus, Pencil, Trash2, MessageSquare } from 'lucide-react';
dayjs.extend(relativeTime);

interface ChatSidebarProps {
  embedded?: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ embedded = false }) => {
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
      <div
        className={`group relative rounded-md transition-colors ${
          currentSessionId === s.id ? 'bg-white/10' : 'hover:bg-white/5'
        }`}
      >
        <button
          onClick={() => handleSelect(s.id)}
          className="w-full text-left p-3 flex items-start gap-3 pr-16"
        >
          <div
            className={`shrink-0 mt-0.5 rounded-md p-1.5 ${
              currentSessionId === s.id ? 'bg-white/15 text-white' : 'bg-white/10 text-white/80'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 text-white">
            {renamingId === s.id ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="w-full px-2 py-1 rounded-md bg-gray-800 text-white border border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="truncate font-medium text-sm">{s.title || 'Untitled'}</div>
              </div>
            )}
            <div className="text-xs text-white/60 truncate mt-0.5">{s.lastMessageSnippet || ' '}</div>
          </div>
          <div className="ml-2 text-[10px] text-white/50 whitespace-nowrap mt-0.5">{dayjs(s.updatedAt).fromNow()}</div>
        </button>
        <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-1">
          <button
            onClick={() => startRename(s.id, s.title)}
            className="p-1.5 rounded-md hover:bg-white/10 text-white"
            title="Rename"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this chat?')) deleteSession(s.id);
            }}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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
            Chats
            <span className="text-xs text-white/60">({sortedSessions.length})</span>
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
  }

  // Non-embedded: render the same persistent sidebar (no open/close button)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <MessageSquare className="w-4 h-4" />
          Chats
          <span className="text-xs text-white/60">({sortedSessions.length})</span>
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
