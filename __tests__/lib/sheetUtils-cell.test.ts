// Mock dependencies first
jest.mock('../../lib/googleSheets', () => ({
  getGoogleSheetsClient: jest.fn(),
  getSheetMetadataCached: jest.fn(),
  rateLimiter: { waitForSlot: jest.fn().mockResolvedValue(undefined) }
}));

jest.mock('../../lib/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

// Import after mocking
import {
  validateCellReference,
  cellToIndices,
  indicesToCell,
  detectFormula,
  extractFormulaDependencies,
  parseCellRange
} from '../../lib/sheetUtils';

describe('Cell Utilities', () => {
  describe('validateCellReference', () => {
    it('should validate correct cell references', () => {
      expect(validateCellReference('A1')).toBe(true);
      expect(validateCellReference('B5')).toBe(true);
      expect(validateCellReference('AA10')).toBe(true);
      expect(validateCellReference('ZZZ999')).toBe(true);
    });

    it('should reject invalid cell references', () => {
      expect(validateCellReference('')).toBe(false);
      expect(validateCellReference('1A')).toBe(false);
      expect(validateCellReference('A')).toBe(false);
      expect(validateCellReference('1')).toBe(false);
      expect(validateCellReference('A 1')).toBe(false); // space
      expect(validateCellReference('AA')).toBe(false); // no number
      expect(validateCellReference('1A2')).toBe(false); // invalid format
    });

    it('should accept case-insensitive cell references', () => {
      expect(validateCellReference('a1')).toBe(true);
      expect(validateCellReference('B5')).toBe(true);
      expect(validateCellReference('aa10')).toBe(true);
    });
  });

  describe('cellToIndices', () => {
    it('should convert cell references to indices', () => {
      expect(cellToIndices('A1')).toEqual({ row: 0, col: 0 });
      expect(cellToIndices('B1')).toEqual({ row: 0, col: 1 });
      expect(cellToIndices('A2')).toEqual({ row: 1, col: 0 });
      expect(cellToIndices('Z1')).toEqual({ row: 0, col: 25 });
      expect(cellToIndices('AA1')).toEqual({ row: 0, col: 26 });
      expect(cellToIndices('AB1')).toEqual({ row: 0, col: 27 });
    });

    it('should handle uppercase conversion', () => {
      expect(cellToIndices('a1')).toEqual({ row: 0, col: 0 });
      expect(cellToIndices('b5')).toEqual({ row: 4, col: 1 });
    });

    it('should throw error for invalid cell references', () => {
      expect(() => cellToIndices('invalid')).toThrow('Invalid cell reference: invalid');
      expect(() => cellToIndices('')).toThrow('Invalid cell reference: ');
      expect(() => cellToIndices('1A')).toThrow('Invalid cell reference: 1A');
    });
  });

  describe('indicesToCell', () => {
    it('should convert indices to cell references', () => {
      expect(indicesToCell(0, 0)).toBe('A1');
      expect(indicesToCell(0, 1)).toBe('B1');
      expect(indicesToCell(1, 0)).toBe('A2');
      expect(indicesToCell(0, 25)).toBe('Z1');
      expect(indicesToCell(0, 26)).toBe('AA1');
      expect(indicesToCell(0, 27)).toBe('AB1');
    });

    it('should handle multi-letter columns', () => {
      expect(indicesToCell(0, 702)).toBe('AAA1'); // 26*26 + 26 + 0 = 702
      expect(indicesToCell(0, 16383)).toBe('XFD1'); // Excel's maximum column
    });
  });

  describe('detectFormula', () => {
    it('should detect formulas starting with equals', () => {
      expect(detectFormula('=SUM(A1:A10)')).toBe(true);
      expect(detectFormula('=A1+B1')).toBe(true);
      expect(detectFormula('=VLOOKUP(A1, B:C, 2, FALSE)')).toBe(true);
      expect(detectFormula('=1+1')).toBe(true);
    });

    it('should not detect non-formulas', () => {
      expect(detectFormula('Hello World')).toBe(false);
      expect(detectFormula('123')).toBe(false);
      expect(detectFormula('')).toBe(false);
      expect(detectFormula('not a formula')).toBe(false);
    });
  });

  describe('extractFormulaDependencies', () => {
    it('should extract cell references from formulas', () => {
      expect(extractFormulaDependencies('=A1')).toEqual(['A1']);
      expect(extractFormulaDependencies('=SUM(A1:A10)')).toEqual(['A1', 'A10']);
      expect(extractFormulaDependencies('=A1+B2*C3')).toEqual(['A1', 'B2', 'C3']);
      expect(extractFormulaDependencies('=VLOOKUP(A1,Sheet2!B:C,2,FALSE)')).toEqual(['A1']); // Current implementation only matches A1
    });

    it('should return empty array for non-formulas', () => {
      expect(extractFormulaDependencies('Hello World')).toEqual([]);
      expect(extractFormulaDependencies('123')).toEqual([]);
      expect(extractFormulaDependencies('')).toEqual([]);
    });

    it('should remove duplicates', () => {
      expect(extractFormulaDependencies('=A1+A1+A2')).toEqual(['A1', 'A2']);
    });
  });

  describe('parseCellRange', () => {
    it('should parse single cell references', () => {
      expect(parseCellRange('A1')).toEqual({
        startCell: 'A1',
        isSingleCell: true
      });

      expect(parseCellRange('B5')).toEqual({
        startCell: 'B5',
        isSingleCell: true
      });
    });

    it('should parse cell ranges', () => {
      expect(parseCellRange('A1:B5')).toEqual({
        startCell: 'A1',
        endCell: 'B5',
        isSingleCell: false
      });

      expect(parseCellRange('C10:Z100')).toEqual({
        startCell: 'C10',
        endCell: 'Z100',
        isSingleCell: false
      });
    });

    it('should parse sheet-qualified ranges', () => {
      expect(parseCellRange('Sheet1!A1')).toEqual({
        sheetName: 'Sheet1',
        startCell: 'A1',
        isSingleCell: true
      });

      expect(parseCellRange("'My Sheet'!A1:B5")).toEqual({
        sheetName: 'My Sheet',
        startCell: 'A1',
        endCell: 'B5',
        isSingleCell: false
      });
    });

    it('should return null for invalid ranges', () => {
      expect(parseCellRange('')).toBeNull();
      expect(parseCellRange('invalid')).toBeNull();
      expect(parseCellRange('A1:')).toBeNull();
      expect(parseCellRange(':B5')).toBeNull();
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain consistency between cellToIndices and indicesToCell', () => {
      const testCases = ['A1', 'B5', 'AA10', 'ZZZ999', 'XFD1048576'];

      testCases.forEach(cell => {
        const indices = cellToIndices(cell);
        const backToCell = indicesToCell(indices.row, indices.col);
        expect(backToCell).toBe(cell.toUpperCase());
      });
    });
  });
});
