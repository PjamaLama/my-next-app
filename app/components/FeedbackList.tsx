"use client";

import React, { useMemo } from 'react';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  createdBy?: {
    uid?: string;
    displayName?: string;
    email?: string;
  };
  createdAt?: Date | { toDate: () => Date } | string | null;
}

interface SimpleFeedbackListProps {
  items: FeedbackItem[];
  className?: string;
}

// Helper function to format dates
const formatDate = (date: any): string => {
  if (!date) return '';

  let dateObj: Date;
  if (date.toDate) {
    // Firestore timestamp
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return dateObj.toLocaleDateString();
  }
};

export default function FeedbackList({
  items,
  className = ""
}: SimpleFeedbackListProps) {
  // Sort items by creation date (newest first)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        const aDate = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const bDate = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      }
      return 0;
    });
  }, [items]);


  if (sortedItems.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-xl font-semibold text-white mb-2">No feedback yet!</h3>
        <p className="text-white/60">
          Be the first to share your thoughts and ideas.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* List header */}
      <div className="text-center text-sm text-white/60 mb-4">
        {sortedItems.length} feedback item{sortedItems.length !== 1 ? 's' : ''} • Sorted by date
      </div>

      {/* Feedback items list */}
      <div className="space-y-3">
        {sortedItems.map((item, index) => (
          <div
            key={item.id}
            className="backdrop-blur-sm border rounded-xl p-4 shadow-lg bg-zinc-900/80 border-white/10 hover:bg-zinc-900/90 transition-colors"
          >
            {/* Header with badges */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">
                  💬
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">
                  Feedback #{index + 1}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                  Open
                </span>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold text-white leading-tight mb-2">
              {item.title}
            </h3>

            {/* Description */}
            <p className="text-white/70 text-sm mb-3 line-clamp-3">
              {item.description || 'No description provided'}
            </p>

            {/* Footer with metadata */}
            <div className="flex items-center justify-between">
              {/* Metadata */}
              <div className="flex flex-col gap-1 text-xs text-white/50">
                <span>
                  {item.createdBy?.displayName
                    ? `By ${item.createdBy.displayName}`
                    : 'Anonymous user'}
                </span>
                <span>
                  {item.createdAt
                    ? formatDate(item.createdAt)
                    : 'Recently'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
