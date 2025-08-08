"use client";

import React, { useState } from 'react';
import dayjs from 'dayjs';

interface ActivityItem {
  type: 'add' | 'edit' | 'delete';
  entity: 'sheet' | 'webhook';
  label: string;
  timestamp: number;
  oldValue?: string; // For edit activity
  newValue?: string; // For edit activity
  webhookType?: 'initial' | 'final' | 'backup' | 'other'; // For webhook edit activity
  sheetName?: string; // For webhook add activity
  rowNumber?: string; // For webhook add activity
  rowData?: { column: string; cell: string; value: string }[]; // For webhook add activity
  sheetsAffected?: string[]; // For multi-sheet operations
  rowsAffected?: number; // For multi-row operations
}

interface RecentActivityProps {
  activity: ActivityItem[];
  activityError: string | null;
}

export default function RecentActivity({ activity, activityError }: RecentActivityProps) {
  const [activitySectionExpanded, setActivitySectionExpanded] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);

  return (
    <section className="bg-white/80 dark:bg-[#18181b] rounded-xl shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-800 mt-8 sm:mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <svg width="20" height="20" className="sm:w-6 sm:h-6" fill="none" stroke="#6366f1" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
          Recent Activity
        </h2>
        <svg 
          width="16" 
          height="16" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          viewBox="0 0 24 24"
          className={`transition-transform duration-200 ${activitySectionExpanded ? 'rotate-180' : ''} text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer`}
          onClick={() => setActivitySectionExpanded(!activitySectionExpanded)}
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {activitySectionExpanded && (
        <>
          {activityError && (
            <div className="text-xs text-red-600 mb-2">{activityError}</div>
          )}
          {activity.length === 0 ? (
            <div className="text-gray-400 text-xs">No recent edits yet.</div>
          ) : (
            <ul className="space-y-2 w-full">
                {activity.slice(0, 5).map((item, i) => {
                  const expanded = expandedActivity === i;
                  return (
                    <li key={`activity-item-${item.timestamp}-${i}`} className="flex flex-col gap-1 text-xs w-full p-2 sm:p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                      <div className="flex items-start gap-2 sm:gap-3 cursor-pointer" onClick={() => setExpandedActivity(expanded ? null : i)}>
                  <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-100 dark:bg-gray-800 mt-0.5 flex-shrink-0">
                    {item.type === 'add' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>}
                    {item.type === 'edit' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#f59e42" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>}
                    {item.type === 'delete' && <svg width="12" height="12" className="sm:w-4 sm:h-4" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M9 6v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6m-6 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>}
                  </span>
                      <span className="truncate flex-1 text-xs sm:text-sm">
                  {item.entity === 'sheet' ? (
                    <>
                      <span className="font-medium text-gray-700 dark:text-gray-200">Sheet</span> <span className="capitalize">{item.type}</span> <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
                      {item.type === 'edit' && item.oldValue && item.newValue && (
                        <span className="ml-1 text-gray-500">(from <span className="italic">{item.oldValue}</span> to <span className="italic">{item.newValue}</span>)</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-purple-700 dark:text-purple-300">Webhook</span> <span className="capitalize">{item.type}</span> <span className="font-semibold text-gray-900 dark:text-white">{item.label}</span>
                      {item.webhookType && (
                        <span className="ml-1 text-gray-500">({item.webhookType})</span>
                      )}
                      {item.type === 'edit' && item.oldValue && item.newValue && (
                        <span className="ml-1 text-gray-500">(from <span className="italic">{item.oldValue}</span> to <span className="italic">{item.newValue}</span>)</span>
                      )}
                    </>
                  )}
                  <span className="ml-2 text-gray-400">&middot; {dayjs(item.timestamp).fromNow()}</span>
                </span>
                      <svg 
                        width="16" 
                        height="16" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        viewBox="0 0 24 24"
                        className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''} text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer flex-shrink-0`}
                        onClick={e => { e.stopPropagation(); setExpandedActivity(expanded ? null : i); }}
                      >
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                    {expanded && (
                      <div className="mt-2 ml-7 sm:ml-9">
                        {/* Show sheet and row info for webhook add */}
                        {item.type === 'add' && item.entity === 'webhook' && (
                          <div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {item.sheetName && <span>Sheet: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{item.sheetName}</span></span>}
                            {item.rowNumber && <span className="ml-2">Row: <span className="font-semibold text-green-700 dark:text-green-300">{item.rowNumber}</span></span>}
                          </div>
                        )}
                        {/* Show row data for webhook add */}
                        {item.type === 'add' && item.entity === 'webhook' && item.rowData && item.rowData.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="min-w-[200px] border border-gray-200 dark:border-gray-700 rounded text-xs">
                              <thead>
                                <tr>
                                  <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Column</th>
                                  <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Cell</th>
                                  <th className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-left">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.rowData.map((cell, idx) => (
                                  <tr key={`cell-${idx}-${cell.column}-${cell.cell}`}>
                                    <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.column}</td>
                                    <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.cell}</td>
                                    <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{cell.value}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
        </>
      )}
    </section>
  );
} 