import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Enable Next.js body parsing for JSON
export const config = {
  api: {
    bodyParser: true, // Enable JSON body parsing
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const { files } = req.body; // Expecting files array in the request body

  if (!Array.isArray(files)) {
    return res.status(400).json({ error: 'Invalid request body: "files" array is missing or malformed.' });
  }

  const structuredExtracts: any[] = [];

  for (const file of files) {
    const { fileName, mimeType, data } = file; // data is base64 string

    if (!fileName || !mimeType || !data) {
      console.warn('Skipping malformed file entry:', file);
      continue;
    }

    try {
      const fileBuffer = Buffer.from(data, 'base64'); // Decode base64 to Buffer

      const imagePart = {
        inlineData: {
          data: fileBuffer.toString('base64'), // Gemini still expects base64 string here
          mimeType: mimeType,
        },
      };

      const prompt = `Extract structured data from this file content (text/image/PDF). Output as JSON array of objects with keys like date, vendor, amount, category, details. Infer categories (e.g., Food, Fuel, Accommodation). Normalize dates to YYYY-MM-DD, amounts to numbers.`;

      try {
        const result = await model.generateContent([prompt, imagePart]);
        const response = result.response;
        const text = response.text();

        let parsedData;
        try {
          const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            parsedData = JSON.parse(jsonMatch[1]);
          } else {
            parsedData = JSON.parse(text);
          }
        } catch (jsonError) {
          console.error('Failed to parse Gemini JSON response:', jsonError);
          console.error('Gemini raw text response:', text);
          parsedData = { rawText: text };
        }

        structuredExtracts.push({
          fileName: fileName,
          mimeType: mimeType,
          extractedData: parsedData,
        });

      } catch (geminiError) {
        console.error(`Error processing file ${fileName} with Gemini:`, geminiError);
        structuredExtracts.push({
          fileName: fileName,
          mimeType: mimeType,
          extractedData: { rawContent: data }, // Store original base64 if Gemini fails
          error: (geminiError as Error).message,
        });
      }
    } catch (bufferError) {
      console.error(`Error decoding base64 for file ${fileName}:`, bufferError);
      structuredExtracts.push({
        fileName: fileName,
        mimeType: mimeType,
        extractedData: { rawContent: data },
        error: (bufferError as Error).message,
      });
    }
  }

  return res.status(200).json({ structuredExtracts });
}
