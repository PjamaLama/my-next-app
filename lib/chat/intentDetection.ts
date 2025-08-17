import { ConversationHistoryItem, Context, ImageData } from './types';
import { generateQuickReplies } from './quickReplies';
import { executeToolCall } from './toolExecution';
import { extractSheetNameFromMessage, extractIdFromHistory, extractSheetName } from './extractor';
import { embedText, cosineSimilarity } from '../embeddings';

// Enhanced intent detection with semantic similarity fallback
async function detectIntent(message: string): Promise<string> {
  const dataEntryPatterns = /(add|insert|new|record|entry|log|enter|fill|complete|submit|edit|change|modify|update|correct|fix|adjust)/i;
  const analysisPatterns = /(show|display|analyze|summarize|total|average|count|group|trend|insight)/i;

  // Priority 1: Explicit data entry patterns (highest priority)
  if (dataEntryPatterns.test(message)) {
    return 'update_data'; // Prioritize entry even if analysis keywords present
  }
  
  // Priority 2: Explicit analysis patterns
  if (analysisPatterns.test(message)) {
    return 'get_data';
  }

  // Priority 3: Semantic similarity fallback for ambiguous cases
  try {
    const messageVector = await embedText(message);
    
    // Define reference phrases for different intents
    const entryPhrases = [
      'User wants to add or edit data',
      'User wants to insert new information',
      'User wants to modify existing data',
      'User wants to create a new record',
      'User wants to update the sheet'
    ];
    
    const analysisPhrases = [
      'User wants to see data',
      'User wants to analyze data',
      'User wants to view information',
      'User wants to get insights',
      'User wants to understand the data'
    ];

    // Calculate similarity scores
    let maxEntryScore = 0;
    let maxAnalysisScore = 0;

    for (const phrase of entryPhrases) {
      const phraseVector = await embedText(phrase);
      const score = cosineSimilarity(messageVector, phraseVector);
      maxEntryScore = Math.max(maxEntryScore, score);
    }

    for (const phrase of analysisPhrases) {
      const phraseVector = await embedText(phrase);
      const score = cosineSimilarity(messageVector, phraseVector);
      maxAnalysisScore = Math.max(maxAnalysisScore, score);
    }

    // Use threshold-based decision with bias toward data entry
    const entryThreshold = 0.6; // Lower threshold for entry (more permissive)
    const analysisThreshold = 0.7; // Higher threshold for analysis (more strict)
    
    if (maxEntryScore > entryThreshold && maxEntryScore > maxAnalysisScore) {
      return 'update_data';
    } else if (maxAnalysisScore > analysisThreshold) {
      return 'get_data';
    }
    
    // Default to describe_data for truly ambiguous cases
    return 'describe_data';
  } catch (error) {
    // Fallback to pattern-based detection if embeddings fail
    console.warn('Semantic intent detection failed, falling back to pattern matching:', error);
    
    // Simple fallback: if message contains any data-related action words, assume update
    const hasActionWords = /(want|need|should|must|going|planning|trying|attempting)/i.test(message);
    if (hasActionWords) {
      return 'update_data';
    }
    
    return 'describe_data';
  }
}

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

// Export the enhanced intent detection for use in other modules
export { detectIntent };

// Test function for development/debugging
export async function testIntentDetection() {
  const testMessages = [
    "Add a new fuel entry for today",
    "Show me the total sales",
    "Update my totals",
    "I need to log a new visit",
    "Display the average fuel consumption",
    "Insert a new record",
    "What are the trends in my data?",
    "I want to add some data",
    "Show me the count by category",
    "Log a new entry"
  ];

  console.log('Testing enhanced intent detection:');
  for (const message of testMessages) {
    try {
      const intent = await detectIntent(message);
      console.log(`"${message}" -> ${intent}`);
    } catch (error) {
      console.error(`Failed to detect intent for "${message}":`, error);
    }
  }
}
