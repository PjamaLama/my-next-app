import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/save-sheet-data-multi';

// Mock the dependencies
jest.mock('../../lib/googleSheets', () => ({
  getGoogleSheetsClient: jest.fn(),
}));

jest.mock('../../lib/sheetUtils', () => ({
  escapeSheetName: jest.fn(),
  parseCell: jest.fn(),
  ensureSheetCapacity: jest.fn(),
}));

// Mock NextApiResponse
const mockJson = jest.fn();
const mockStatus = jest.fn(() => ({
  json: mockJson,
}));
const mockRes: Partial<NextApiResponse> = {
  status: mockStatus,
  json: mockJson,
};

const { getGoogleSheetsClient } = require('../../lib/googleSheets');
const { escapeSheetName, parseCell, ensureSheetCapacity } = require('../../lib/sheetUtils');

describe('/api/save-sheet-data-multi', () => {
  let mockSheets: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSheets = {
      spreadsheets: {
        values: {
          batchUpdate: jest.fn(),
        },
      },
    };

    getGoogleSheetsClient.mockResolvedValue(mockSheets);
    escapeSheetName.mockImplementation((name: string) => name);
    ensureSheetCapacity.mockResolvedValue(undefined);

    mockReq = {
      method: 'POST',
      body: {},
    };
  });

  describe('Method validation', () => {
    it('should return 405 for non-POST methods', async () => {
      mockReq.method = 'GET';

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(405);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
  });

  describe('Request validation', () => {
    it('should return 400 if spreadsheetId is missing', async () => {
      mockReq.body = { updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test' }] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing spreadsheetId or updates array',
      });
    });

    it('should return 400 if updates is not an array', async () => {
      mockReq.body = { spreadsheetId: '123', updates: 'not an array' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing spreadsheetId or updates array',
      });
    });

    it('should return 400 if updates array is empty', async () => {
      mockReq.body = { spreadsheetId: '123', updates: [] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Missing spreadsheetId or updates array',
      });
    });
  });

  describe('Update processing', () => {
    it('should skip invalid updates', async () => {
      parseCell.mockReturnValueOnce({ column: 'A', row: 1 });
      parseCell.mockReturnValueOnce(null); // Invalid cell

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'invalid', value: 'test2' }, // Invalid cell
          { sheetName: '', cell: 'B1', value: 'test3' }, // Missing sheetName - should not call parseCell
        ],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({
        data: { totalUpdatedCells: 1 },
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(parseCell).toHaveBeenCalledWith('A1');
      expect(parseCell).toHaveBeenCalledWith('invalid');
      expect(parseCell).toHaveBeenCalledTimes(2); // Only called for first two updates
      expect(mockSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledTimes(1);
    });

    it('should parse cell references correctly', async () => {
      parseCell.mockReturnValueOnce({ column: 'A', row: 1 });
      parseCell.mockReturnValueOnce({ column: 'B', row: 2 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'B2', value: 'test2' },
        ],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({
        data: { totalUpdatedCells: 2 },
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(parseCell).toHaveBeenCalledWith('A1');
      expect(parseCell).toHaveBeenCalledWith('B2');
      expect(ensureSheetCapacity).toHaveBeenCalledWith('test-spreadsheet', 'Sheet1', 2, 'B');
    });

    it('should group updates by sheet name', async () => {
      parseCell.mockReturnValue({ column: 'A', row: 1 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet2', cell: 'A1', value: 'test2' },
          { sheetName: 'Sheet1', cell: 'A2', value: 'test3' },
        ],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({
        data: { totalUpdatedCells: 1 },
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledTimes(2);
      expect(ensureSheetCapacity).toHaveBeenCalledTimes(2);
    });
  });

  describe('Batch update execution', () => {
    beforeEach(() => {
      parseCell.mockReturnValue({ column: 'A', row: 1 });
    });

    it('should execute batch update with correct parameters', async () => {
      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'A2', value: 'test2' },
        ],
      };

      const mockResponse = {
        data: { totalUpdatedCells: 2 },
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue(mockResponse);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        requestBody: {
          data: [
            { range: 'Sheet1!A1', values: [['test1']] },
            { range: 'Sheet1!A2', values: [['test2']] },
          ],
          valueInputOption: 'USER_ENTERED',
        },
      });
    });

    it('should handle timeout for batch updates', async () => {
      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test1' }],
      };

      // Mock a delay longer than timeout
      mockSheets.spreadsheets.values.batchUpdate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 16000))
      );

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to save data',
        details: 'Batch update timeout after 15 seconds for sheet: Sheet1',
      });
    }, 20000); // Increase timeout for this test

    it('should return success response for successful updates', async () => {
      parseCell.mockReturnValueOnce({ column: 'A', row: 1 });
      parseCell.mockReturnValueOnce({ column: 'A', row: 2 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'A2', value: 'test2' },
        ],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({
        data: { totalUpdatedCells: 2 },
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        totalUpdated: 2,
        totalRowsAffected: 2,
        sheetsProcessed: 1,
        results: [
          {
            sheetName: 'Sheet1',
            success: true,
            updatedCells: 2,
            updates: 2,
            rowsAffected: 2,
          },
        ],
        summary: {
          successful: 1,
          failed: 0,
          totalSheets: 1,
        },
      });
    });

    it('should handle partial failures', async () => {
      parseCell.mockReturnValue({ column: 'A', row: 1 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet2', cell: 'A1', value: 'test2' },
        ],
      };

      // First call succeeds, second fails
      mockSheets.spreadsheets.values.batchUpdate
        .mockResolvedValueOnce({ data: { totalUpdatedCells: 1 } })
        .mockRejectedValueOnce(new Error('Sheet not found'));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(207); // Multi-Status for partial success
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        totalUpdated: 1,
        totalRowsAffected: 1,
        sheetsProcessed: 2,
        results: [
          {
            sheetName: 'Sheet1',
            success: true,
            updatedCells: 1,
            updates: 1,
            rowsAffected: 1,
          },
          {
            sheetName: 'Sheet2',
            success: false,
            error: 'Sheet not found',
            updates: 1,
            rowsAffected: 0,
          },
        ],
        summary: {
          successful: 1,
          failed: 1,
          totalSheets: 2,
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should handle general errors', async () => {
      getGoogleSheetsClient.mockRejectedValue(new Error('Connection failed'));

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test1' }],
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to save data',
        details: 'Connection failed',
      });
    });

    it('should handle sheet-specific errors', async () => {
      parseCell.mockReturnValue({ column: 'A', row: 1 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test1' }],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockRejectedValue(
        new Error('Permission denied')
      );

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(207);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          results: [
            {
              sheetName: 'Sheet1',
              success: false,
              error: 'Permission denied',
              updates: 1,
              rowsAffected: 0,
            },
          ],
        })
      );
    });
  });

  describe('Capacity management', () => {
    it('should ensure sheet capacity before updates', async () => {
      parseCell.mockReturnValueOnce({ column: 'A', row: 1 });
      parseCell.mockReturnValueOnce({ column: 'C', row: 5 });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'C5', value: 'test2' },
        ],
      };

      mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({
        data: { totalUpdatedCells: 2 },
      });

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(ensureSheetCapacity).toHaveBeenCalledWith(
        'test-spreadsheet',
        'Sheet1',
        5,
        'C'
      );
    });
  });
});
