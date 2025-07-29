import { genkit } from 'genkit';
import { gemini15Flash, googleAI } from '@genkit-ai/googleai';
import { getGoogleSheetsClient } from '../lib/googleSheets';
import { insertRow, updateCell } from './tools';

// Configure Genkit instance with Google AI plugin
const ai = genkit({
  plugins: [googleAI()],
  model: gemini15Flash,
});

// Load the sheet update prompt
const sheetUpdatePrompt = ai.prompt('sheetUpdate');

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

// Template's analyzeSheetStructure function
const analyzeSheetStructure = (sheetData: string[][]): { formulaRows: string, dataRows: string, smartInsertionRow: number } => {
  const formulaRows: number[] = [];
  const dataRows: number[] = [];
  
  // Skip header row (index 0)
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const rowNumber = i + 1; // Convert to 1-based row number
    
    const hasFormulas = row.some(cell => {
      const cellStr = String(cell);
      return cellStr.startsWith('=') || 
             cellStr.includes('=SUM') || 
             cellStr.includes('=TOTAL') ||
             cellStr.includes('=COUNT') ||
             cellStr.includes('=AVERAGE') ||
             cellStr.includes('=IF(') ||
             cellStr.toUpperCase().includes('FUNCTION');
    });
    
    if (hasFormulas) {
      formulaRows.push(rowNumber);
    } else if (row.some(cell => cell !== "" && cell !== null && cell !== undefined)) {
      dataRows.push(rowNumber);
    }
  }
  
  // Determine smart insertion point
  const maxDataRow = Math.max(...dataRows, 1); // At least row 1 (header)
  const minFormulaRow = Math.min(...formulaRows, Number.MAX_SAFE_INTEGER);
  
  let smartInsertionRow: number;
  if (formulaRows.length > 0 && minFormulaRow > maxDataRow) {
    // Insert before the first formula row
    smartInsertionRow = minFormulaRow;
  } else {
    // No formulas or formulas are mixed with data, append at end
    smartInsertionRow = sheetData.length + 1; // +1 for 1-based indexing
  }
  
  return { 
    formulaRows: formulaRows.join(', ') || 'None detected',
    dataRows: dataRows.join(', ') || 'None detected', 
    smartInsertionRow 
  };
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

// Helper function to fetch real Google Sheets data and convert to CSV format
const fetchRealSheetDataAsCSV = async (sheetId: string, sheetName: string): Promise<string> => {
  try {
    console.log(`Fetching real sheet data for: ${sheetId}, sheet: ${sheetName}`);
    
    const sheets = await getGoogleSheetsClient();
    
    // Helper function to escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    // Try to get sheet data with multiple range strategies
    const strategies = [
      `${escapedSheetName}!A1:Z1000`,
      `${escapedSheetName}!A:Z`,
      `${escapedSheetName}!A1:T100`,
      `${sheetName}!A1:T100` // Fallback without escaping
    ];
    
    let sheetData: string[][] | null = null;
    
    for (const range of strategies) {
      try {
        console.log(`Trying range strategy: ${range}`);
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: range,
          valueRenderOption: 'FORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING',
        });
        
        if (response.data.values && response.data.values.length > 0) {
          sheetData = response.data.values;
          console.log(`Successfully fetched ${sheetData.length} rows using range: ${range}`);
          break;
        }
      } catch (rangeError) {
        console.log(`Range strategy failed: ${range}, trying next...`);
        continue;
      }
    }
    
    if (!sheetData || sheetData.length === 0) {
      console.warn('No data found in sheet, returning empty CSV');
      return '';
    }
    
    // Convert to CSV format
    const csvRows = sheetData.map(row => {
      return row.map(cell => {
        const value = cell || '';
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    return csvRows.join('\n');
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
};

// Helper function to find the first summary row index from CSV data
const findFirstSummaryRowIndexFromCSV = (csvData: string): number => {
  if (!csvData) return 999999;
  
  const lines = csvData.split('\n');
  
  // Look for patterns that indicate summary rows
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('total') || line.includes('sum') || line.includes('subtotal') || 
        line.includes('summary') || line.includes('balance')) {
      console.log(`Found potential summary row at index ${i + 1}: ${lines[i]}`);
      return i + 1; // Convert to 1-based index
    }
  }
  
  // If no summary row found, return a high number to allow insertion anywhere
  return 999999;
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
export const updateSheetFlow = ai.defineFlow('updateSheetFlow', async (input: UpdateSheetInput): Promise<UpdateSheetOutput> => {
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
    
    // Helper function to properly escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      // If the sheet name contains spaces, special characters, or starts with a digit,
      // wrap it in single quotes and escape any existing single quotes
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };
    
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
    
    // Analyze sheet structure using template logic
    const { formulaRows, dataRows, smartInsertionRow } = analyzeSheetStructure(sheetData);
    const patternAnalysis = buildPatternAnalysis(sheetData);
    
    console.log('Sheet structure analysis:', { formulaRows, dataRows, smartInsertionRow });
    console.log('Pattern analysis:', patternAnalysis);
    
    // Convert to CSV for the prompt
    const csvData = sheetData.map(row => row.join(',')).join('\n');
    const headers = sheetData[0].join(', ');
    
    // Call the AI prompt with template-style data
    const { text } = await sheetUpdatePrompt({
      transcript: cleanedTranscript,
      sheetData: csvData,
      sheetName,
      formulaRows,
      dataRows,
      smartInsertionRow,
      headers,
      patternAnalysis
    });
    
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
          
          for (const action of parsed.actions) {
            try {
              if (action.type === 'insertRow') {
                // Validate insert row position using smart insertion logic
                if (action.row >= smartInsertionRow) {
                  console.error(`Skipping insertRow at row ${action.row}: must be before smart insertion row ${smartInsertionRow}`);
                  continue;
                }
                
                console.log(`Executing insertRow: ${action.sheet}, row ${action.row}`);
                await insertRow({
                  sheetId: sheetId,
                  sheetName: sheetName,
                  row: action.row
                });
                executedCount++;
              } else if (action.type === 'updateCell') {
                console.log(`Executing updateCell: ${action.sheet}, ${action.column}${action.row} = "${action.value}"`);
                await updateCell({
                  sheetId: sheetId,
                  sheetName: sheetName,
                  row: action.row,
                  column: action.column,
                  value: action.value || ''
                });
                executedCount++;
              }
            } catch (actionError) {
              console.error(`Error executing action ${action.type}:`, actionError);
              // Continue with other actions even if one fails
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