import { getInsertionRow } from '../../lib/sheetUtils';

// Mock the Google Sheets client
jest.mock('../../lib/googleSheets', () => ({
  getGoogleSheetsClient: jest.fn()
}));

describe('getInsertionRow', () => {
  const mockSheets = {
    spreadsheets: {
      values: {
        get: jest.fn()
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { getGoogleSheetsClient } = require('../../lib/googleSheets');
    getGoogleSheetsClient.mockResolvedValue(mockSheets);
  });

  it('should find the last row with data and return next row', async () => {
    // Mock response with data in rows 1, 2, and 5 (0-based indices)
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [['Header', 'Data1', '', 'Data2', 'Data3', '']] // Column A data
      }
    });

    const result = await getInsertionRow('test-spreadsheet-id', 'TestSheet');
    
    expect(result).toBe(6); // Should return row 6 (after the last data row)
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: 'test-spreadsheet-id',
      range: 'TestSheet!A:A',
      majorDimension: 'COLUMNS'
    });
  });

  it('should return row 2 when sheet only has headers', async () => {
    // Mock response with only header row
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [['Header']] // Only header row
      }
    });

    const result = await getInsertionRow('test-spreadsheet-id', 'TestSheet');
    
    expect(result).toBe(2); // Should return row 2 (after header)
  });

  it('should handle empty sheet and return row 2', async () => {
    // Mock response with empty sheet
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: []
      }
    });

    const result = await getInsertionRow('test-spreadsheet-id', 'TestSheet');
    
    expect(result).toBe(2); // Should return row 2 as fallback
  });

  it('should fallback to row 2 on error', async () => {
    // Mock error response
    mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('API Error'));

    const result = await getInsertionRow('test-spreadsheet-id', 'TestSheet');
    
    expect(result).toBe(2); // Should return row 2 as fallback
  });

  it('should handle sheet names with special characters', async () => {
    // Mock successful response
    mockSheets.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [['Header', 'Data1', 'Data2']]
      }
    });

    const result = await getInsertionRow('test-spreadsheet-id', 'Sheet With Spaces');
    
    expect(result).toBe(4); // Should return row 4 (after the last data row)
  });
});
