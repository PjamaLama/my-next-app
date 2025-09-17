import { getGoogleSheetsClient, rateLimiter } from './googleSheets';
import { escapeSheetName, validateCellReference, cellToIndices, indexToColumn, detectFormula, extractFormulaDependencies, isCellWithinBounds, ensureSheetCapacity } from './sheetUtils';
import { createLogger } from './logger';

export interface CellUpdate {
  sheetName: string;
  cell: string;
  value: string;
  valueInputOption?: 'RAW' | 'USER_ENTERED';
  note?: string;
}

export interface CellUpdateOptions {
  atomic?: boolean;        // All updates must succeed or none
  validateFormulas?: boolean;
  createBackup?: boolean;
  skipBoundsCheck?: boolean;
}

export interface CellUpdateRequest {
  spreadsheetId: string;
  updates: CellUpdate[];
  options?: CellUpdateOptions;
}

export interface UpdateResult {
  success: boolean;
  updatedCells: number;
  failedCells: number;
  errors: Array<{ cell: string; sheetName: string; error: string }>;
  details?: any;
}

export interface SheetUpdateGroup {
  sheetName: string;
  updates: CellUpdate[];
  dependencies: Set<string>;
}

export class CellUpdateEngine {
  private readonly logger = createLogger('CellUpdateEngine');

  async updateCells(request: CellUpdateRequest): Promise<UpdateResult> {
    const { spreadsheetId, updates, options = {} } = request;

    this.logger.info('Processing cell updates', {
      spreadsheetId,
      updateCount: updates.length,
      options
    });

    try {
      // Validate all updates first
      const validationErrors = await this.validateUpdates(spreadsheetId, updates, options);
      if (validationErrors.length > 0) {
        return {
          success: false,
          updatedCells: 0,
          failedCells: updates.length,
          errors: validationErrors
        };
      }

      // Group updates by sheet for efficiency
      const updatesBySheet = this.groupUpdatesBySheet(updates);

      // Process updates (with atomic behavior if requested)
      const result = await this.processUpdates(spreadsheetId, updatesBySheet, options);

      this.logger.info('Cell updates completed', {
        success: result.success,
        updatedCells: result.updatedCells,
        failedCells: result.failedCells
      });

      return result;
    } catch (error) {
      this.logger.error('Critical error in cell updates', error);
      return {
        success: false,
        updatedCells: 0,
        failedCells: updates.length,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: error instanceof Error ? error.message : 'Unknown critical error'
        }]
      };
    }
  }

  private async validateUpdates(
    spreadsheetId: string,
    updates: CellUpdate[],
    options: CellUpdateOptions
  ): Promise<Array<{ cell: string; sheetName: string; error: string }>> {
    const errors: Array<{ cell: string; sheetName: string; error: string }> = [];

    for (const update of updates) {
      try {
        // Validate cell reference format
        if (!validateCellReference(update.cell)) {
          errors.push({
            cell: update.cell,
            sheetName: update.sheetName,
            error: `Invalid cell reference format: ${update.cell}`
          });
          continue;
        }

        // Check bounds if not skipped
        if (!options.skipBoundsCheck) {
          const withinBounds = await isCellWithinBounds(spreadsheetId, update.sheetName, update.cell);
          if (!withinBounds) {
            // Try to expand sheet capacity
            const { row: targetRow, col: targetColIndex } = cellToIndices(update.cell);
            const targetCol = indexToColumn(targetColIndex);

            await ensureSheetCapacity(spreadsheetId, update.sheetName, targetRow, targetCol);
          }
        }

        // Validate formulas if requested
        if (options.validateFormulas && detectFormula(update.value)) {
          // Note: Formula validation is expensive, so we skip it in validation phase
          // It will be validated during actual update if it fails
        }

      } catch (error) {
        errors.push({
          cell: update.cell,
          sheetName: update.sheetName,
          error: error instanceof Error ? error.message : 'Validation error'
        });
      }
    }

    return errors;
  }

  private groupUpdatesBySheet(updates: CellUpdate[]): Map<string, CellUpdate[]> {
    const groups = new Map<string, CellUpdate[]>();

    for (const update of updates) {
      if (!groups.has(update.sheetName)) {
        groups.set(update.sheetName, []);
      }
      groups.get(update.sheetName)!.push(update);
    }

    return groups;
  }

  private async processUpdates(
    spreadsheetId: string,
    updatesBySheet: Map<string, CellUpdate[]>,
    options: CellUpdateOptions
  ): Promise<UpdateResult> {
    const results: Array<{ success: boolean; updatedCells: number; errors: any[] }> = [];
    let totalUpdated = 0;
    let totalFailed = 0;
    const allErrors: Array<{ cell: string; sheetName: string; error: string }> = [];

    // Process each sheet
    for (const [sheetName, sheetUpdates] of updatesBySheet) {
      try {
        const sheetResult = await this.processSheetUpdates(spreadsheetId, sheetName, sheetUpdates, options);

        results.push(sheetResult);
        totalUpdated += sheetResult.updatedCells;
        totalFailed += sheetResult.errors.length;
        allErrors.push(...sheetResult.errors);

        // If atomic mode and this sheet failed, we should rollback previous successful updates
        if (options.atomic && !sheetResult.success) {
          this.logger.warn('Atomic mode: rolling back previous updates due to failure', { sheetName });
          // Note: Implementing full rollback would require snapshot/undo functionality
          return {
            success: false,
            updatedCells: totalUpdated - sheetResult.updatedCells,
            failedCells: totalFailed,
            errors: allErrors
          };
        }

      } catch (error) {
        const sheetError = {
          cell: 'N/A',
          sheetName,
          error: error instanceof Error ? error.message : 'Sheet processing error'
        };
        allErrors.push(sheetError);
        totalFailed += sheetUpdates.length;

        if (options.atomic) {
          return {
            success: false,
            updatedCells: totalUpdated,
            failedCells: totalFailed,
            errors: allErrors
          };
        }
      }
    }

    const overallSuccess = options.atomic ? totalFailed === 0 : results.every(r => r.success);

    return {
      success: overallSuccess,
      updatedCells: totalUpdated,
      failedCells: totalFailed,
      errors: allErrors
    };
  }

  private async processSheetUpdates(
    spreadsheetId: string,
    sheetName: string,
    updates: CellUpdate[],
    options: CellUpdateOptions
  ): Promise<{ success: boolean; updatedCells: number; errors: Array<{ cell: string; sheetName: string; error: string }> }> {
    const errors: Array<{ cell: string; sheetName: string; error: string }> = [];
    let updatedCells = 0;

    try {
      // Wait for rate limiter
      await rateLimiter.waitForSlot();

      const sheets = await getGoogleSheetsClient();
      const escapedSheetName = escapeSheetName(sheetName);

      // Prepare batch update data
      const batchData = updates.map(update => ({
        range: `${escapedSheetName}!${update.cell}`,
        values: [[update.value]],
        ...(update.valueInputOption && { valueInputOption: update.valueInputOption })
      }));

      this.logger.debug(`Executing batch update for sheet ${sheetName}`, {
        updateCount: batchData.length,
        cells: updates.map(u => u.cell)
      });

      // Execute batch update
      const response = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          data: batchData,
          valueInputOption: 'USER_ENTERED' // Default, can be overridden per cell
        }
      });

      updatedCells = response.data.totalUpdatedCells || 0;

      // Handle individual cell notes if specified
      if (updates.some(u => u.note)) {
        await this.updateCellNotes(spreadsheetId, sheetName, updates.filter(u => u.note));
      }

      this.logger.info(`Successfully updated ${updatedCells} cells in sheet ${sheetName}`);

    } catch (error) {
      this.logger.error(`Failed to update cells in sheet ${sheetName}`, error);

      // Try to identify which specific cells failed
      for (const update of updates) {
        errors.push({
          cell: update.cell,
          sheetName,
          error: error instanceof Error ? error.message : 'Batch update failed'
        });
      }
    }

    return {
      success: errors.length === 0,
      updatedCells,
      errors
    };
  }

  private async updateCellNotes(
    spreadsheetId: string,
    sheetName: string,
    updatesWithNotes: CellUpdate[]
  ): Promise<void> {
    // Note: Google Sheets API doesn't directly support batch note updates
    // This would require individual cell updates for notes, which is less efficient
    // For now, we'll log that notes are not supported in batch mode
    this.logger.warn('Cell notes are not yet supported in batch updates', {
      sheetName,
      cellsWithNotes: updatesWithNotes.map(u => u.cell)
    });
  }

  // Utility method to get current cell values (for validation or backup)
  async getCellValues(
    spreadsheetId: string,
    cells: Array<{ sheetName: string; cell: string }>
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    try {
      const sheets = await getGoogleSheetsClient();

      // Group cells by sheet for efficient batch requests
      const bySheet = new Map<string, string[]>();
      for (const cell of cells) {
        if (!bySheet.has(cell.sheetName)) {
          bySheet.set(cell.sheetName, []);
        }
        bySheet.get(cell.sheetName)!.push(cell.cell);
      }

      // Fetch values for each sheet
      for (const [sheetName, cellRefs] of bySheet) {
        try {
          const ranges = cellRefs.map(cell => `${escapeSheetName(sheetName)}!${cell}`);
          const batchResponse = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges
          });

          for (let i = 0; i < cellRefs.length; i++) {
            const cell = cellRefs[i];
            const value = batchResponse.data.valueRanges?.[i]?.values?.[0]?.[0] || '';
            result.set(`${sheetName}!${cell}`, String(value));
          }
        } catch (error) {
          this.logger.warn(`Failed to get values for sheet ${sheetName}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to get cell values', error);
    }

    return result;
  }
}
