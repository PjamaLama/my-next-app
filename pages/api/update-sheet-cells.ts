import type { NextApiRequest, NextApiResponse } from 'next';
import { CellUpdateEngine, CellUpdate, CellUpdateOptions } from '../../lib/cellUpdateEngine';
import { createLogger } from '../../lib/logger';

const logger = createLogger('api/update-sheet-cells');

interface CellUpdateRequest {
  spreadsheetId: string;
  updates: CellUpdate[];
  options?: CellUpdateOptions;
}

interface CellUpdateResponse {
  success: boolean;
  updatedCells: number;
  failedCells: number;
  errors: Array<{ cell: string; sheetName: string; error: string }>;
  details?: {
    processedSheets: number;
    totalSheets: number;
    processingTime: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CellUpdateResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      updatedCells: 0,
      failedCells: 0,
      errors: [{ cell: 'N/A', sheetName: 'N/A', error: 'Method not allowed' }]
    });
  }

  const startTime = Date.now();

  try {
    const { spreadsheetId, updates, options }: CellUpdateRequest = req.body;

    // Validate request
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Missing required field: spreadsheetId'
        }]
      });
    }

    if (!Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Updates must be an array'
        }]
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Updates array cannot be empty'
        }]
      });
    }

    // Validate updates array content
    const validationErrors: Array<{ cell: string; sheetName: string; error: string }> = [];
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update || typeof update !== 'object') {
        validationErrors.push({
          cell: `index_${i}`,
          sheetName: 'N/A',
          error: `Invalid update object at index ${i}`
        });
        continue;
      }
      if (!update.sheetName || !update.cell || update.value === undefined) {
        validationErrors.push({
          cell: update.cell || `index_${i}`,
          sheetName: update.sheetName || 'N/A',
          error: `Missing required fields: sheetName, cell, and value are required`
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        updatedCells: 0,
        failedCells: updates.length,
        errors: validationErrors
      });
    }

    logger.info('Processing cell update request', {
      spreadsheetId,
      updateCount: updates.length,
      sheets: [...new Set(updates.map(u => u.sheetName))],
      options
    });

    // Initialize the cell update engine
    const engine = new CellUpdateEngine();

    // Process the updates
    const result = await engine.updateCells({
      spreadsheetId,
      updates,
      options: {
        atomic: false, // Default to non-atomic for backward compatibility
        validateFormulas: false,
        ...options
      }
    });

    const processingTime = Date.now() - startTime;
    const processedSheets = new Set(updates.map(u => u.sheetName)).size;
    const totalSheets = processedSheets;

    logger.info('Cell update request completed', {
      success: result.success,
      updatedCells: result.updatedCells,
      failedCells: result.failedCells,
      processingTime
    });

    // Determine HTTP status code based on results
    let statusCode = 200;
    if (!result.success) {
      statusCode = result.failedCells === updates.length ? 400 : 207; // 207 = Multi-Status for partial success
    }

    return res.status(statusCode).json({
      ...result,
      details: {
        processedSheets,
        totalSheets,
        processingTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error('Critical error in cell update API', error);

    return res.status(500).json({
      success: false,
      updatedCells: 0,
      failedCells: req.body?.updates?.length || 0,
      errors: [{
        cell: 'N/A',
        sheetName: 'N/A',
        error: error instanceof Error ? error.message : 'Internal server error'
      }],
      details: {
        processedSheets: 0,
        totalSheets: 0,
        processingTime
      }
    });
  }
}
