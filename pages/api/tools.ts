import { NextApiRequest, NextApiResponse } from 'next';

const TOOL_REGISTRY = [
  { name: 'generate_report', label: 'Generate Report', description: 'Build an in-depth report across selected sheets (tables, charts, insights).' },
  { name: 'update_sheet', label: 'Update Sheet', description: 'Add or modify rows and cells using natural language.' },
  { name: 'update_single_cell', label: 'Update Cell', description: 'Directly set a single cell value (e.g., B12 to 123).' },
  { name: 'get_sheet_data', label: 'Get Sheet Data', description: 'Fetch rows from a specific sheet.' },
  { name: 'convert_unstructured_sheet', label: 'Convert Sheet', description: 'Convert unstructured sheet to structured headers + rows.' },
  { name: 'analyze_files', label: 'Analyze Files', description: 'Use AI to analyze PDFs and other files.' },
  { name: 'analyze_images', label: 'Analyze Images', description: 'Use AI to analyze images/photos.' },
  { name: 'extract_data_from_files', label: 'Extract Data from Files', description: 'Extract structured data from files and update the sheet.' },
  { name: 'extract_text_only', label: 'Extract Text Only', description: 'OCR or PDF text extraction without AI analysis.' }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ tools: TOOL_REGISTRY });
}


