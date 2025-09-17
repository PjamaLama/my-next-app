import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/update-sheet-cells';

// Mock the CellUpdateEngine
jest.mock('../../lib/cellUpdateEngine', () => ({
  CellUpdateEngine: jest.fn().mockImplementation(() => ({
    updateCells: jest.fn()
  }))
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

const { CellUpdateEngine } = require('../../lib/cellUpdateEngine');

describe('/api/update-sheet-cells', () => {
  let mockEngine: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEngine = {
      updateCells: jest.fn()
    };

    (CellUpdateEngine as jest.Mock).mockImplementation(() => mockEngine);

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
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{ cell: 'N/A', sheetName: 'N/A', error: 'Method not allowed' }]
      });
    });
  });

  describe('Request validation', () => {
    it('should return 400 if spreadsheetId is missing', async () => {
      mockReq.body = { updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test' }] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Missing required field: spreadsheetId'
        }]
      });
    });

    it('should return 400 if updates is not an array', async () => {
      mockReq.body = { spreadsheetId: '123', updates: 'not an array' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Updates must be an array'
        }]
      });
    });

    it('should return 400 if updates array is empty', async () => {
      mockReq.body = { spreadsheetId: '123', updates: [] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 0,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Updates array cannot be empty'
        }]
      });
    });

    it('should return 400 if update is missing required fields', async () => {
      mockReq.body = {
        spreadsheetId: '123',
        updates: [
          { cell: 'A1', value: 'test' }, // Missing sheetName
          { sheetName: 'Sheet1', value: 'test' }, // Missing cell
          { sheetName: 'Sheet1', cell: 'A1' }, // Missing value
          { sheetName: 'Sheet1', cell: 'A1', value: 'test' } // Valid
        ]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 4,
        errors: [
          {
            cell: 'A1',
            sheetName: 'N/A',
            error: 'Missing required fields: sheetName, cell, and value are required'
          },
          {
            cell: 'index_1',
            sheetName: 'Sheet1',
            error: 'Missing required fields: sheetName, cell, and value are required'
          },
          {
            cell: 'A1',
            sheetName: 'Sheet1',
            error: 'Missing required fields: sheetName, cell, and value are required'
          }
        ]
      });
    });
  });

  describe('Successful updates', () => {
    it('should return success for valid updates', async () => {
      const mockResult = {
        success: true,
        updatedCells: 2,
        failedCells: 0,
        errors: []
      };

      mockEngine.updateCells.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'A2', value: 'test2' }
        ]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        ...mockResult,
        details: {
          processedSheets: 1,
          totalSheets: 1,
          processingTime: expect.any(Number)
        }
      });
    });

    it('should handle multiple sheets', async () => {
      const mockResult = {
        success: true,
        updatedCells: 2,
        failedCells: 0,
        errors: []
      };

      mockEngine.updateCells.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet2', cell: 'A1', value: 'test2' }
        ]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        ...mockResult,
        details: {
          processedSheets: 2,
          totalSheets: 2,
          processingTime: expect.any(Number)
        }
      });
    });

    it('should handle atomic options', async () => {
      const mockResult = {
        success: true,
        updatedCells: 1,
        failedCells: 0,
        errors: []
      };

      mockEngine.updateCells.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test' }],
        options: { atomic: true, validateFormulas: true }
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockEngine.updateCells).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test' }],
        options: { atomic: true, validateFormulas: true }
      });
    });
  });

  describe('Partial failures', () => {
    it('should return 207 for partial success', async () => {
      const mockResult = {
        success: false,
        updatedCells: 1,
        failedCells: 1,
        errors: [{
          cell: 'A2',
          sheetName: 'Sheet1',
          error: 'Invalid formula'
        }]
      };

      mockEngine.updateCells.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [
          { sheetName: 'Sheet1', cell: 'A1', value: 'test1' },
          { sheetName: 'Sheet1', cell: 'A2', value: '=INVALID()' }
        ]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(207);
      expect(mockJson).toHaveBeenCalledWith({
        ...mockResult,
        details: {
          processedSheets: 1,
          totalSheets: 1,
          processingTime: expect.any(Number)
        }
      });
    });
  });

  describe('Error handling', () => {
    it('should handle engine errors', async () => {
      mockEngine.updateCells.mockRejectedValue(new Error('Engine failure'));

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        updates: [{ sheetName: 'Sheet1', cell: 'A1', value: 'test' }]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedCells: 0,
        failedCells: 1,
        errors: [{
          cell: 'N/A',
          sheetName: 'N/A',
          error: 'Engine failure'
        }],
        details: {
          processedSheets: 0,
          totalSheets: 0,
          processingTime: expect.any(Number)
        }
      });
    });
  });
});
