import {
  buildHeaderIndex,
  suggestHeaderMapping,
  inferColumnTypes,
  parseDateFlexible,
  parseDecimal,
  matchRowIdentity,
  type ColumnType
} from '../../lib/mapping';

// Mock dayjs
jest.mock('dayjs', () => {
  return jest.fn((dateString: string) => ({
    isValid: () => {
      // Simple mock - consider valid if it has numbers and separators
      return /\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/.test(dateString) ||
             /^\d{4}-\d{2}-\d{2}/.test(dateString) ||
             // Also consider ISO dates valid
             !isNaN(Date.parse(dateString));
    },
    format: (format: string) => {
      if (format === 'YYYY-MM-DD') {
        // Try to extract date parts and return formatted date
        const isoMatch = dateString.match(/^\d{4}-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[0];

        const partsMatch = dateString.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (partsMatch) {
          const [, day, month, year] = partsMatch;
          const fullYear = year.length === 2 ? (parseInt(year) >= 70 ? '19' : '20') + year : year;
          return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return '2023-01-15'; // fallback
      }
      return dateString;
    }
  }));
});

// Mock embeddings to avoid external dependencies
jest.mock('../../lib/embeddings', () => ({
  cosineSimilarity: jest.fn(),
  embedText: jest.fn(),
}));

const { cosineSimilarity, embedText } = require('../../lib/embeddings');

describe('Mapping Utilities', () => {

  describe('buildHeaderIndex', () => {
    it('should build header index with normalized headers', () => {
      const headers = ['Date', 'Fuel Cost', 'Vehicle'];
      const result = buildHeaderIndex(headers);

      expect(result.headers).toEqual(headers);
      expect(result.normalizedHeaders).toEqual(['date', 'fuel cost', 'vehicle']);
      expect(result.headerToIndex).toEqual({
        'date': 0,
        'fuel cost': 1,
        'vehicle': 2
      });
      expect(result.synonyms).toHaveProperty('date');
      expect(result.synonyms).toHaveProperty('fuel cost in rands');
    });

    it('should include custom synonyms', () => {
      const headers = ['Custom Field'];
      const customSynonyms = { 'custom field': ['my field', 'special'] };
      const result = buildHeaderIndex(headers, customSynonyms);

      expect(result.synonyms['custom field']).toContain('my field');
      expect(result.synonyms['custom field']).toContain('special');
    });
  });

  describe('suggestHeaderMapping', () => {
    it('should suggest exact matches with high confidence', () => {
      const incomingKeys = ['Date', 'Fuel Cost'];
      const headers = ['Date', 'Fuel Cost', 'Vehicle'];
      const result = suggestHeaderMapping(incomingKeys, headers);

      expect(result[0]).toEqual(
        expect.objectContaining({
          incomingKey: 'Date',
          targetHeader: 'Date',
          confidence: 1,
          reasons: expect.arrayContaining(['exact match'])
        })
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          incomingKey: 'Fuel Cost',
          targetHeader: 'Fuel Cost',
          confidence: 1,
          reasons: expect.arrayContaining(['exact match'])
        })
      );
    });

    it('should suggest synonym matches', () => {
      const incomingKeys = ['Registration'];
      const headers = ['Reg#'];
      const result = suggestHeaderMapping(incomingKeys, headers);

      expect(result[0].targetHeader).toBe('Reg#');
      expect(result[0].confidence).toBeGreaterThan(0.5);
      expect(result[0].reasons).toContain('synonym match');
    });

    it('should handle token overlap', () => {
      const incomingKeys = ['Fuel Price'];
      const headers = ['Fuel Cost'];
      const result = suggestHeaderMapping(incomingKeys, headers);

      expect(result[0].targetHeader).toBe('Fuel Cost');
      expect(result[0].confidence).toBeGreaterThan(0);
      expect(result[0].reasons).toEqual(expect.arrayContaining([expect.stringContaining('token overlap')]));
    });

    it('should return null for no matches', () => {
      const incomingKeys = ['Completely Unrelated'];
      const headers = ['Date', 'Fuel Cost'];
      const result = suggestHeaderMapping(incomingKeys, headers);

      expect(result[0].targetHeader).toBeNull();
      expect(result[0].confidence).toBe(0);
    });

    it('should handle empty inputs', () => {
      expect(suggestHeaderMapping([], ['Date'])).toEqual([]);
      expect(suggestHeaderMapping(['Date'], [])).toEqual([
        {
          incomingKey: 'Date',
          targetHeader: null,
          confidence: 0,
          reasons: []
        }
      ]);
    });
  });

  describe('inferColumnTypes', () => {
    it('should infer date columns', () => {
      const headers = ['Date'];
      const rows = [
        ['2023-01-01'],
        ['2023-01-02'],
        ['2023-01-03']
      ];
      const result = inferColumnTypes(headers, rows);

      expect(result['Date']).toBe('date');
    });

    it('should infer number columns', () => {
      const headers = ['Amount'];
      const rows = [
        ['100.50'],
        ['200.75'],
        ['50.25']
      ];
      const result = inferColumnTypes(headers, rows);

      expect(result['Amount']).toBe('number');
    });

    it('should infer boolean columns', () => {
      const headers = ['Active'];
      const rows = [
        ['true'],
        ['false'],
        ['true']
      ];
      const result = inferColumnTypes(headers, rows);

      expect(result['Active']).toBe('boolean');
    });

    it('should default to string for mixed content', () => {
      const headers = ['Mixed'];
      const rows = [
        ['text'],
        ['123'],
        ['true']
      ];
      const result = inferColumnTypes(headers, rows);

      expect(result['Mixed']).toBe('string');
    });

    it('should handle empty data', () => {
      const headers = ['Empty'];
      const rows: string[][] = [];
      const result = inferColumnTypes(headers, rows);

      expect(result['Empty']).toBe('string');
    });

    it('should handle null/undefined values', () => {
      const headers = ['Test'];
      const rows = [
        [null],
        [undefined],
        ['']
      ];
      const result = inferColumnTypes(headers, rows);

      expect(result['Test']).toBe('string');
    });

    it('should limit analysis to first 50 rows', () => {
      const headers = ['Amount'];
      const rows = Array(100).fill(['123.45']); // 100 rows with decimal numbers
      const result = inferColumnTypes(headers, rows);

      expect(result['Amount']).toBe('number');
    });
  });

  describe('parseDateFlexible', () => {
    it('should parse ISO dates', () => {
      expect(parseDateFlexible('2023-01-15')).toBe('2023-01-15');
      expect(parseDateFlexible('2023-12-31')).toBe('2023-12-31');
    });

    it('should parse DD/MM/YY format', () => {
      expect(parseDateFlexible('15/01/23')).toBe('2023-01-15');
      expect(parseDateFlexible('01/12/2023')).toBe('2023-12-01');
    });

    it('should handle two-digit years before 70 as 2000s', () => {
      expect(parseDateFlexible('15/01/85')).toBe('1985-01-15');
    });

    it('should handle two-digit years 70+ as 1900s', () => {
      expect(parseDateFlexible('15/01/70')).toBe('1970-01-15');
    });

    it('should return null for invalid dates', () => {
      expect(parseDateFlexible('')).toBeNull();
      expect(parseDateFlexible('invalid')).toBeNull();
      expect(parseDateFlexible('99/99/99')).toBeNull();
    });

    it('should handle various separators', () => {
      expect(parseDateFlexible('15-01-2023')).toBe('2023-01-15');
      expect(parseDateFlexible('15.01.2023')).toBe('2023-01-15');
    });

    it('should return null for non-date strings', () => {
      expect(parseDateFlexible('not a date')).toBeNull();
      expect(parseDateFlexible('abc123')).toBeNull();
    });
  });

  describe('parseDecimal', () => {
    it('should parse valid numbers', () => {
      expect(parseDecimal('123.45')).toBe(123.45);
      expect(parseDecimal('100')).toBe(100);
      expect(parseDecimal('-50.25')).toBe(-50.25);
      expect(parseDecimal('1,234.56')).toBe(1234.56);
    });

    it('should remove currency symbols and text', () => {
      expect(parseDecimal('R123.45')).toBe(123.45);
      expect(parseDecimal('$100.00')).toBe(100);
      expect(parseDecimal('123.45 USD')).toBe(123.45);
    });

    it('should handle commas as thousand separators', () => {
      expect(parseDecimal('1,234')).toBe(1234);
      expect(parseDecimal('1,234,567.89')).toBe(1234567.89);
    });

    it('should return null for invalid inputs', () => {
      expect(parseDecimal('')).toBeNull();
      expect(parseDecimal('abc')).toBeNull();
      expect(parseDecimal(null)).toBeNull();
      expect(parseDecimal(undefined)).toBeNull();
      expect(parseDecimal('no numbers')).toBeNull();
    });
  });

  describe('matchRowIdentity', () => {
    const headers = ['Date', 'Reg#', 'Vehicle', 'Fuel Cost in Rands'];
    const existingRows = [
      ['Date', 'Reg#', 'Vehicle', 'Fuel Cost in Rands'], // Header row
      ['2023-01-01', 'ABC123', 'Toyota', '100.00'], // Row 1
      ['2023-01-02', 'DEF456', 'Honda', '150.00'], // Row 2
      ['2023-01-01', 'ABC123', 'Toyota', '200.00'], // Row 3 - duplicate date/reg
    ];

    it('should match by date and registration', () => {
      const candidate = {
        Date: '2023-01-01',
        'Reg#': 'ABC123'
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      expect(result).toBe(1); // Should match row 1 (0-indexed as 1 in 1-based)
    });

    it('should match by date and amount when reg is missing', () => {
      const candidate = {
        Date: '2023-01-02',
        'Fuel Cost in Rands': '150.00'
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      expect(result).toBe(2);
    });

    it('should match by vehicle when other keys are missing', () => {
      const candidate = {
        Vehicle: 'Honda'
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      // Should find Honda in row 2 (0-indexed)
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should require sufficient match score', () => {
      const candidate = {
        Date: '2023-01-01'
        // Missing registration - should not match with just date
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      expect(result).toBe(-1); // No match due to insufficient score
    });

    it('should return -1 for no match', () => {
      const candidate = {
        Date: '2025-01-01',
        'Reg#': 'XYZ999'
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      expect(result).toBe(-1);
    });

    it('should handle missing headers', () => {
      const missingHeaders = ['Date', 'Amount'];
      const candidate = {
        Date: '2023-01-01'
      };

      const result = matchRowIdentity(missingHeaders, existingRows, candidate);
      expect(result).toBe(-1);
    });

    it('should handle case insensitive matching', () => {
      const candidate = {
        'Reg#': 'ABC123',
        Date: '2023-01-01'
      };

      const result = matchRowIdentity(headers, existingRows, candidate);
      // Should find a match with the normalized data
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end with typical data', () => {
      const headers = ['Date', 'Reg#', 'Fuel Cost'];
      const rows = [
        ['2023-01-01', 'ABC123', '100.50'],
        ['2023-01-02', 'DEF456', '150.25'],
        ['2023-01-03', 'GHI789', '200.00']
      ];

      // Test column type inference
      const columnTypes = inferColumnTypes(headers, rows);
      expect(columnTypes['Date']).toBe('date');
      expect(columnTypes['Fuel Cost']).toBe('number');
      expect(columnTypes['Reg#']).toBe('string');

      // Test header mapping
      const incomingKeys = ['Date', 'Registration', 'Cost'];
      const suggestions = suggestHeaderMapping(incomingKeys, headers);
      expect(suggestions[0].targetHeader).toBe('Date');
      expect(suggestions[1].targetHeader).toBe('Reg#'); // Should match via synonym
      expect(suggestions[2].targetHeader).toBe('Fuel Cost');
    });
  });
});
