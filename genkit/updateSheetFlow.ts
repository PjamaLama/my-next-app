import { genkit } from 'genkit';
import { gemini15Flash, googleAI } from '@genkit-ai/googleai';
import { db } from '../app/providers/FirebaseProvider';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
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

// Helper function to convert Firestore data to CSV format
const buildSheetDataCSV = (firestoreRows: any[]): string => {
  if (firestoreRows.length === 0) {
    return '';
  }

  // Sort by row index to maintain order
  const sortedRows = firestoreRows.sort((a, b) => a.rowIndex - b.rowIndex);
  
  // Extract all unique column names (excluding metadata fields)
  const metadataFields = ['rowIndex', 'isSummary', 'sheetName'];
  const allColumns = new Set<string>();
  
  sortedRows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!metadataFields.includes(key)) {
        allColumns.add(key);
      }
    });
  });
  
  const columnNames = Array.from(allColumns).sort();
  
  // Build CSV header
  const csvRows = [columnNames.join(',')];
  
  // Build CSV data rows
  sortedRows.forEach(row => {
    const csvRow = columnNames.map(col => {
      const value = row[col] || '';
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(csvRow.join(','));
  });
  
  return csvRows.join('\n');
};

// Helper function to find the first summary row index
const findFirstSummaryRowIndex = (firestoreRows: any[]): number => {
  // Find the first row with isSummary flag
  const firstSummaryRow = firestoreRows.find(row => row.isSummary === true);
  
  if (firstSummaryRow) {
    return firstSummaryRow.rowIndex;
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
    
    const { transcript, sheetId, sheetName = 'Sheet1', commit = false } = input;
    
    // Clean and improve the transcript
    const cleanedTranscript = await cleanTranscript(transcript);
    console.log('Original transcript:', transcript);
    console.log('Cleaned transcript:', cleanedTranscript);
    
    // Read from Firestore mirror
    let firestoreCollectionPath: string;
    if (sheetName) {
      // Use tab-specific collection if sheet name is provided
      firestoreCollectionPath = `sheets/${sheetId}/tabs/${sheetName}/rows`;
    } else {
      // Use main rows collection
      firestoreCollectionPath = `sheets/${sheetId}/rows`;
    }
    
    const rowsCollectionRef = collection(db, firestoreCollectionPath);
    const rowsQuery = query(rowsCollectionRef, orderBy('rowIndex'));
    const rowsSnapshot = await getDocs(rowsQuery);
    
    const firestoreRows = rowsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Found ${firestoreRows.length} rows in Firestore for sheet ${sheetId}`);
    
    // Build CSV data from Firestore
    const sheetData = buildSheetDataCSV(firestoreRows);
    
    // Find the first summary row index for AI guidance
    const firstSummaryRowIndex = findFirstSummaryRowIndex(firestoreRows);
    
    console.log('Generated CSV data:', sheetData);
    console.log(`First summary row index: ${firstSummaryRowIndex}`);
    
    // Call the AI prompt with cleaned transcript and sheet data
    const { text } = await sheetUpdatePrompt({
      transcript: cleanedTranscript,
      sheetData,
      firstSummaryRowIndex
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
          
          // Find the first summary row index for validation
          const firstSummaryRowIndex = findFirstSummaryRowIndex(firestoreRows);
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
                  sheet: action.sheet,
                  row: action.row
                });
                executedCount++;
              } else if (action.type === 'updateCell') {
                console.log(`Executing updateCell: ${action.sheet}, ${action.column}${action.row} = "${action.value}"`);
                await updateCell({
                  sheet: action.sheet,
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