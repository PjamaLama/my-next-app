
import { genkit } from 'genkit';
import { z } from 'zod';
import { gemini15Flash, googleAI } from '@genkit-ai/googleai';

export const analyzeFileFlow = (apiKey: string) => {
  // Configure Genkit instance with Google AI plugin and the provided API key
  const ai = genkit({
    plugins: [googleAI({ apiKey })],
    model: gemini15Flash,
  });

  return ai.defineFlow(
    {
      name: 'analyzeFileFlow',
      inputSchema: z.object({
        prompt: z.string(),
        files: z.array(z.object({
          data: z.string(), // base64
          mimeType: z.string(),
        })),
      }),
      outputSchema: z.any(),
    },
    async ({ prompt, files }) => {
      const fullPrompt = `You are an expert data analyst. A user has uploaded ${files.length} file(s) and asked the following:

"${prompt}"

File information:
${files.map((file, index) => `File ${index + 1}: ${file.mimeType} (${file.data.length} characters of base64 data)`).join('\n')}

Your task is to analyze the files and extract the requested information in a structured JSON format. 

IMPORTANT INSTRUCTIONS:
1. You CAN and SHOULD process PDF files. The base64 data contains the file content.
2. Return ONLY raw JSON without any markdown formatting, code blocks, or explanations.
3. Do not wrap your response in \`\`\`json\`\`\` blocks.
4. Do not include any text outside the JSON structure.
5. If you cannot extract specific data, return an empty array but still return valid JSON.

Example output format (return exactly like this, no markdown):
{
  "extracted_data": [
    { "field": "Invoice Number", "value": "12345" },
    { "field": "Amount Due", "value": "$500.00" }
  ]
}

Analyze the file content and extract relevant data in JSON format.`;

      try {
        console.log('Attempting to generate content with Genkit model...');
        console.log('Prompt length:', fullPrompt.length);
        console.log('Files to process:', files.length);
        
        // Use the Genkit instance to generate content
        const { text } = await ai.generate(fullPrompt);
        
        console.log('Genkit model generation successful.');
        console.log('Response length:', text?.length || 0);
        console.log('Response preview:', text?.substring(0, 200) || 'No response');

        if (!text) {
          throw new Error('No output from model');
        }
        
        const output = text;
        
        try {
          // Clean up the output to remove markdown formatting if present
          let cleanedOutput = output;
          
          // Remove markdown code blocks if present
          if (cleanedOutput.includes('```json')) {
            cleanedOutput = cleanedOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          }
          
          // Remove any leading/trailing whitespace
          cleanedOutput = cleanedOutput.trim();
          
          // Attempt to parse the cleaned output as JSON
          return typeof cleanedOutput === 'string' ? JSON.parse(cleanedOutput) : cleanedOutput;
        } catch (parseError) {
          console.error('Failed to parse model output as JSON:', parseError);
          console.error('Raw output:', output);
          
          // If parsing fails, return a structured error indicating the raw output
          return {
            error: 'Model output was not valid JSON',
            rawOutput: output,
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          };
        }
      } catch (error) {
        console.error('Error during model generation in analyzeFileFlow:', error);
        throw error;
      }
    }
  );
};
