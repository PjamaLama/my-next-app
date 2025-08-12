import { NextApiRequest, NextApiResponse } from 'next';

const TOOL_REGISTRY = [
  { name: 'generate_report', label: 'Generate Report', description: 'Build an in-depth report across selected sheets (tables, charts, insights).' },
  { name: 'update_sheet', label: 'Update Sheet', description: 'Add or modify rows and cells using natural language.' },
  { name: 'upsert_row', label: 'Upsert Row', description: 'Update a row matching a key (e.g., Date) or insert a new row if not found.' },
  { name: 'update_single_cell', label: 'Update Cell', description: 'Directly set a single cell value (e.g., B12 to 123).' },
  { name: 'get_sheet_data', label: 'Get Sheet Data', description: 'Fetch rows from a specific sheet.' },
  { name: 'convert_unstructured_sheet', label: 'Convert Sheet', description: 'Convert unstructured sheet to structured headers + rows.' },
  { name: 'analyze_files', label: 'Analyze Files', description: 'Use AI to analyze PDFs and other files.' },
  { name: 'analyze_images', label: 'Analyze Images', description: 'Use AI to analyze images/photos.' },
  { name: 'extract_data_from_files', label: 'Extract Data from Files', description: 'Extract structured data from files and update the sheet.' },
  { name: 'extract_text_only', label: 'Extract Text Only', description: 'OCR or PDF text extraction without AI analysis.' },
  { name: 'apply_structured_rows', label: 'Apply Structured Rows', description: 'Apply already-structured rows into selected sheets using orchestrated ingest.' },
  { name: 'bulk_update_column', label: 'Bulk Update Column', description: 'Transform a column across all rows (add, subtract, multiply, divide, or set values).' },
  { name: 'resolve_column', label: 'Resolve Column', description: 'Resolve a header name to its column letter and index.' },
  { name: 'get_used_range', label: 'Get Used Range', description: 'Get an approximate used range (end column and last data row).' },
  { name: 'preview_column_operation', label: 'Preview Column Operation', description: 'Preview math ops on a column (sample, counts) before applying.' },
  { name: 'apply_column_operation', label: 'Apply Column Operation', description: 'Apply math ops on a column in batches with guardrails.' },
  { name: 'insert_formula_range', label: 'Insert Formula', description: 'Insert formulas across a range (ARRAYFORMULA or fill).' },
  { name: 'detect_formulas', label: 'Detect Formulas', description: 'List cells with formulas in a range.' },
  { name: 'bake_formulas_to_values', label: 'Bake Formulas', description: 'Replace formulas in a range with their computed values.' },
  { name: 'text_transform_column', label: 'Text Transform', description: 'Trim/upper/lower/title/regex transforms into a target column.' },
  { name: 'compute_column_from_expression', label: 'Compute Column', description: 'Create a new column from a header-referenced expression (e.g., {Qty}*{Price}).' },
  { name: 'get_current_datetime', label: 'Current Date/Time', description: 'Returns the current date/time in multiple formats for use in date/time columns.' }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ tools: TOOL_REGISTRY });
}


