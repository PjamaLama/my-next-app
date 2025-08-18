# AI Flow Visual Diagram

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER INTERFACE LAYER                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    API ENTRY POINT                                                    │
│                              /api/genkit-chat.ts                                                      │
│                              • Validates request                                                      │
│                              • Extracts message, context, images                                      │
│                              • Calls processMessage()                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MAIN ORCHESTRATOR                                                     │
│                              processMessage.ts                                                        │
│                              • Coordinates all components                                             │
│                              • Manages context flow                                                   │
│                              • Handles errors gracefully                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│    CONTEXT SETUP        │ │   INTENT DETECTION      │ │   DATA HYDRATION        │
│  • Sheet context        │ │ • Pattern matching      │ │ • Load sheet data       │
│  • URL extraction       │ │ • AI fallback           │ │ • Cache management      │
│  • History analysis     │ │ • Intent classification │ │ • Error handling       │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PLANNING PHASE                                                     │
│                                planner.ts                                                             │
│                              • AI model call (Gemini)                                                 │
│                              • Plan generation                                                        │
│                              • Tool chain creation                                                    │
│                              • Intent validation                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 EXECUTION ORCHESTRATOR                                                │
│                          executionOrchestrator.ts                                                     │
│                              • Plan interpretation                                                    │
│                              • Tool selection                                                        │
│                              • Argument preparation                                                   │
│                              • Result coordination                                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TOOL EXECUTION                                                      │
│                              toolExecution.ts                                                         │
│                              • API endpoint calls                                                     │
│                              • Result validation                                                      │
│                              • Error handling                                                         │
│                              • Preview mode support                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RESPONSE BUILDING                                                    │
│                              responseBuilder.ts                                                       │
│                              • Data table construction                                                │
│                              • Chart generation                                                       │
│                              • Quick reply generation                                                 │
│                              • Response assembly                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│    TABLE BUILDING       │ │   QUICK REPLIES         │ │   FINAL ASSEMBLY        │
│  • Structured tables    │ │ • Context-aware         │ │ • Response coordination │
│  • Editable controls    │ │ • AI-generated           │ │ • Error integration    │
│  • Data formatting      │ │ • User-friendly          │ │ • Output formatting    │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER OUTPUT                                                        │
│                              • Formatted response                                                     │
│                              • Interactive tables                                                     │
│                              • Quick reply buttons                                                    │
│                              • Error messages (if any)                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Details

### Context Propagation Path
```
User Context ──┐
                ├─► Context Setup ──► Data Hydration ──► Planner Context ──► Tool Execution ──► Response Context
Sheet Context ──┘
```

### AI Model Integration Path
```
User Message ──► Intent Detection ──► Planner Prompt ──► Google Gemini ──► Plan Generation ──► Tool Chain ──► Execution
```

### Error Handling Path
```
Error Occurrence ──► Error Handler ──► User-Friendly Message ──► Quick Reply Suggestions ──► Recovery Options
```

## Component Interaction Matrix

| Component | Inputs | Outputs | Dependencies |
|-----------|--------|---------|--------------|
| `processMessage` | message, context, history, images | complete response | All other components |
| `intentDetection` | message, context, images | intent, quick replies | `quickReplies` |
| `dataHydrator` | context, dataSource | hydrated context | `SheetDataSource` |
| `planner` | message, context, history | execution plan | Google Gemini API |
| `executionOrchestrator` | plan, context, message | execution results | `planner`, `toolExecution` |
| `toolExecution` | tool calls, context | tool results | External APIs |
| `responseBuilder` | execution results, context | final response | `tables`, `quickReplies` |
| `quickReplies` | context, intent, history | reply suggestions | Google Gemini API |

## State Management Flow

```
Session Start ──► Context Initialization ──► Data Loading ──► Context Enrichment ──► State Persistence
     │                    │                       │                   │                   │
     ▼                    ▼                       ▼                   ▼                   ▼
User Input ──► Context Validation ──► Data Hydration ──► Context Update ──► State Save
     │                    │                       │                   │                   │
     ▼                    ▼                       ▼                   ▼                   ▼
Processing ──► Context Propagation ──► Tool Execution ──► Result Integration ──► Response Generation
     │                    │                       │                   │                   │
     ▼                    ▼                       ▼                   ▼                   ▼
Response ──► Context Cleanup ──► State Update ──► Context Persistence ──► Ready for Next Input
```

## Performance Optimization Paths

### Parallel Execution Opportunities
```
Data Hydration ──┐
                  ├─► Concurrent Processing ──► Result Aggregation ──► Response Building
Intent Detection ──┘
```

### Caching Strategy
```
First Request ──► Data Load ──► Cache Storage ──► Subsequent Requests ──► Cache Hit ──► Faster Response
```

### Lazy Loading
```
Essential Data ──► Immediate Load ──► Optional Data ──► Deferred Load ──► On-Demand Access
```

This visual representation shows how the AI flow components work together in a coordinated, efficient manner to process user requests and generate intelligent responses.
