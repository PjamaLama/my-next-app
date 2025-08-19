# N8N Integration for AI Logic

This document describes the migration of AI logic from the local codebase to N8N workflows.

## Overview

The AI processing logic has been moved from the local application to N8N workflows to:
- Centralize AI processing
- Improve scalability
- Enable easier workflow management
- Reduce local code complexity

**Important**: The N8N webhook has been configured to accept POST requests with JSON body data.

## Changes Made

### 1. Removed AI Logic Files
The following files containing AI processing logic have been removed:
- `lib/chat/processMessage.ts` - Main message processing orchestrator
- `lib/chat/planner.ts` - AI planning and intent detection
- `lib/chat/executionOrchestrator.ts` - Tool execution orchestration
- `lib/chat/responseBuilder.ts` - Response construction
- `lib/chat/quickReplies.ts` - Quick reply generation
- `lib/chat/qa.ts` - Question answering logic
- `lib/chat/replyComposer.ts` - Reply composition
- `lib/chat/toolExecution.ts` - Tool execution
- `lib/chat/tables.ts` - Table building
- `lib/chat/utils.ts` - Chat utilities
- `lib/chat/errorHandling.ts` - Error handling
- `lib/chat/intentDetection.ts` - Intent detection
- `lib/chat/dataHydrator.ts` - Data hydration
- `lib/chat/contextUtils.ts` - Context utilities
- `lib/chat/extractor.ts` - Data extraction

### 2. Updated API Endpoint
- `pages/api/genkit-chat.ts` - Now calls N8N webhook instead of local AI processing

### 3. Updated Frontend
- `app/page.tsx` - Removed AI function calls and updated to handle N8N response format

## N8N Webhook Integration

### Webhook URL
```
https://n8n.sheetyai.com/webhook-test/845a6da9-85cd-4ada-9df6-40d5bdc421e3
```

### Request Format
The webhook expects a POST request with the following JSON body structure:

```json
{
  "message": "User's natural language request",
  "selectedSheets": ["Array of sheet names"],
  "sheetDataSample": {"Sample data from selected sheets"},
  "conversationHistory": ["Recent conversation context"],
  "extractedFileContents": ["Array of file contents if files uploaded"]
}
```

Note: All data is sent as a proper JSON body with Content-Type: application/json header.

### Expected Response Format
```json
{
  "intent": "update_data" | "extraction" | "query",
  "reasoning": "Explanation of what was understood",
  "tables": [
    {
      "title": "Proposed Updates",
      "headers": ["Column1", "Column2", "Column3"],
      "rows": [
        ["Value1", "Value2", "Value3"]
      ],
      "summary": "Description of the table",
      "meta": {
        "sheetName": "SheetName",
        "operations": {
          "add": 1,
          "update": 0
        },
        "requiresConfirmation": true,
        "isDryRun": true
      }
    }
  ],
  "clarifyQuestion": "Question if more info needed",
  "insights": ["Key insights about the data"],
  "quickReplies": ["Quick reply 1", "Quick reply 2", "Quick reply 3"]
}
```

## N8N AI Prompt

The AI inside N8N should use this comprehensive prompt:

```
You are an AI assistant that helps users update Google Sheets through natural language. Your job is to:

1. **Analyze the user's request** and understand their intent
2. **Extract structured data** from their message and any uploaded files
3. **Map data to sheet columns** based on the sheet structure
4. **Return a structured response** that can be used to update the sheet

## Input Context
You receive:
- `message`: The user's natural language request
- `extractedFileContents`: Array of file contents if files were uploaded
- `selectedSheets`: Array of sheet names the user wants to update
- `sheetDataSample`: Sample data from the selected sheets
- `conversationHistory`: Recent conversation context

## Your Response Format
You MUST return valid JSON with this exact structure:

```json
{
  "intent": "update_data" | "extraction" | "query",
  "reasoning": "Brief explanation of what you understood and what you're doing",
  "tables": [
    {
      "title": "Proposed Updates",
      "headers": ["Column1", "Column2", "Column3"],
      "rows": [
        ["Value1", "Value2", "Value3"],
        ["Value4", "Value5", "Value6"]
      ],
      "summary": "Brief description of what this table represents",
      "meta": {
        "sheetName": "SheetName",
        "operations": {
          "add": 2,
          "update": 0
        },
        "requiresConfirmation": true,
        "isDryRun": true
      }
    }
  ],
  "clarifyQuestion": null | "Question if you need more information",
  "insights": ["Key insights about the data or request"],
  "quickReplies": ["Quick reply 1", "Quick reply 2", "Quick reply 3"]
}
```

## Key Rules

1. **Intent Detection**:
   - `update_data`: User wants to add/update rows in sheets
   - `extraction`: User uploaded files to extract data from
   - `query`: User is asking questions about existing data

2. **Data Mapping**:
   - Use exact column names from the sheet headers
   - Map user input to appropriate columns
   - Infer missing values when possible (e.g., current date for date columns)
   - Handle multiple sheets if specified

3. **Table Structure**:
   - Always include an Action column (Add/Update)
   - Ensure row data matches header count
   - Provide clear summaries and insights
   - Mark as `requiresConfirmation: true` for data updates

4. **File Processing**:
   - If files present, extract structured data
   - Map file data to sheet columns
   - Combine file data with text input if both present

5. **Context Awareness**:
   - Use conversation history for context
   - Infer sheet names from content if not specified
   - Handle date patterns and common business logic

Remember: Always return valid JSON, be helpful and clear, and ensure data integrity by mapping to exact column names.
```

## Testing

A test endpoint has been created at `/api/test-n8n` to verify the webhook integration works correctly.

## Benefits

1. **Centralized AI Processing**: All AI logic is now managed in one place
2. **Scalability**: N8N can handle multiple concurrent requests
3. **Workflow Management**: Easy to modify and improve AI logic without code changes
4. **Reduced Complexity**: Local codebase is simpler and more maintainable
5. **Better Monitoring**: N8N provides built-in monitoring and logging

## Next Steps

1. Set up the N8N workflow with the provided AI prompt
2. Test the integration using the test endpoint
3. Verify that the frontend correctly displays N8N responses
4. Monitor performance and adjust as needed
