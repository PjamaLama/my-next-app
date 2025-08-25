"use client";

import React, { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../providers/ChatProvider';
import { Volume2, ChevronDown, ChevronUp, Move } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  selectedSheetNames: string[];
  processingTables: Set<string>;
  onEdit: (data: any) => void;
  onReadAloud: (text: string, messageId: string) => void;
  speakingMessageId: string | null;
  formatTimestamp: (date: Date) => string;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  selectedSheetNames,
  processingTables,
  onEdit,
  onReadAloud,
  speakingMessageId,
  formatTimestamp,
}) => {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [draggedCell, setDraggedCell] = useState<{tableId: string, rowIndex: number, colIndex: number, value: string} | null>(null);

  const toggleTableExpansion = (tableId: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableId)) {
      newExpanded.delete(tableId);
    } else {
      newExpanded.add(tableId);
    }
    setExpandedTables(newExpanded);
  };

  const handleDragStart = (e: React.DragEvent, tableId: string, rowIndex: number, colIndex: number, value: string) => {
    setDraggedCell({ tableId, rowIndex, colIndex, value });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTableId: string, targetRowIndex: number, targetColIndex: number) => {
    e.preventDefault();
    
    if (!draggedCell || draggedCell.tableId !== targetTableId || draggedCell.rowIndex !== targetRowIndex) {
      return; // Only allow dropping within the same row
    }

    // Find the table and update the data
    const tableIndex = parseInt(targetTableId.split('-')[1]);
    const table = message.tables?.[tableIndex];
    
    if (table && Array.isArray(table.rows)) {
      const newRows = [...table.rows];
      const row = [...newRows[targetRowIndex]];
      
      // Swap the values
      const draggedValue = row[draggedCell.colIndex];
      row[draggedCell.colIndex] = row[targetColIndex];
      row[targetColIndex] = draggedValue;
      
      newRows[targetRowIndex] = row;
      
      // Update the table data locally without triggering edit modal
      const updatedTable = { ...table, rows: newRows };
      const updatedTables = [...(message.tables || [])];
      updatedTables[tableIndex] = updatedTable;
      
      // Update the message tables directly
      message.tables = updatedTables;
    }
    
    setDraggedCell(null);
  };

  const handleDragEnd = () => {
    setDraggedCell(null);
  };

  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${message.status === 'pending' ? 'opacity-50' : ''} transition-opacity`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          message.role === 'user'
            ? 'bg-emerald-600 text-white'
            : 'bg-white/10 text-white border border-white/20'
        }`}
      >
        <div className="text-sm">
          {(!message.tables || message.tables.length === 0) && message.content}
        </div>
        {message.insights && message.insights.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-emerald-300 mb-2">Insights:</div>
            <ul className="text-xs space-y-1">
              {message.insights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {message.tables && message.tables.length > 0 && (
          <div className="mt-3 space-y-4">
            {message.tables.map((table, index) => {
              const tableId = `${message.id}-${index}`;
              const isExpanded = expandedTables.has(tableId);
              const rows = Array.isArray(table.rows) ? table.rows : (table.rows ? [table.rows] : []);
              const hasMoreRows = rows.length > 10;
              const displayRows = isExpanded ? rows : rows.slice(0, 10);
              
              return (
                <div key={index} className="bg-white/10 rounded p-3">
                  {table.title && (
                    <div className="font-semibold mb-2 text-emerald-300">
                      {table.title}
                    </div>
                  )}
                  {table.summary && (
                    <div className="text-sm text-white/80 mb-3">
                      {table.summary}
                    </div>
                  )}
                  {(() => {
                    if (rows.length > 0) {
                      return (
                        <>
                          <div className="overflow-x-auto mb-3">
                            <div className="flex items-center gap-2 mb-2 text-xs text-emerald-300">
                              <Move className="w-4 h-4" />
                              <span>Drag cells to reorder values within rows</span>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/20">
                                  {Array.isArray(table.headers) && (table.headers as string[]).map((header: string, i: number) => (
                                    <th key={i} className="text-left p-2 font-medium text-white/80">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {displayRows.map((row: any[], rowIndex: number) => (
                                  <tr key={rowIndex} className="border-b border-white/10">
                                    {row.map((cell: any, cellIndex: number) => (
                                      <td 
                                        key={cellIndex} 
                                        className="p-2 text-white/90 cursor-move hover:bg-white/10 transition-colors"
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, tableId, rowIndex, cellIndex, String(cell || ''))}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, tableId, rowIndex, cellIndex)}
                                        onDragEnd={handleDragEnd}
                                        title="Drag to move this value to another column"
                                      >
                                        {String(cell || '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {hasMoreRows && (
                              <div className="flex items-center justify-center mt-3">
                                <button
                                  onClick={() => toggleTableExpansion(tableId)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-white/20 hover:bg-white/30 text-white rounded transition-colors"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-4 h-4" />
                                      Collapse
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-4 h-4" />
                                      Show All ({rows.length} rows)
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                            <div className="text-xs text-white/60 mr-auto">
                              📊 Target: <span className="text-emerald-300 font-medium">
                                {table.meta?.sheetName || selectedSheetNames?.[0] || 'No sheet selected'}
                              </span>
                              {!table.meta?.sheetName && !selectedSheetNames?.[0] && (
                                <span className="text-yellow-400 ml-2">⚠️ Select a sheet first</span>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                if (table.headers && rows) {
                                  const headers = Array.isArray(table.headers) ? table.headers : [];
                                  const normalizedRows = (rows as any[][]).map((row: any[]) =>
                                    headers.map((h, i) => ({ column: h, value: String(row?.[i] ?? '') }))
                                  );
                                  onEdit({
                                    headers,
                                    rows: normalizedRows,
                                    message: table.summary || `Edit data for ${table.title}`,
                                    messageId: message.id,
                                    tableIndex: index,
                                    title: table.title,
                                  });
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                const event = new CustomEvent('chat:approve-update', {
                                  detail: {
                                    preview: {
                                      headers: table.headers,
                                      rows: rows,
                                      message: table.summary || `Approve update for ${table.title}`,
                                      messageId: message.id,
                                      tableIndex: index,
                                      title: table.title,
                                      sheetName: table.meta?.sheetName || undefined,
                                    }
                                  }
                                });
                                window.dispatchEvent(event);
                              }}
                              disabled={processingTables.has('approve') || (!table.meta?.sheetName && !selectedSheetNames?.[0])}
                              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                              title={(!table.meta?.sheetName && !selectedSheetNames?.[0]) ? 'Select a sheet first to approve this table' : 'Approve and submit this data to the sheet'}
                            >
                              {processingTables.has('approve') ? 'Applying...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => {
                                const event = new CustomEvent('chat:reject-update', {
                                  detail: {
                                    preview: {
                                      headers: table.headers,
                                      rows: rows,
                                      message: table.summary || `Reject update for ${table.title}`,
                                      messageId: message.id,
                                      tableIndex: index,
                                      title: table.title,
                                      sheetName: table.meta?.sheetName || undefined,
                                    }
                                  }
                                });
                                window.dispatchEvent(event);
                              }}
                              disabled={processingTables.has('reject')}
                              className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                            >
                              {processingTables.has('reject') ? 'Removing...' : 'Reject'}
                            </button>
                          </div>
                        </>
                      );
                    } else {
                      return (
                        <div className="space-y-2 text-xs">
                          {Array.isArray(table.headers) && table.headers.length > 0 && (
                            <div>
                              <div className="font-medium text-emerald-300 mb-1">Headers:</div>
                              <div className="flex flex-wrap gap-1">
                                {(table.headers as string[]).map((header: string, i: number) => (
                                  <span key={i} className="px-2 py-1 bg-white/10 rounded text-white/80">
                                    {header}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {table.rowCount > 0 && (
                            <div className="text-white/70">
                              <span className="font-medium">Rows:</span> {table.rowCount}
                            </div>
                          )}
                          {table.summary && (
                            <div className="text-white/80">
                              <span className="font-medium">Summary:</span> {table.summary}
                            </div>
                          )}
                        </div>
                      );
                    }
                  })()}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between text-xs opacity-70 mt-2">
          <span>{formatTimestamp(message.timestamp)}</span>
          {message.status === 'error' && <span className="text-red-400 font-bold ml-2">Failed to send</span>}
          {message.role === 'assistant' && (
            <button onClick={() => onReadAloud(message.content, message.id)} className="ml-2">
              <Volume2 className={`w-4 h-4 ${speakingMessageId === message.id ? 'text-emerald-400' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);