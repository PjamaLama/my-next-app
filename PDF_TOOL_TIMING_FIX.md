# PDF Tool Timing Fix

## Problem
The "Files are required for analysis" error was occurring because of a **timing issue** with the `pendingToolCalls` state management.

## Root Cause
The `executeTool` function was removing the tool call from `pendingToolCalls` **immediately** when execution started, but the images were needed during the actual tool execution. This caused:

1. **Tool execution starts** → Tool call removed from `pendingToolCalls`
2. **Chat processing completes** → `pendingToolCalls.length` is 0, so images are cleared
3. **Tool execution continues** → `uploadedImages` is empty, causing "Files are required" error

## The Fix

### Before (Problematic):
```typescript
const executeTool = async (toolCall) => {
  setChatProcessing(true);
  setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id)); // ❌ Removed immediately
  
  // ... tool execution with empty uploadedImages
}
```

### After (Fixed):
```typescript
const executeTool = async (toolCall) => {
  setChatProcessing(true);
  // Don't remove from pendingToolCalls yet - we need the images to be preserved
  
  // ... tool execution with available uploadedImages
  
  // Now remove the tool call from pendingToolCalls after execution
  setPendingToolCalls(prev => prev.filter(t => t.id !== toolCall.id));
}
```

## Flow Now

1. **Upload PDF** → `uploadedImages` contains the PDF
2. **Send message** → Chat API returns tool suggestions, `pendingToolCalls` is set
3. **Chat processing completes** → `pendingToolCalls.length > 0`, so images are **kept**
4. **User clicks "Analyze"** → `executeTool` runs with `uploadedImages` available
5. **Tool execution** → Images are processed successfully
6. **After execution** → Tool call removed from `pendingToolCalls`, images cleared

## Debugging Added

- `🔍 [CHAT] Final state` - Shows final state before clearing images
- `⏳ [CHAT] Keeping` - Shows when images are preserved for pending tools
- `🔍 [EXECUTE_TOOL] Keeping tool call` - Shows when tool call is preserved during execution
- `🔍 [EXECUTE_TOOL] Removing tool call after execution` - Shows when tool call is removed after completion

## Expected Behavior

- ✅ PDF uploads successfully
- ✅ Tool buttons appear
- ✅ Images are preserved during tool execution
- ✅ Tools execute without "Files are required" errors
- ✅ Analysis results are displayed
- ✅ Images are cleared after successful execution

## Key Insight

The critical insight was that `pendingToolCalls` serves two purposes:
1. **UI state** - Shows which tools are available for approval
2. **Preservation signal** - Indicates that images should be kept for tool execution

By keeping the tool call in `pendingToolCalls` during execution, we ensure the images remain available throughout the entire process. 