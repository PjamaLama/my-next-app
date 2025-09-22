"use client";

import React, { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../providers/ChatProvider';
import { useChat } from '../providers/ChatProvider';
import { Volume2, ChevronDown, ChevronUp, Move, Trash2, Target } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  selectedSheetNames: string[];
  processingTables: Set<string>;
  onEdit: (data: any) => void;
  onReadAloud: (text: string, messageId: string) => void;
  speakingMessageId: string | null;
  formatTimestamp: (date: Date) => string;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  selectedSheetNames,
  processingTables,
  onEdit,
  onReadAloud,
  speakingMessageId,
  formatTimestamp,
}) => {
  const { updateMessageTables } = useChat();
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

  const handleDrop = async (e: React.DragEvent, targetTableId: string, targetRowIndex: number, targetColIndex: number) => {
    e.preventDefault();
    
    if (!draggedCell || draggedCell.tableId !== targetTableId || draggedCell.rowIndex !== targetRowIndex) {
      return; // Only allow dropping within the same row
    }

    // Find the table and update the data
    const tableIndex = parseInt(targetTableId.split('-')[1]);
    const table = message.tables?.[tableIndex];
    
    if (table) {
      // Parse rows if it's a string, otherwise use as array
      const rows = Array.isArray(table.rows) ? table.rows : 
                  (typeof table.rows === 'string' ? JSON.parse(table.rows) : []);
      
      if (Array.isArray(rows)) {
        const newRows = [...rows];
        const row = [...newRows[targetRowIndex]];
        
        // Swap the values
        const draggedValue = row[draggedCell.colIndex];
        row[draggedCell.colIndex] = row[targetColIndex];
        row[targetColIndex] = draggedValue;
        
        newRows[targetRowIndex] = row;
        
        // Create updated tables array
        const updatedTables = [...(message.tables || [])] as any;
        updatedTables[tableIndex] = {
          ...table,
          rows: newRows
        };
        
        // Update through the provider
        await updateMessageTables(message.id, updatedTables as any);
      }
    }
    
    setDraggedCell(null);
  };

  const handleDragEnd = () => {
    setDraggedCell(null);
  };

  const handleDeleteRow = async (tableIndex: number, rowIndex: number) => {
    const table = message.tables?.[tableIndex];
    if (!table) return;

    // Parse rows if it's a string, otherwise use as array
    const rows = Array.isArray(table.rows) ? table.rows : 
                (typeof table.rows === 'string' ? JSON.parse(table.rows) : []);
    
    if (Array.isArray(rows)) {
      const newRows = [...rows];
      newRows.splice(rowIndex, 1);
      
              // Create updated tables array
        const updatedTables = [...(message.tables || [])] as any;
        updatedTables[tableIndex] = {
          ...table,
          rows: newRows,
          rowCount: newRows.length
        };
      
      // Update through the provider
      await updateMessageTables(message.id, updatedTables as any);
    }
  };

  // Helper function to detect if a table represents cell updates vs traditional data
  // Only show as cell updates when we're VERY sure it's not regular tabular data
  const isCellUpdateTable = (table: any, rows: any[]) => {
    // Be very restrictive - only show cell updates if we have STRONG evidence

    // Check meta information for explicit cell update indicators (most reliable)
    const meta = table.meta || {};
    const isExplicitCellOperation = meta.targetStrategy === 'cell_update' ||
                                   meta.targetStrategy === 'find_and_update';

    // Only if meta explicitly says it's cell updates AND we have exactly 2-3 columns (cell + value + optional description)
    const headers = table.headers || [];
    const hasMinimalColumns = headers.length >= 2 && headers.length <= 3;

    // AND the first column header suggests it's a cell reference
    const firstHeader = headers[0]?.toLowerCase() || '';
    const hasCellHeader = firstHeader.includes('cell') || firstHeader.includes('location') || firstHeader.includes('coordinate');

    // AND most rows in first column look like cell references (A1, B5, AA10 format)
    const cellReferenceRatio = rows.length > 0 ?
      rows.filter(row =>
        row[0] && typeof row[0] === 'string' && /^[A-Z]+\d+$/.test(row[0].trim())
      ).length / rows.length : 0;

    // Require strong evidence: explicit meta + cell headers + high ratio of cell references
    return isExplicitCellOperation && hasCellHeader && cellReferenceRatio > 0.8;
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
          {/* Display attached files (WhatsApp-style grouping) */}
          {message.files && message.files.length > 0 && (
            <div className="mb-3 space-y-2">
              {message.files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-2 bg-white/10 rounded-lg border border-white/20">
                  {file.mimeType.startsWith('image/') ? (
                    <div className="relative">
                      {file.fileData ? (
                        <img
                          src={`data:${file.mimeType};base64,${file.fileData}`}
                          alt={file.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                        file.status === 'completed' ? 'bg-emerald-500' :
                        file.status === 'processing' ? 'bg-amber-500' :
                        file.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                      }`}></div>
                    </div>
                  ) : (
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">{file.name}</div>
                    <div className="text-xs text-white/60">
                      {file.status === 'processing' && 'Processing...'}
                      {file.status === 'completed' && `${(file.size / 1024).toFixed(1)} KB`}
                      {file.status === 'error' && `Error: ${file.error || 'Failed to process'}`}
                      {file.status === 'uploading' && 'Uploading...'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Display message content if it exists */}
          {message.content && (!message.tables || message.tables.length === 0) && (
            <div className={message.files && message.files.length > 0 ? 'mt-2' : ''}>
              {message.content}
            </div>
          )}

          {/* Display message content when there are tables */}
          {message.content && message.tables && message.tables.length > 0 && (
            <div className={message.files && message.files.length > 0 ? 'mt-2' : ''}>
              {message.content}
            </div>
          )}
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
              const stableUid = (table as any).uid as string | undefined;
              const tableId = stableUid || `${message.id}-${index}`;
              const isExpanded = expandedTables.has(tableId);
              // Handle both string (from Firestore) and array (in-memory) formats
              const rows = Array.isArray(table.rows) ? table.rows : 
                          (typeof table.rows === 'string' ? JSON.parse(table.rows) : []);
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
                      // Check if this is a cell update table
                      const isCellUpdate = isCellUpdateTable(table, rows);

                      if (isCellUpdate) {
                        // 🎯 Render as Cell Updates
                        return (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs text-blue-300 mb-2">
                              <Target className="w-4 h-4" />
                              <span>Cell Updates</span>
                            </div>

                            {displayRows.map((row: any[], rowIndex: number) => {
                              const cellRef = row[0]; // A1, B5, etc.
                              const value = row[1];   // The value/formula
                              const description = row[2] || '';

                              return (
                                <div key={rowIndex} className="flex items-start gap-3 p-3 bg-white/5 rounded border border-white/10">
                                  <div className="font-mono text-emerald-300 font-semibold min-w-[50px] mt-0.5">
                                    {cellRef}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-mono text-white/90 text-sm break-all">
                                      {typeof value === 'string' && value.startsWith('=') ? (
                                        <span className="text-blue-300">{value}</span>
                                      ) : (
                                        <span className="text-white/90">"{value}"</span>
                                      )}
                                    </div>
                                    {description && (
                                      <div className="text-xs text-white/60 mt-1">
                                        {description}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {hasMoreRows && !isExpanded && (
                              <button
                                onClick={() => toggleTableExpansion(tableId)}
                                className="flex items-center gap-1 text-xs text-white/60 hover:text-white/80 transition-colors"
                              >
                                <ChevronDown className="w-3 h-3" />
                                Show {rows.length - 10} more updates
                              </button>
                            )}

                            {hasMoreRows && isExpanded && (
                              <button
                                onClick={() => toggleTableExpansion(tableId)}
                                className="flex items-center gap-1 text-xs text-white/60 hover:text-white/80 transition-colors"
                              >
                                <ChevronUp className="w-3 h-3" />
                                Show less
                              </button>
                            )}
                          </div>
                        );
                      } else {
                        // 📊 Render as Traditional Table (original logic)
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
                                    <th className="text-center p-2 font-medium text-white/80 w-12">
                                      Actions
                                    </th>
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
                                      <td className="p-2 text-center">
                                        <button
                                          onClick={() => handleDeleteRow(index, rowIndex)}
                                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                                          title="Delete this row"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </td>
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
                                📊 Target: <span className={`font-medium ${table.meta?.sheetName ? 'text-emerald-300' : 'text-yellow-400'}`}>
                                  {table.meta?.sheetName || 'No target sheet specified'}
                                </span>
                                {!table.meta?.sheetName && (
                                  <span className="text-yellow-400 ml-2">⚠️ This table needs a target sheet to be approved</span>
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
                                  console.log('🚀 Dispatching approve event:', {
                                    tableIndex: index,
                                    title: table.title,
                                    hasMeta: !!table.meta,
                                    meta: table.meta,
                                    updateRow: table.meta?.updateRow
                                  });

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
                                        meta: table.meta, // ✅ Include full meta object
                                        uid: stableUid,
                                      }
                                    }
                                  });
                                  window.dispatchEvent(event);
                                }}
                                disabled={processingTables.has(tableId) || !table.meta?.sheetName}
                                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                                title={!table.meta?.sheetName ? 'This table needs a target sheet specified to be approved' : 'Approve and submit this data to the sheet'}
                              >
                                {processingTables.has(tableId) ? 'Applying...' : 'Approve'}
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
                                        uid: stableUid,
                                      }
                                    }
                                  });
                                  window.dispatchEvent(event);
                                }}
                                disabled={processingTables.has(`reject-${tableId}`)}
                                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded transition-colors"
                              >
                                {processingTables.has(`reject-${tableId}`) ? 'Removing...' : 'Reject'}
                              </button>
                            </div>
                          </>
                        );
                      }
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
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;