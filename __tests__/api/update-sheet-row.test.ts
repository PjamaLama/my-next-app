import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/update-sheet-row';

// Mock the dependencies
jest.mock('../../lib/googleSheets', () => ({
  getGoogleSheetsClient: jest.fn(),
}));

jest.mock('../../lib/sheetUtils', () => ({
  escapeSheetName: jest.fn(),
}));

// Mock NextApiResponse
const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes: Partial<NextApiResponse> = {
  status: mockStatus,
  json: mockJson,
};

const { getGoogleSheetsClient } = require('../../lib/googleSheets');
const { escapeSheetName } = require('../../lib/sheetUtils');

describe('/api/update-sheet-row', () => {
  let mockReq: Partial<NextApiRequest>;
  let mockSheets: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSheets = {
      spreadsheets: {
        values: {
          get: jest.fn(),
          update: jest.fn(),
        },
      },
    };

    getGoogleSheetsClient.mockResolvedValue(mockSheets);
    escapeSheetName.mockImplementation((name: string) => name);

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
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Method not allowed' });
    });
  });

  describe('Request validation', () => {
    it('should return 400 if required parameters are missing', async () => {
      mockReq.body = {};

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Missing required params' });
    });

    it('should return 400 if spreadsheetId is missing', async () => {
      mockReq.body = { sheetName: 'Sheet1', rowIndex: 1, values: ['test'] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Missing required params' });
    });

    it('should return 400 if sheetName is missing', async () => {
      mockReq.body = { spreadsheetId: '123', rowIndex: 1, values: ['test'] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Missing required params' });
    });

    it('should return 400 if rowIndex is missing', async () => {
      mockReq.body = { spreadsheetId: '123', sheetName: 'Sheet1', values: ['test'] };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Missing required params' });
    });

    it('should return 400 if values is not an array', async () => {
      mockReq.body = { spreadsheetId: '123', sheetName: 'Sheet1', rowIndex: 1, values: 'not an array' };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'Missing required params' });
    });
  });

  describe('Sheet header validation', () => {
    it('should return 400 if no headers found', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: [] }
      });

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rowIndex: 2,
        values: ['John', '25']
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ success: false, updatedRows: 0, details: 'No headers found' });
    });
  });

  describe('Successful row update', () => {
    beforeEach(() => {
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: [['Name', 'Age', 'City']] }
      });
      mockSheets.spreadsheets.values.update.mockResolvedValue({});
    });

    it('should update row with correct parameters', async () => {
      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rowIndex: 2,
        values: ['John', '25', 'NYC']
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        range: 'Sheet1!A1:Z1'
      });

      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        range: 'Sheet1!A2:C2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['John', '25', 'NYC']] },
      });

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ success: true, updatedRows: 1 });
    });

    it('should pad values to match header length', async () => {
      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rowIndex: 2,
        values: ['John', '25'] // Only 2 values for 3 headers
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet',
        range: 'Sheet1!A2:C2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['John', '25', '']] }, // Padded with empty string
      });
    });
  });

  describe('Error handling', () => {
    it('should handle Google Sheets API errors', async () => {
      mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('Sheet not found'));

      mockReq.body = {
        spreadsheetId: 'test-spreadsheet',
        sheetName: 'Sheet1',
        rowIndex: 2,
        values: ['John', '25']
      };

      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        updatedRows: 0,
        details: 'Sheet not found'
      });
    });
  });
});
