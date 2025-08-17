# Enhanced Intent Detection System

## Overview

This enhancement addresses the issue where the AI chat was incorrectly showing analysis/insights tables instead of editable data tables with approve/edit/reject buttons when users wanted to add or edit sheet data.

## Problem

The original system used simple keyword detection that would trigger analysis mode for any message containing words like "total", "sum", "average", "count", or "group", even when the user was trying to add/edit data. This caused:

- Users asking to "add data" getting analysis tables with insights
- Users wanting to "update totals" getting aggregated views instead of editable tables
- Confusion between data entry and data analysis intents

## Solution

### 1. Enhanced Intent Detection (`lib/chat/intentDetection.ts`)

The new system uses a three-tier approach:

#### Priority 1: Explicit Pattern Matching
- **Data Entry Patterns**: `add|insert|new|record|entry|log|enter|fill|complete|submit|edit|change|modify|update|correct|fix|adjust`
- **Analysis Patterns**: `show|display|analyze|summarize|total|average|count|group|trend|insight`

#### Priority 2: Semantic Similarity (Fallback)
- Uses existing Google AI embeddings infrastructure (`lib/embeddings.ts`)
- Compares user message against reference phrases for each intent
- Calculates cosine similarity scores
- Uses threshold-based decision with bias toward data entry

#### Priority 3: Action Word Fallback
- Detects action-oriented language: `want|need|should|must|going|planning|trying|attempting`
- Defaults to `update_data` for action-oriented messages

### 2. Integration Points

#### Planner (`lib/chat/planner.ts`)
- Enhanced intent detection runs before AI model call
- Detected intent is passed to AI prompt for better guidance
- Fallback to detected intent if AI response is unclear

#### Table Builder (`lib/chat/tables.ts`)
- `buildSmartTables` now accepts optional `intent` parameter
- When `intent === 'update_data'`, forces editable table mode
- Shows raw data without aggregation/insights

#### Response Builder (`lib/chat/responseBuilder.ts`)
- Passes detected intent to table builder
- Ensures proper table type selection

## Key Benefits

1. **Intent Priority**: Data entry patterns override analysis patterns
2. **Semantic Understanding**: Handles nuanced queries like "Update my totals"
3. **Fallback Safety**: Multiple layers of detection ensure robustness
4. **Performance**: Uses existing embeddings infrastructure
5. **Debugging**: Comprehensive logging for troubleshooting

## Example Behavior

| User Message | Old Behavior | New Behavior |
|--------------|--------------|--------------|
| "Add a new fuel entry" | Analysis table | Editable table ✅ |
| "Update my totals" | Analysis table | Editable table ✅ |
| "Show me the total sales" | Analysis table | Analysis table ✅ |
| "I need to log data" | Analysis table | Editable table ✅ |
| "Display trends" | Analysis table | Analysis table ✅ |

## Configuration

### Thresholds
- **Entry Threshold**: 0.6 (more permissive for data entry)
- **Analysis Threshold**: 0.7 (more strict for analysis)

### Reference Phrases
The system uses carefully crafted reference phrases for semantic comparison:

**Data Entry:**
- "User wants to add or edit data"
- "User wants to insert new information"
- "User wants to modify existing data"
- "User wants to create a new record"
- "User wants to update the sheet"

**Data Analysis:**
- "User wants to see data"
- "User wants to analyze data"
- "User wants to view information"
- "User wants to get insights"
- "User wants to understand the data"

## Testing

Use the `testIntentDetection()` function to verify behavior:

```typescript
import { testIntentDetection } from './lib/chat/intentDetection';

// Run in development environment
await testIntentDetection();
```

## Error Handling

The system gracefully degrades if semantic detection fails:
1. Falls back to pattern matching
2. Logs warnings for debugging
3. Continues to function with basic detection

## Future Enhancements

1. **Context Awareness**: Consider conversation history in intent detection
2. **User Feedback**: Learn from user corrections to improve accuracy
3. **Custom Patterns**: Allow users to define domain-specific patterns
4. **Performance**: Cache embeddings for common phrases
