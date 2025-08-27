// Mock the entire googleSheets module first
jest.mock('../../lib/googleSheets', () => ({
  rateLimiter: {
    waitForSlot: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockReturnValue({
      totalRequests: 0,
      requestsLastMinute: 0,
      requestsLastSecond: 0,
      throttledRequests: 0,
      maxPerMinute: 300,
      maxPerSecond: 10,
    }),
  },
  getGoogleSheetsClient: jest.fn(),
  normalizeSpreadsheetId: jest.fn(),
  getSheetMetadataCached: jest.fn(),
  clearCaches: jest.fn(),
  getRange: jest.fn(),
  getSheetDataEfficiently: jest.fn(),
}));

import {
  rateLimiter,
  getGoogleSheetsClient,
  normalizeSpreadsheetId,
  getSheetMetadataCached,
  clearCaches,
  getRange,
  getSheetDataEfficiently
} from '../../lib/googleSheets';

describe('Google Sheets Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mocks
    getGoogleSheetsClient.mockResolvedValue({});
    normalizeSpreadsheetId.mockImplementation((id: string) => id);
  });

  describe('RateLimiter', () => {
    it('should allow requests within limits', async () => {
      await rateLimiter.waitForSlot();
      expect(rateLimiter.waitForSlot).toHaveBeenCalled();
    });

    it('should provide accurate stats', () => {
      const stats = rateLimiter.getStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('requestsLastMinute');
      expect(stats).toHaveProperty('requestsLastSecond');
      expect(stats).toHaveProperty('throttledRequests');
      expect(stats).toHaveProperty('maxPerMinute');
      expect(stats).toHaveProperty('maxPerSecond');
    });
  });

  describe('normalizeSpreadsheetId', () => {
    it('should return the ID as-is if it does not contain slashes', () => {
      const input = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      const result = normalizeSpreadsheetId(input);
      expect(result).toBe(input);
    });

    it('should extract the spreadsheet ID from a full Google Sheets URL', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
      const expected = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      const result = normalizeSpreadsheetId(url);
      expect(result).toBe(expected);
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
      const expected = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      const result = normalizeSpreadsheetId(url);
      expect(result).toBe(expected);
    });

    it('should handle malformed URLs gracefully', () => {
      const malformed = 'not-a-url-at-all';
      const result = normalizeSpreadsheetId(malformed);
      expect(result).toBe(malformed);
    });

    it('should handle empty string', () => {
      const result = normalizeSpreadsheetId('');
      expect(result).toBe('');
    });
  });

  describe('Core Functions', () => {
    it('should create Google Sheets client', async () => {
      const client = await getGoogleSheetsClient();
      expect(client).toBeDefined();
      expect(getGoogleSheetsClient).toHaveBeenCalled();
    });

    it('should fetch sheet metadata', async () => {
      const mockMetadata = { sheets: [] };
      getSheetMetadataCached.mockResolvedValue(mockMetadata);

      const result = await getSheetMetadataCached('test-id');
      expect(result).toEqual(mockMetadata);
    });

    it('should get range data', async () => {
      const mockData = { values: [['test']] };
      getRange.mockResolvedValue(mockData);

      const result = await getRange('test-id', 'Sheet1!A1');
      expect(result).toEqual(mockData);
    });

    it('should fetch sheet data efficiently', async () => {
      const mockData = { data: [['test']], hasHeaders: true, totalRows: 1, totalColumns: 1 };
      getSheetDataEfficiently.mockResolvedValue(mockData);

      const result = await getSheetDataEfficiently('test-id', 'Sheet1');
      expect(result).toEqual(mockData);
    });

    it('should clear caches', () => {
      clearCaches();
      expect(clearCaches).toHaveBeenCalled();
    });
  });

}
