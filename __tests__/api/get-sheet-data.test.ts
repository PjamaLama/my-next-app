import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/get-sheet-data';

// Mock the dependencies
jest.mock('../../lib/googleSheets', () => ({
  getGoogleSheetsClient: jest.fn(),
  normalizeSpreadsheetId: jest.fn(),
  getSheetDataEfficiently: jest.fn(),
}));

jest.mock('../../lib/sheetUtils', () => ({
  escapeSheetName: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
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

const { getGoogleSheetsClient, normalizeSpreadsheetId, getSheetDataEfficiently } = require('../../lib/googleSheets');
const { escapeSheetName } = require('../../lib/sheetUtils');

describe('/api/get-sheet-data', () => {
  let mockSheets: any;
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset cache between tests
    const handlerModule = require('../../pages/api/get-sheet-data');
    if (handlerModule.responseCache) {
      handlerModule.responseCache.clear();
    }

    mockSheets = {
      spreadsheets: {
        get: jest.fn(),
        values: {
          get: jest.fn(),
        },
      },
    };

    getGoogleSheetsClient.mockResolvedValue(mockSheets);
    normalizeSpreadsheetId.mockImplementation((id: string) => id);
    escapeSheetName.mockImplementation((name: string) => name);

    mockReq = {
      method: 'POST',
      body: {},
    };
  });

  describe('Request validation', () => {
    it('should return 400 if spreadsheetId is missing', async () => {
      mockReq.body = { sheetName: 'TestSheet' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing spreadsheetId',
        })
      );
    });

    it('should return 400 if sheetName is missing', async () => {
      mockReq.body = { spreadsheetId: '123' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing sheetName',
        })
      );
    });
  });

  describe('Caching', () => {
    it('should return cached data if available and fresh', async () => {
      // Mock the entire module to control the cache
      const originalModule = require('../../pages/api/get-sheet-data');

      // Create a fresh cache for testing
      const testCache = new Map();
      testCache.set('anon::test-spreadsheet::TestSheet::auto', {
        at: Date.now(),
        payload: { data: [['Header1', 'Header2']] }
      });

      // Replace the cache temporarily
      const originalCache = originalModule.responseCache;
      originalModule.responseCache = testCache;

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ data: [['Header1', 'Header2']] });
      expect(getGoogleSheetsClient).toHaveBeenCalled(); // Cache check happens after client creation
      expect(getSheetDataEfficiently).not.toHaveBeenCalled(); // Should use cache, not fetch

      // Restore original cache
      originalModule.responseCache = originalCache;
    });
  });

  describe('Explicit range handling', () => {
    it('should fetch data for explicit range', async () => {
      const mockResponse = {
        data: {
          values: [['Data1', 'Data2'], ['Data3', 'Data4']],
        },
      };

      mockSheets.spreadsheets.values.get.mockResolvedValue(mockResponse);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
        range: 'A1:B2',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(escapeSheetName).toHaveBeenCalledWith('TestSheet');
      expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        range: 'TestSheet!A1:B2',
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        data: [['Data1', 'Data2'], ['Data3', 'Data4']],
      });
    });

    it('should handle sheet not found error for explicit range', async () => {
      const error = new Error('Sheet not found');
      mockSheets.spreadsheets.values.get.mockRejectedValue(error);

      // Mock available sheets
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: 'Sheet1' } },
            { properties: { title: 'Sheet2' } },
          ],
        },
      });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'NonExistentSheet',
        range: 'A1:B2',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Sheet "NonExistentSheet" not found in spreadsheet',
          availableSheets: ['Sheet1', 'Sheet2'],
        })
      );
    });
  });

  describe('Efficient data fetching', () => {
    it('should use efficient fetching when no range specified', async () => {
      // Clear any existing cache
      const handlerModule = require('../../pages/api/get-sheet-data');
      handlerModule.responseCache.clear();

      const mockResult = {
        data: [['Header1', 'Header2'], ['Data1', 'Data2'], ['Data3', 'Data4']],
        hasHeaders: true,
        totalRows: 3,
        totalColumns: 2
      };

      getSheetDataEfficiently.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(getSheetDataEfficiently).toHaveBeenCalledWith(
        'test-spreadsheet',
        'TestSheet',
        {
          maxRows: 1000,
          includeHeaders: true,
          tailRows: undefined,
        }
      );
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ data: mockResult.data });
    });

    it('should filter out total rows', async () => {
      // Clear cache
      const handlerModule = require('../../pages/api/get-sheet-data');
      handlerModule.responseCache.clear();

      const mockResult = {
        data: [
          ['Header1', 'Header2'],
          ['Data1', 'Data2'],
          ['Total', '150.00'], // Total row at index 2
          ['Data3', 'Data4'],
        ],
        hasHeaders: true,
        totalRows: 4,
        totalColumns: 2
      };

      getSheetDataEfficiently.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockJson).toHaveBeenCalledWith({
        data: [
          ['Header1', 'Header2'],
          ['Data1', 'Data2'],
          ['Data3', 'Data4'],
        ],
      });
    });

    it('should handle tailRows parameter', async () => {
      const mockResult = {
        data: [['Header1', 'Header2'], ['Data1', 'Data2'], ['Data3', 'Data4']],
      };

      getSheetDataEfficiently.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
        tailRows: 10,
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(getSheetDataEfficiently).toHaveBeenCalledWith(
        'test-spreadsheet',
        'TestSheet',
        {
          maxRows: 1000,
          includeHeaders: true,
          tailRows: 10,
        }
      );
    });
  });

  describe('Error handling', () => {
    it('should handle general errors', async () => {
      // Mock getSheetDataEfficiently to fail
      getSheetDataEfficiently.mockRejectedValue(new Error('Network error'));

      // Mock the sheets client methods to also fail (fallback scenario)
      mockSheets.spreadsheets.get.mockRejectedValue(new Error('Client error'));
      mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('Values error'));

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch sheet data',
          details: 'Network error',
        })
      );
    });

    it('should handle sheet not found in efficient fetching', async () => {
      getSheetDataEfficiently.mockRejectedValue(new Error('Sheet not found'));

      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [{ properties: { title: 'AvailableSheet' } }],
        },
      });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'NonExistentSheet',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Sheet "NonExistentSheet" not found in spreadsheet',
          availableSheets: ['AvailableSheet'],
        })
      );
    });
  });

  describe('Session key handling', () => {
    it('should include session key in cache key', async () => {
      const mockResult = {
        data: [['Header1', 'Header2'], ['Data1', 'Data2']],
        hasHeaders: true,
        totalRows: 2,
        totalColumns: 2
      };

      getSheetDataEfficiently.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'TestSheet',
        sessionKey: 'user-session-123',
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ data: mockResult.data });

      // Verify the function was called with correct parameters including session key
      expect(getSheetDataEfficiently).toHaveBeenCalledWith(
        'test-spreadsheet',
        'TestSheet',
        expect.objectContaining({
          maxRows: 1000,
          includeHeaders: true,
          tailRows: undefined
        })
      );
    });
  });
});
