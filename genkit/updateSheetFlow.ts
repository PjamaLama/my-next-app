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
    
    const csvData = csvRows.join('\n');
    console.log(`Generated CSV data with ${csvRows.length} rows`);
    return csvData;
    
  } catch (error) {
    console.error('Error fetching real sheet data:', error);
    throw new Error(`Failed to fetch sheet data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Helper function to find the first summary row index from CSV data
const findFirstSummaryRowIndexFromCSV = (csvData: string): number => {
  if (!csvData.trim()) {
    return 999999;
  }
  
  const rows = csvData.split('\n');
  
  // Look for patterns that indicate summary rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].toLowerCase();
    if (row.includes('total') || row.includes('sum') || row.includes('subtotal') || 
        row.includes('summary') || row.includes('balance')) {
      console.log(`Found potential summary row at index ${i + 1}: ${rows[i]}`);
      return i + 1; // Convert to 1-based index
    }
  }
  
  // If no summary row found, return a high number to allow insertion anywhere
  return 999999;
};

// Helper function to clean and improve transcript text
const cleanTranscript = async (transcript: string): Promise<string> => {
  let cleaned = transcript.trim();
  
  // Remove common filler words and phrases
  const fillerWords = [
    /\b(um|uh|er|ah|like|you know|i mean|basically|actually|literally|sort of|kind of)\b/gi,
    /\b(so|well|right|okay|ok|yeah|yep|nope|no|yes)\b/gi,
    /\b(i think|i guess|i suppose|maybe|probably|possibly)\b/gi,
    /\b(just|really|very|quite|pretty|fairly)\b/gi,
    /\b(thing|stuff|something|anything|everything)\b/gi
  ];
  
  fillerWords.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove extra whitespace and normalize
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove trailing punctuation that might interfere with parsing
  cleaned = cleaned.replace(/[.,;:!?]+$/, '');
  
  // Apply basic grammar fixes
  cleaned = applyGrammarFixes(cleaned);
  
  // If transcript is too short after cleaning, return original
  if (cleaned.length < 3) {
    console.log('Transcript too short after cleaning, using original');
    return transcript.trim();
  }
  
  console.log('Transcript cleaned:', { original: transcript.length, cleaned: cleaned.length });
  return cleaned;
};

// Helper function to apply basic grammar fixes
const applyGrammarFixes = (text: string): string => {
  let fixed = text;
  
  // Fix common speech-to-text issues
  const grammarFixes = [
    // Fix "i" to "I" at start of sentences
    { pattern: /\bi\b/g, replacement: 'I' },
    // Fix "im" to "I'm"
    { pattern: /\bim\b/gi, replacement: "I'm" },
    // Fix "ive" to "I've"
    { pattern: /\bive\b/gi, replacement: "I've" },
    // Fix "id" to "I'd"
    { pattern: /\bid\b/gi, replacement: "I'd" },
    // Fix "ill" to "I'll" (when it's a contraction)
    { pattern: /\bill\b/gi, replacement: "I'll" },
    // Fix "cant" to "can't"
    { pattern: /\bcant\b/gi, replacement: "can't" },
    // Fix "dont" to "don't"
    { pattern: /\bdont\b/gi, replacement: "don't" },
    // Fix "wont" to "won't"
    { pattern: /\bwont\b/gi, replacement: "won't" },
    // Fix "isnt" to "isn't"
    { pattern: /\bisnt\b/gi, replacement: "isn't" },
    // Fix "arent" to "aren't"
    { pattern: /\barent\b/gi, replacement: "aren't" },
    // Fix "havent" to "haven't"
    { pattern: /\bhavent\b/gi, replacement: "haven't" },
    // Fix "hasnt" to "hasn't"
    { pattern: /\bhasnt\b/gi, replacement: "hasn't" },
    // Fix "didnt" to "didn't"
    { pattern: /\bdidnt\b/gi, replacement: "didn't" },
    // Fix "doesnt" to "doesn't"
    { pattern: /\bdoesnt\b/gi, replacement: "doesn't" },
    // Fix "wouldnt" to "wouldn't"
    { pattern: /\bwouldnt\b/gi, replacement: "wouldn't" },
    // Fix "couldnt" to "couldn't"
    { pattern: /\bcouldnt\b/gi, replacement: "couldn't" },
    // Fix "shouldnt" to "shouldn't"
    { pattern: /\bshouldnt\b/gi, replacement: "shouldn't" },
    // Fix "lets" to "let's"
    { pattern: /\blets\b/gi, replacement: "let's" },
    // Fix "thats" to "that's"
    { pattern: /\bthats\b/gi, replacement: "that's" },
    // Fix "its" to "it's" (when it's a contraction, not possessive)
    { pattern: /\bits\b/gi, replacement: "it's" },
    // Fix "youre" to "you're"
    { pattern: /\byoure\b/gi, replacement: "you're" },
    // Fix "youve" to "you've"
    { pattern: /\byouve\b/gi, replacement: "you've" },
    // Fix "youll" to "you'll"
    { pattern: /\byoull\b/gi, replacement: "you'll" },
    // Fix "youd" to "you'd"
    { pattern: /\byoud\b/gi, replacement: "you'd" },
    // Fix "theyre" to "they're"
    { pattern: /\btheyre\b/gi, replacement: "they're" },
    // Fix "theyve" to "they've"
    { pattern: /\btheyve\b/gi, replacement: "they've" },
    // Fix "theyll" to "they'll"
    { pattern: /\btheyll\b/gi, replacement: "they'll" },
    // Fix "theyd" to "they'd"
    { pattern: /\btheyd\b/gi, replacement: "they'd" },
    // Fix "were" to "we're"
    { pattern: /\bwere\b/gi, replacement: "we're" },
    // Fix "weve" to "we've"
    { pattern: /\bweve\b/gi, replacement: "we've" },
    // Fix "well" to "we'll"
    { pattern: /\bwell\b/gi, replacement: "we'll" },
    // Fix "wed" to "we'd"
    { pattern: /\bwed\b/gi, replacement: "we'd" },
  ];
  
  grammarFixes.forEach(({ pattern, replacement }) => {
    fixed = fixed.replace(pattern, replacement);
  });
  
  // Capitalize first letter of sentences
  fixed = fixed.replace(/(^|\.\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());
  
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
    
    // Fetch real Google Sheets data
    const sheetData = await fetchRealSheetDataAsCSV(sheetId, sheetName);
    
    // Find the first summary row index for AI guidance
    const firstSummaryRowIndex = findFirstSummaryRowIndexFromCSV(sheetData);
    
    console.log('Generated CSV data from real Google Sheets:', sheetData.substring(0, 200) + '...');
    console.log(`First summary row index: ${firstSummaryRowIndex}`);
    
    // Call the AI prompt with cleaned transcript and sheet data
    const { text } = await sheetUpdatePrompt({
      transcript: cleanedTranscript,
      sheetData,
      firstSummaryRowIndex,
      sheetName
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
          
          console.log(`First summary row index: ${firstSummaryRowIndex}`);
          
          for (const action of parsed.actions) {
            try {
              if (action.type === 'insertRow') {
                // Validate insert row position
                if (action.row >= firstSummaryRowIndex) {
                  console.error(`Skipping insertRow at row ${action.row}: must be before first summary row ${firstSummaryRowIndex}`);
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