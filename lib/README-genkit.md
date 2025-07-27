# Genkit Integration Template

This template provides a foundation for integrating Genkit with your existing Gemini functionality in the Next.js application.

## Files Created

1. **`genkit-template.ts`** - Main template with Genkit flows and utilities
2. **`genkit-example-usage.ts`** - Examples showing how to use the template
3. **`README-genkit.md`** - This documentation file

## Quick Start

### 1. Install Dependencies

Make sure you have Genkit and the required plugins installed:

```bash
npm install genkit @genkit-ai/googleai @genkit-ai/firebase
```

### 2. Set Up Environment Variables

Add your Google AI API key to your environment variables:

```env
GOOGLE_AI_API_KEY=your-api-key-here
```

### 3. Firebase Configuration

The template automatically enables Firebase telemetry for monitoring AI operations. Make sure your Firebase configuration is properly set up in your app:

```typescript
// This is already included in the template
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';
enableFirebaseTelemetry();
```

Firebase telemetry will automatically track:
- AI flow executions
- Response times
- Error rates
- Token usage
- Model performance metrics

### 4. Basic Usage

```typescript
import { helloFlow, updateSingleSheetFlow, convertToGenkitFormat } from './lib/genkit-template';

// Test basic functionality
const greeting = await helloFlow('Your Name');

// Convert your existing sheet data
const sheetData = [
  ['Date', 'Category', 'Amount'],
  ['2024-01-01', 'Food', '25.50'],
  ['2024-01-02', 'Transport', '15.00']
];

const genkitSheetData = convertToGenkitFormat(sheetData, 'Expenses');

// Process a user request
const result = await updateSingleSheetFlow({
  transcript: 'Add a coffee expense of $5.50',
  sheetData: genkitSheetData
});
```

## Available Flows

### 1. `helloFlow(name: string)`
Basic test flow to verify Genkit integration.

### 2. `analyzeSheetFlow(sheetData: SheetData)`
Analyzes sheet data and provides insights about patterns, data quality, and recommendations.

### 3. `updateSingleSheetFlow(params)`
Processes user transcript and suggests updates for a single sheet.

**Parameters:**
- `transcript`: User's request
- `sheetData`: Sheet data in Genkit format
- `images`: Optional array of images

### 4. `updateMultiSheetFlow(params)`
Processes user transcript and suggests updates for multiple sheets.

**Parameters:**
- `transcript`: User's request
- `sheetsData`: Object with sheet names as keys and data as values
- `allSheetNames`: Array of all available sheet names
- `selectedSheetName`: Optional preferred sheet
- `images`: Optional array of images

### 5. `validateDataFlow(sheetData: SheetData)`
Validates sheet data for potential issues and provides cleaning recommendations.

### 6. `classifyEntryFlow(params)`
Classifies entries into appropriate categories.

**Parameters:**
- `description`: Entry description
- `availableCategories`: Array of available categories

### 7. `generateSummaryFlow(params)`
Generates summary reports from sheet data.

**Parameters:**
- `sheetData`: Sheet data in Genkit format
- `summaryType`: 'daily' | 'weekly' | 'monthly' | 'custom'

## Integration with Existing Code

### Replace Current Gemini Function

Instead of using your current `sendToGemini` function, you can use the Genkit flows:

```typescript
// Old way
const result = await sendToGemini({
  transcript,
  sheetData,
  sheetName,
  geminiApiKey,
  images
});

// New way with Genkit
const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
const result = await updateSingleSheetFlow({
  transcript,
  sheetData: genkitSheetData,
  images
});
```

### API Route Integration

Update your API routes to use Genkit:

```typescript
// pages/api/parse-and-fill.ts
import { updateSingleSheetFlow, convertToGenkitFormat } from '../../lib/genkit-template';

export default async function handler(req, res) {
  try {
    const { transcript, sheetData, sheetName, images } = req.body;
    
    const genkitSheetData = convertToGenkitFormat(sheetData, sheetName);
    
    const result = await updateSingleSheetFlow({
      transcript,
      sheetData: genkitSheetData,
      images
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

## Error Handling

The template includes robust error handling with retry functionality:

```typescript
import { executeWithRetry, updateSingleSheetFlow } from './lib/genkit-template';

const result = await executeWithRetry(
  updateSingleSheetFlow,
  [{ transcript, sheetData: genkitSheetData }],
  3, // max retries
  2000 // delay between retries
);
```

## Testing

Run the included test function to verify everything works:

```typescript
import { testGenkitIntegration } from './lib/genkit-template';

await testGenkitIntegration();
```

## Type Definitions

The template includes TypeScript definitions for better development experience:

```typescript
interface SheetData {
  headers: string[];
  rows: (string | number)[][];
  sheetName: string;
}

interface ProcessedUpdate {
  sheetName: string;
  row: number;
  column: string;
  cell: string;
  value: string | number;
  confidence: 'high' | 'medium' | 'low';
}
```

## Migration Guide

1. **Install Genkit**: `npm install genkit @genkit-ai/googleai @genkit-ai/firebase`
2. **Set API Key**: Add `GOOGLE_AI_API_KEY` to environment variables
3. **Configure Firebase**: Ensure Firebase is properly configured in your app
4. **Update Imports**: Replace direct Gemini API calls with Genkit flows
5. **Convert Data**: Use `convertToGenkitFormat()` for existing sheet data
6. **Test Integration**: Run `testGenkitIntegration()` to verify setup

## Benefits of Using Genkit

- **Better Error Handling**: Built-in retry mechanisms and error recovery
- **Type Safety**: Full TypeScript support with proper type definitions
- **Flow Management**: Organized, reusable AI flows
- **Extensibility**: Easy to add new flows and functionality
- **Performance**: Optimized for production use
- **Monitoring**: Better logging and debugging capabilities
- **Firebase Telemetry**: Built-in monitoring and analytics for AI operations

## Next Steps

1. Test the basic integration with `helloFlow`
2. Replace one API route with Genkit flows
3. Gradually migrate other functions
4. Add custom flows for your specific use cases
5. Implement monitoring and logging

## Support

If you encounter issues:
1. Check the console for detailed error messages
2. Verify your API key is correctly set
3. Test with the included `testGenkitIntegration()` function
4. Review the Genkit documentation for advanced features 