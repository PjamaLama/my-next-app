import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/get-sheet-names';

// Mock the dependencies
jest.mock('../../lib/googleSheets', () => ({
  normalizeSpreadsheetId: jest.fn(),
  getSheetMetadataCached: jest.fn(),
  clearCaches: jest.fn(),
}));

// Mock NextApiResponse
const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes: Partial<NextApiResponse> = {
  status: mockStatus,
  json: mockJson,
};

const {
  normalizeSpreadsheetId,
  getSheetMetadataCached,
  clearCaches
} = require('../../lib/googleSheets');

describe('/api/get-sheet-names', () => {
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    normalizeSpreadsheetId.mockImplementation((id: string) => id);
    clearCaches.mockImplementation(() => {});

    mockReq = {
      method: 'GET',
      query: {},
      body: {},
    };
  });

  describe('Method validation', () => {
    it('should support GET method', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const mockMetadata = {
        sheets: [{ properties: { title: 'Sheet1' } }],
        properties: { title: 'Test Spreadsheet' },
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(normalizeSpreadsheetId).toHaveBeenCalledWith('test-id');
      expect(getSheetMetadataCached).toHaveBeenCalledWith('test-id');
    });

    it('should support POST method', async () => {
      mockReq.method = 'POST';
      mockReq.body = { spreadsheetId: 'test-id' };

      const mockMetadata = {
        sheets: [{ properties: { title: 'Sheet1' } }],
        properties: { title: 'Test Spreadsheet' },
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(normalizeSpreadsheetId).toHaveBeenCalledWith('test-id');
      expect(getSheetMetadataCached).toHaveBeenCalledWith('test-id');
    });
  });

  describe('Parameter validation', () => {
    it('should return 400 if spreadsheetId is missing from GET request', async () => {
      mockReq.method = 'GET';
      mockReq.query = {};

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Spreadsheet ID is required' });
    });

    it('should return 400 if spreadsheetId is missing from POST request', async () => {
      mockReq.method = 'POST';
      mockReq.body = {};

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Spreadsheet ID is required' });
    });

    it('should return 400 if spreadsheetId is not a string', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 123 };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Spreadsheet ID is required' });
    });
  });

  describe('forceRefresh functionality', () => {
    beforeEach(() => {
      const mockMetadata = {
        sheets: [{ properties: { title: 'Sheet1' } }],
        properties: { title: 'Test Spreadsheet' },
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);
    });

    it('should clear cache when forceRefresh=true in GET query', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id', forceRefresh: 'true' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(clearCaches).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when forceRefresh=true in POST body', async () => {
      mockReq.method = 'POST';
      mockReq.body = { spreadsheetId: 'test-id', forceRefresh: true };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(clearCaches).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when forceRefresh="true" string in GET query', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id', forceRefresh: 'true' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(clearCaches).toHaveBeenCalledTimes(1);
    });

    it('should not clear cache when forceRefresh is false', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id', forceRefresh: 'false' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(clearCaches).not.toHaveBeenCalled();
    });

    it('should not clear cache when forceRefresh is not provided', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(clearCaches).not.toHaveBeenCalled();
    });
  });

  describe('Successful responses', () => {
    it('should return sheet names and spreadsheet title successfully', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const mockMetadata = {
        sheets: [
          { properties: { title: 'Sheet1' } },
          { properties: { title: 'Sheet2' } },
        ],
        properties: { title: 'Test Spreadsheet' },
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        sheetNames: ['Sheet1', 'Sheet2'],
        spreadsheetTitle: 'Test Spreadsheet'
      });
    });

    it('should filter out sheets without titles', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const mockMetadata = {
        sheets: [
          { properties: { title: 'Sheet1' } },
          { properties: {} }, // No title
          { properties: { title: '' } }, // Empty title
          { properties: { title: 'Sheet2' } },
        ],
        properties: { title: 'Test Spreadsheet' },
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        sheetNames: ['Sheet1', 'Sheet2'],
        spreadsheetTitle: 'Test Spreadsheet'
      });
    });

    it('should handle spreadsheet without title', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const mockMetadata = {
        sheets: [{ properties: { title: 'Sheet1' } }],
        properties: {},
      };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        sheetNames: ['Sheet1'],
        spreadsheetTitle: undefined
      });
    });
  });

  describe('Error handling', () => {
    it('should handle Google Sheets API errors', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const error = new Error('Sheet not found');
      (error as any).response = { data: { error: { message: 'Requested entity was not found' } } };
      getSheetMetadataCached.mockRejectedValue(error);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Spreadsheet not found or the service account does not have access.',
        details: 'Requested entity was not found',
        hint: 'Ensure the spreadsheet exists and is shared with the service account email shown in /api/get-service-account.'
      });
    });

    it('should handle generic errors', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      getSheetMetadataCached.mockRejectedValue(new Error('Network error'));

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Network error' });
    });

    it('should handle non-Google Sheet errors', async () => {
      mockReq.method = 'GET';
      mockReq.query = { spreadsheetId: 'test-id' };

      const error = new Error('This operation is not supported for this document');
      (error as any).response = { data: { error: { message: 'This operation is not supported for this document' } } };
      getSheetMetadataCached.mockRejectedValue(error);

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'The provided ID is not a Google Sheet.',
        details: 'This operation is not supported for this document',
        hint: 'Open the Google Sheet in your browser and copy the ID from the URL between /d/ and /edit. If this is an Excel file, open it in Google Sheets and save as a Google Sheet first.'
      });
    });
  });
});
