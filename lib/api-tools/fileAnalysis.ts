import { NextApiResponse } from 'next';
// import { analyzeFileFlow } from '@/genkit/analyzeFileFlow'; // Commented out - Genkit integration removed
import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { ensureSheetCapacity, escapeSheetName } from '@/lib/sheetUtils';

type ImageData = { data: string; mimeType: string; name?: string };
type Context = { spreadsheetId?: string; sheetName?: string; sheetNames?: string[]; [key: string]: unknown };

export function formatAnalysesAsMarkdown(analyses: Array<{ index: number; type: string; analysis: unknown; success: boolean; error?: string; extractedData?: unknown }>): string {
  if (!analyses || analyses.length === 0) {
    return 'No analysis results to display.';
  }
  let markdown = '| File | Type | Analysis | Extracted Data |\n';
  markdown += '|---|---|---|---|\n';
  for (const analysis of analyses) {
    const extractedData = analysis.extractedData ? `\`\`\`json\n${JSON.stringify(analysis.extractedData, null, 2)}\n\`\`\`` : 'None';
    markdown += `| ${analysis.index} | ${analysis.type} | ${analysis.analysis} | ${extractedData} |\n`;
  }
  return markdown;
}

export function formatExtractionsAsMarkdown(extractions: Array<{ index: number; type: string; success: boolean; error?: string; extractedText?: string; textLength?: number }>): string {
  let markdown = '| File | Type | Status | Text Length |\n|---|---|---|---|\n';
  extractions.forEach(extraction => {
    const status = extraction.success ? '✅ Success' : '❌ Failed';
    const textLength = extraction.success ? extraction.textLength || 0 : 'N/A';
    markdown += `| ${extraction.index} | ${extraction.type} | ${status} | ${textLength} |\n`;
  });
  return markdown;
}

// export async function handleAnalyzeImages(args: any, images: ImageData[], apiKey: string, res: NextApiResponse) {
//   // Commented out - Genkit integration removed, system now uses N8N
//   try {
//     const { transcript } = args;
//     if (!images || images.length === 0) {
//       return res.status(400).json({ success: false, error: 'Files are required for analysis' });
//     }
//     const analysisResults: Array<{ index: number; type: string; analysis: string; success: boolean; error?: string; extractedData?: unknown }>= [];
//     await Promise.allSettled(images.map(async (image, idx) => {
//       try {
//         const flow = analyzeFileFlow(apiKey);
//         const result = await flow.run({ prompt: transcript || 'Analyze this file', files: [image] });
//         analysisResults.push({ index: idx + 1, type: image.mimeType, analysis: 'Analysis complete', success: true, extractedData: result });
//       } catch (error) {
//         let errorMessage = 'Analysis failed';
//         if (error instanceof Error) {
//           if (error.message.includes('503') || error.message.includes('rate limit')) errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
//           else if (error.message.includes('429') || error.message.includes('rate limit')) errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
//           else if (error.message.includes('quota exceeded')) errorMessage = 'AI service quota exceeded. Please check your API key limits.';
//           else errorMessage = error.message;
//         }
//         analysisResults.push({ index: idx + 1, type: image.mimeType, analysis: 'Analysis failed', success: false, error: errorMessage });
//       }
//     }));
//     const successfulAnalyses = analysisResults.filter(r => !r.error).length;
//     const summary = `Successfully analyzed ${successfulAnalyses} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}`;
//     return res.status(200).json({ success: true, result: summary + "\n\n" + formatAnalysesAsMarkdown(analysisResults), analyses: analysisResults, summary: { total: images.length, successful: successfulAnalyses, failed: images.length - successfulAnalyses, types: Array.from(new Set(images.map(img => img.mimeType))) } });
//   } catch (error) {
//     let errorMessage = 'Failed to analyze images';
//     if (error instanceof Error) {
//       if (error.message.includes('503') || error.message.includes('overloaded')) errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
//       else if (error.message.includes('429') || error.message.includes('rate limit')) errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
//       else errorMessage = error.message;
//     }
//     return res.status(500).json({ success: false, error: errorMessage, details: error instanceof Error ? error.message : String(error) });
//   }
// }

// export async function handleExtractDataFromImages(args: any, context: Context, images: ImageData[], apiKey: string, res: NextApiResponse) {
//   // Commented out - Genkit integration removed, system now uses N8N
//   try {
//     const { transcript } = args;
//     const { spreadsheetId, sheetName, sheetNames } = context;
//     if (!images || images.length === 0) {
//       return res.status(400).json({ success: false, error: 'Files are required for data extraction' });
//     }
//     const targetSheetName = sheetName || (Array.isArray(sheetNames) && sheetNames.length > 0 ? sheetNames[0] : null);
//     if (!spreadsheetId || (!targetSheetName && (!Array.isArray(sheetNames) || sheetNames.length === 0))) {
//       return res.status(400).json({ success: false, error: 'Spreadsheet ID and at least one sheet name are required for data extraction' });
//     }
//     const analysisResults: Array<{ index: number; type: string; analysis: unknown; success: boolean; error?: string; extractedData?: unknown }>= [];
//     for (let i = 0; i < images.length; i++) {
//       const image = images[i];
//       try {
//         const flow = analyzeFileFlow(apiKey);
//       } catch (analysisError) {
//         let errorMessage = 'Unknown error during analysis';
//         if (analysisError instanceof Error) {
//           if (analysisError.message.includes('503') || analysisError.message.includes('overloaded')) errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
//           else if (analysisError.message.includes('429') || analysisError.message.includes('rate limit')) errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
//           else if (analysisError.message.includes('quota exceeded')) errorMessage = 'AI service quota exceeded. Please check your API key limits.';
//           else errorMessage = analysisError.message;
//         }
//         analysisResults.push({ index: i + 1, type: image.mimeType, analysis: null, success: false, error: errorMessage });
//       }
//     }
//     // Function body commented out for brevity - Genkit integration removed
//     return res.status(500).json({ success: false, error: 'Function not implemented - Genkit integration removed' });
//   } catch (error) {
//     let errorMessage = 'Failed to extract data from images';
//     if (error instanceof Error) {
//       if (error.message.includes('503') || error.message.includes('overloaded')) errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
//       else if (error.message.includes('429') || error.message.includes('rate limit')) errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
//       else errorMessage = error.message;
//     }
//     return res.status(500).json({ success: false, error: errorMessage, details: error instanceof Error ? error.message : String(error) });
//   }
// }

export async function handleExtractTextOnly(args: any, images: ImageData[], res: NextApiResponse) {
  try {
    if (!images || images.length === 0) {
      return res.status(400).json({ success: false, error: 'Files are required for text extraction' });
    }
    const extractionResults: Array<{ index: number; type: string; success: boolean; error?: string; extractedText?: string; textLength?: number; structured?: Array<Record<string, unknown>> }>= [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        let extractedText = '';
        if (image.mimeType === 'application/pdf') {
          const pdf = (await import('pdf-parse')).default;
          const buffer = Buffer.from(image.data, 'base64');
          const pdfData = await pdf(buffer);
          extractedText = pdfData.text || 'No text could be extracted from the PDF';
        } else if (image.mimeType.startsWith('image/')) {
          const Tesseract = (await import('tesseract.js')).default;
          const { data: { text } } = await Tesseract.recognize(`data:image/jpeg;base64,${image.data}`, 'eng', { logger: () => {} });
          extractedText = text;
        } else {
          extractedText = 'Unknown file type - cannot extract text';
        }
        let structured: Array<Record<string, unknown>> | undefined;
        try {
          // TODO: Migrate to n8n if needed
        } catch {}
        extractionResults.push({ index: i + 1, type: image.mimeType, success: true, extractedText, textLength: extractedText.length, structured });
      } catch (error) {
        extractionResults.push({ index: i + 1, type: image.mimeType, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    const successfulExtractions = extractionResults.filter(r => r.success).length;
    const summary = `Successfully extracted text from ${successfulExtractions} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}`;
    return res.status(200).json({ success: true, result: summary + "\n\n" + formatExtractionsAsMarkdown(extractionResults), extractions: extractionResults, summary: { total: images.length, successful: successfulExtractions, failed: images.length - successfulExtractions, types: Array.from(new Set(images.map(img => img.mimeType))) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to extract text from files', details: error instanceof Error ? error.message : String(error) });
  }
}


