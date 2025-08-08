import { genkit } from 'genkit';
import { gemini15Flash, gemini15Pro, googleAI } from '@genkit-ai/googleai';
import { getGoogleSheetsClient } from '../lib/googleSheets';
import { insertRow, updateCell } from './tools';
import { executeAIWithRetry, executeAIWithModelFallback } from '../lib/aiUtils';
import { findLastDataRow } from '../lib/sheetUtils';

// Create multiple AI configurations with different models for fallback
const aiConfigs = [
  {
    name: 'gemini-1.5-flash',
    config: genkit({
      plugins: [googleAI()],
      model: gemini15Flash,
    })
  },
  {
    name: 'gemini-1.5-pro',
    config: genkit({
      plugins: [googleAI()],
      model: gemini15Pro,
    })
  }
];

// Load the sheet update prompt from the first config
const sheetUpdatePrompt = aiConfigs[0].config.prompt('sheetUpdate');

// Input type for the flow
interface UpdateSheetInput {
  transcript: string;
  sheetId: string;
  sheetName?: string;
  commit?: boolean; // New flag to indicate if actions should be executed
}

// Output type for the flow
interface UpdateSheetOutput {
  actions: Array<{
    type: 'insertRow' | 'updateCell';
    sheet: string;
    row: number;
    column: string;
    value?: string | number;
    confidence: 'high' | 'medium' | 'low';
  }>;
  success?: boolean; // New field to indicate execution success
  executedActions?: number; // Number of actions that were executed
}

// Simplified sheet analysis for AI
const analyzeSheetForAI = (sheetData: string[][]): { lastDataRow: number, insertionRow: number } => {
  const lastDataRow = findLastDataRow(sheetData);
  const insertionRow = lastDataRow + 1; // Insert after the last data row
  
  return { lastDataRow, insertionRow };
};

// Template's pattern analysis function
const buildPatternAnalysis = (sheetData: string[][]): string => {
  if (sheetData.length <= 1) return "";
  
  const headers = sheetData[0];
  const rows = sheetData.slice(1);
  let patternAnalysis = "\n\nDATA PATTERN ANALYSIS:";
  
  headers.forEach((header: string, colIndex: number) => {
    const columnValues = rows.map((row: string[]) => row[colIndex]).filter((val: string) => val !== "" && val !== null && val !== undefined);
    
    if (columnValues.length > 0) {
      const recentValues = columnValues.slice(-3);
      patternAnalysis += `\n- "${header}": Recent values: [${recentValues.join(', ')}]`;
    }
  });
  
  return patternAnalysis;
};

// Helper function to clean and improve the transcript
const cleanTranscript = async (transcript: string): Promise<string> => {
  if (!transcript) return '';
  
  // Apply basic grammar fixes
  let cleaned = applyGrammarFixes(transcript);
  
  // Add context if it's a fuel-related request
  if (cleaned.toLowerCase().includes('fuel') || cleaned.toLowerCase().includes('gas')) {
    cleaned += ' (fuel expense entry)';
  }
  
  // Add context if it's a weekly report
  if (cleaned.toLowerCase().includes('weekly') || cleaned.toLowerCase().includes('report')) {
    cleaned += ' (weekly report update)';
  }
  
  return cleaned;
};

// Helper function to apply grammar fixes
const applyGrammarFixes = (text: string): string => {
  // Basic grammar improvements
  let fixed = text
    .replace(/\b(add|update|insert)\s+my\b/gi, 'add to my')
    .replace(/\b(fuel|gas)\s+slips?\b/gi, 'fuel receipts')
    .replace(/\bweekly\s+repo\b/gi, 'weekly report')
    .replace(/\bdata\s+from\b/gi, 'information from');
  
  return fixed;
};

// Export the flow implementation
export const updateSheetFlow = aiConfigs[0].config.defineFlow('updateSheetFlow', async (input: UpdateSheetInput): Promise<UpdateSheetOutput> => {
  try {
    console.log('UpdateSheetFlow called with:', input);
    
    // Ensure sheetName is provided
    const { transcript, sheetId, sheetName, commit = false } = input;
    
    if (!sheetName) {
      throw new Error('Sheet name is required for sheet updates');
    }
    
    // Clean and improve the transcript
    const cleanedTranscript = await cleanTranscript(transcript);
    console.log('Original transcript:', transcript);
    console.log('Cleaned transcript:', cleanedTranscript);
    
    // Fetch real Google Sheets data as structured data
    const sheets = await getGoogleSheetsClient();
    
    // Use shared utility for escaping sheet names
    const { escapeSheetName } = await import('../lib/sheetUtils');
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${escapedSheetName}!A1:Z1000`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    
    const sheetData = response.data.values || [];
    
    if (sheetData.length === 0) {
      throw new Error('No data found in sheet');
    }
    
    // Analyze sheet structure using simplified logic
    const { lastDataRow, insertionRow } = analyzeSheetForAI(sheetData);
    const patternAnalysis = buildPatternAnalysis(sheetData);
    
    console.log('Sheet structure analysis:', { lastDataRow, insertionRow });
    console.log('Pattern analysis:', patternAnalysis);
    
    // Convert to CSV for the prompt
    const csvData = sheetData.map(row => row.join(',')).join('\n');
    const headers = sheetData[0].join(', ');
    
    // Create multiple AI operations for fallback
    const aiOperations = aiConfigs.map(config => 
      () => config.config.prompt('sheetUpdate')({
        transcript: cleanedTranscript,
        sheetData: csvData,
        sheetName,
        lastDataRow,
        insertionRow,
        headers,
        patternAnalysis
      })
    );
    
    // Use the fallback strategy with multiple models
    const { text } = await executeAIWithModelFallback(
      aiOperations,
      'Sheet update analysis with AI models'
    );
    
    console.log('AI response:', text);
    
    // Parse the JSON response
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (parsed && parsed.actions && Array.isArray(parsed.actions)) {
        console.log(`Successfully parsed ${parsed.actions.length} actions`);
        
        // If commit is true, execute the actions
        if (commit) {
          console.log('Commit flag is true, executing actions...');
          let executedCount = 0;
          
          // Separate insertRow and updateCell actions
          const insertRowActions = parsed.actions.filter((action: any) => action.type === 'insertRow');
          const updateCellActions = parsed.actions.filter((action: any) => action.type === 'updateCell');
          
          console.log(`Found ${insertRowActions.length} insertRow actions and ${updateCellActions.length} updateCell actions`);
          
          // First, execute all insertRow actions
          for (const action of insertRowActions) {
            try {
              // Validate insertion row position
              if (action.row < insertionRow) {
                console.error(`Skipping insertRow at row ${action.row}: must be at or after insertion row ${insertionRow}`);
                continue;
              }
              
              console.log(`Executing insertRow: ${action.sheet}, row ${action.row}`);
              console.log(`Using lastDataRow from AI analysis: ${lastDataRow}`);
              await insertRow({
                sheetId: sheetId,
                sheetName: sheetName,
                row: action.row,
                lastDataRow: lastDataRow // Pass the lastDataRow from AI analysis
              });
              executedCount++;
            } catch (actionError) {
              console.error(`Error executing insertRow action:`, actionError);
              // Continue with other actions even if one fails
            }
          }
          
          // Then, execute updateCell actions in batches (optimize by grouping)
          if (updateCellActions.length > 0) {
            try {
              const updates = updateCellActions.map((a: any) => ({
                sheetName,
                cell: `${a.column}${a.row}`,
                value: a.value ?? ''
              }));

              const resp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/save-sheet-data-multi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spreadsheetId: sheetId, updates })
              });

              if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Batch update failed: ${resp.status} - ${errText}`);
              }

              executedCount += updateCellActions.length;
            } catch (err) {
              console.error('Batch update for updateCell actions failed:', err);
            }
          }
          
          console.log(`Successfully executed ${executedCount} out of ${parsed.actions.length} actions`);
          
          return {
            ...parsed,
            success: true,
            executedActions: executedCount
          } as UpdateSheetOutput;
        } else {
          // Just return the actions without executing them
          return parsed as UpdateSheetOutput;
        }
      } else {
        console.error('Invalid response structure:', parsed);
        return { actions: [] };
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw response:', text);
      return { actions: [] };
    }
    
  } catch (error) {
    console.error('Error in updateSheetFlow:', error);
    throw error;
  }
}); 