import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/ingest-rows';

// Mock the dependencies
jest.mock('../../lib/ingestion/orchestrator', () => ({
  ingestRows: jest.fn(),
}));

// Mock NextApiResponse
const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes: Partial<NextApiResponse> = {
  status: mockStatus,
  json: mockJson,
};

const { ingestRows } = require('../../lib/ingestion/orchestrator');

describe('/api/ingest-rows', () => {
  let mockReq: Partial<NextApiRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

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
      mockReq.body = { sheetName: 'Sheet1', rows: [{ name: 'test' }] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'spreadsheetId and a target sheet (sheetName or sheetNames[]) are required' });
    });

    it('should return 400 if sheetName is missing', async () => {
      mockReq.body = { spreadsheetId: '123', rows: [{ name: 'test' }] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'spreadsheetId and a target sheet (sheetName or sheetNames[]) are required' });
    });

    it('should return 400 if rows is not an array', async () => {
      mockReq.body = { spreadsheetId: '123', sheetName: 'Sheet1', rows: 'not an array' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'rows[] is required' });
    });

    it('should return 400 if rows array is empty', async () => {
      mockReq.body = { spreadsheetId: '123', sheetName: 'Sheet1', rows: [] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'rows[] is required' });
    });
  });

  describe('Successful ingestion', () => {
    it('should call ingestRows with correct parameters and return success', async () => {
      const mockResult = {
        success: true,
        inserts: 2,
        updates: 0,
        details: 'Data inserted successfully'
      };

      ingestRows.mockResolvedValue(mockResult);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rows: [
          { name: 'John', age: '25' },
          { name: 'Jane', age: '30' }
        ]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(ingestRows).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rows: [
          { name: 'John', age: '25' },
          { name: 'Jane', age: '30' }
        ]
      });

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('Error handling', () => {
    it('should handle errors from ingestRows', async () => {
      const error = new Error('Failed to ingest data');
      ingestRows.mockRejectedValue(error);

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rows: [{ name: 'test' }]
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to ingest data' });
    });
  });
});
