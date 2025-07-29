
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

Your task is to analyze the files and extract the requested information in a structured JSON format. The JSON should have a clear, hierarchical structure. Do not include any explanations, just the raw JSON.

Example output:
{
  "extracted_data": [
    { "field": "Invoice Number", "value": "12345" },
    { "field": "Amount Due", "value": "$500.00" }
  ]
}

Note: Since the files are provided as base64 data, you should analyze the content based on the user's request and provide structured data extraction.`;

      try {
        console.log('Attempting to generate content with Genkit model...');
        
        // Use the Genkit instance to generate content
        const { text } = await ai.generate(fullPrompt);
        
        console.log('Genkit model generation successful.');

        if (!text) {
          throw new Error('No output from model');
        }
        
        const output = text;
        
        try {
          // Attempt to parse the output as JSON. If it's already an object, this will just return it.
          // If it's a string, it will parse it.
          return typeof output === 'string' ? JSON.parse(output) : output;
        } catch (parseError) {
          console.error('Failed to parse model output as JSON:', parseError);
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
