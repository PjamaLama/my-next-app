# AI Flow Architecture Diagram

## Overview
This document explains how all the components of the AI flow work together in the system, from user input to final response generation.

## High-Level Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  API Endpoint    │───▶│ Process Message │
│ (Message +      │    │ (genkit-chat.ts) │    │ (processMessage │
│  Images +       │    │                  │    │  .ts)          │
│  Context)       │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Error Handling  │    │ Data Hydration  │
                       │ (errorHandling.ts)│   │ (dataHydrator.ts)│
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Intent Detection │    │  Sheet Context  │
                       │(intentDetection.ts)│  │   Inference     │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │    Planner       │    │ Execution       │
                       │   (planner.ts)   │───▶│ Orchestrator    │
                       │                  │    │(executionOrchestrator.ts)│
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Tool Execution   │    │ Response        │
                       │(toolExecution.ts)│    │ Builder         │
                       │                  │    │(responseBuilder.ts)│
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Quick Replies    │    │ Final Response  │
                       │ (quickReplies.ts)│    │ (User Output)   │
                       └──────────────────┘    └─────────────────┘
```

## Detailed Component Flow

### 1. Entry Point
```
User Input → API Endpoint (genkit-chat.ts) → processMessage()
```

### 2. Initial Processing & Context Setup
```
processMessage() → Context Validation → Sheet Context Inference
                ↓
            Data Hydration (hydrateSheetData)
                ↓
            Intent Detection (detectUserIntent)
```

### 3. Planning Phase
```
Intent Detection → Planner (generatePlan)
                ↓
            AI Model Call (Google Gemini)
                ↓
            Plan Parsing & Validation
                ↓
            Tool Chain Generation
```

### 4. Execution Phase
```
Planner → Execution Orchestrator (executeToolPlan)
        ↓
    Tool Selection & Argument Preparation
        ↓
    Tool Execution (executeToolCall)
        ↓
    Result Processing & Validation
```

### 5. Response Generation
```
Tool Results → Response Builder (buildUserResponse)
            ↓
        Data Table Construction
            ↓
        Chart Generation (if applicable)
            ↓
        Quick Reply Generation
            ↓
        Final Response Assembly
```

## Component Responsibilities

### Core Orchestration
- **`processMessage.ts`**: Main orchestrator, coordinates all components
- **`executionOrchestrator.ts`**: Manages tool execution flow and plan implementation
- **`responseBuilder.ts`**: Constructs final user-facing response with tables, charts, and text

### Intelligence & Planning
- **`planner.ts`**: Generates execution plans using AI, determines intent and tool chains
- **`intentDetection.ts`**: Detects user intent (update_data, extraction, chat, etc.)
- **`dataHydrator.ts`**: Loads and caches sheet data for context

### Tool Management
- **`toolExecution.ts`**: Executes individual tool calls via API endpoints
- **`extractor.ts`**: Extracts sheet names, IDs, and context from messages

### Response Enhancement
- **`tables.ts`**: Builds structured data tables for display
- **`quickReplies.ts`**: Generates contextual quick reply suggestions
- **`qa.ts`**: Handles question-answering over sheet data

### Error Handling & Recovery
- **`errorHandling.ts`**: Manages errors gracefully with user-friendly messages
- **`contextUtils.ts`**: Utilities for context management and validation

## Data Flow

### Context Propagation
```
User Context → Sheet Context Inference → Data Hydration → Planner Context → Tool Execution → Response Context
```

### Sheet Data Flow
```
Google Sheets → SheetDataSource → Data Hydration → Context Cache → Planner → Tool Execution → Response Tables
```

### AI Model Integration
```
User Message → Intent Detection → Planner Prompt → Google Gemini → Plan Generation → Tool Chain → Execution
```

## Key Integration Points

### 1. Context Management
- Context flows through all components with incremental enrichment
- Sheet data is cached and reused across components
- Error states are propagated and handled gracefully

### 2. AI Model Calls
- **Planner**: Uses Gemini to generate execution plans
- **Quick Replies**: Uses Gemini to generate contextual suggestions
- **Intent Detection**: Uses pattern matching with AI fallback

### 3. Tool Execution
- Tools are executed via API endpoints (`/api/genkit-tool-execute`)
- Results are standardized and validated before response building
- Preview mode supports dry-run operations for user confirmation

### 4. Response Assembly
- Multiple response components are assembled into final output
- Tables, charts, insights, and quick replies are coordinated
- Context-aware responses based on user intent and data state

## Error Handling Strategy

### 1. Graceful Degradation
- Failed tool executions don't crash the entire flow
- Fallback responses are generated when possible
- User-friendly error messages with actionable suggestions

### 2. Context Recovery
- Failed data hydration doesn't prevent planning
- Partial context is used when full context is unavailable
- Error states are tracked and can be recovered from

### 3. User Guidance
- Quick replies provide next steps after errors
- Contextual help based on error type
- Clear indication of what went wrong and how to proceed

## Performance Optimizations

### 1. Caching Strategy
- Sheet data is cached after first hydration
- Context is reused across related operations
- AI model calls are minimized through smart planning

### 2. Parallel Execution
- Tool execution can be parallelized when dependencies allow
- Data hydration and planning can happen concurrently
- Response building happens in parallel with final data gathering

### 3. Lazy Loading
- Sheet data is loaded only when needed
- AI model calls are deferred until planning phase
- Tool execution is batched when possible

## State Management

### 1. Context Persistence
- Context is maintained across message processing
- Sheet data persists in memory during session
- User preferences and settings are preserved

### 2. Conversation History
- Recent conversation context is maintained
- History influences planning and response generation
- Context is enriched incrementally

### 3. Error Recovery
- Error states are tracked and can be cleared
- Failed operations can be retried
- User can provide additional context to resolve issues

This architecture provides a robust, scalable foundation for AI-powered spreadsheet interactions with graceful error handling, intelligent planning, and context-aware responses.
