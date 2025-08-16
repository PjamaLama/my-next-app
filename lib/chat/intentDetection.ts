import { ConversationHistoryItem, Context, ImageData } from './types';
import { generateQuickReplies } from './quickReplies';
import { executeToolCall } from './toolExecution';
import { extractSheetNameFromMessage, extractIdFromHistory, extractSheetName } from './extractor';

export async function detectUserIntent(
  message: string,
  context: Context,
  images: ImageData[],
  conversationHistory: ConversationHistoryItem[],
) {
  const isGreeting = /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening))\b/i.test((message || '').trim());
  if (isGreeting) {
    const quickReplies = await generateQuickReplies(message, conversationHistory, context, 'chat', false);
    return {
      response: 'Hi! How can I help with your sheet or files?',
      toolCalls: [],
      pendingToolCalls: [],
      toolResults: [],
      context,
      quickReplies
    };
  }

  // Intercept confirmation/cancellation for pending previewed updates
  try {
    const lower = String(message || '').toLowerCase();
    // Include 'approve' as a confirmation trigger so typing "Approve" commits the pending update
    const isConfirm = /(confirm\s+update|apply\s+changes|yes,\s*apply|go\s*ahead|^apply$|^approve$|approve\s+(it|changes))$/i.test(lower.trim());
    const isEdit = /^(edit|adjust|modify)$/i.test(lower.trim());
    // Treat 'reject' as a cancellation trigger in addition to 'cancel'
    const isCancel = /^(cancel|cancel\s+update|no|nevermind|never\s+mind|reject|decline)$/i.test(lower.trim());
    const pending = (context as any)._lastUpdateToolCall as { name: string; args: any } | undefined;
    if (pending && (isConfirm || isCancel || isEdit)) {
      if (isCancel) {
        try { (context as any)._lastUpdateToolCall = undefined; } catch {}
        return {
          response: 'Canceled. No changes were applied.',
          toolCalls: [],
          pendingToolCalls: [],
          toolResults: [],
          context,
          quickReplies: ['Show current sheet data', 'Preview updates']
        };
      }
      if (isEdit) {
        return {
          response: 'Okay. What would you like to change before applying?',
          toolCalls: [],
          pendingToolCalls: [],
          toolResults: [],
          context,
          quickReplies: ['Change amount', 'Change client', 'Cancel']
        };
      }
      // Re-run the pending tool with commit=true
      const call = {
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: { name: pending.name, arguments: JSON.stringify({ ...(pending.args || {}), commit: true }) }
      } as any;
      const result = await executeToolCall(call, context, images);
      try { (context as any)._lastUpdateToolCall = undefined; } catch {}
      const success = !!result?.success;
      const msg = success ? (String(result?.result || 'Applied updates.')) : `Tool error: ${String(result?.error || result?.result || 'Failed to apply')}`;
      return {
        response: msg,
        toolCalls: [],
        pendingToolCalls: [],
        toolResults: [result],
        context,
        quickReplies: ['Show current sheet data', 'Undo (not available)', 'Add more data']
      };
    }
  } catch {}

  return null;
}
