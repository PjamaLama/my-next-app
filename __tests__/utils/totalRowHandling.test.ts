import { filterOutTotalRows, isTotalRow, getDataRowsOnly } from '../../lib/sheetUtils';

describe('Total Row Handling', () => {
  const mockHeaders = ['Date', 'Amount', 'Description', 'Category'];
  
  const mockSheetData = [
    ['Date', 'Amount', 'Description', 'Category'], // Row 1: Headers
    ['2024-01-01', '100.00', 'Fuel', 'Transport'], // Row 2: Data
    ['2024-01-02', '50.00', 'Lunch', 'Food'], // Row 3: Data
    ['Total', '150.00', '', ''], // Row 4: Total row
    ['2024-01-03', '25.00', 'Coffee', 'Food'], // Row 5: More data
  ];

  describe('filterOutTotalRows', () => {
    it('should filter out total row at specified index', () => {
      const result = filterOutTotalRows(mockSheetData, 3); // Filter out row 4 (index 3)
      expect(result).toHaveLength(4); // Should have 4 rows after filtering
      expect(result[3]).toEqual(['2024-01-03', '25.00', 'Coffee', 'Food']); // Last row should be the data row
    });

    it('should handle empty data', () => {
      const result = filterOutTotalRows([], 2);
      expect(result).toHaveLength(0);
    });

    it('should handle data shorter than total row index', () => {
      const shortData = [['Header'], ['Data']];
      const result = filterOutTotalRows(shortData, 2);
      expect(result).toHaveLength(2); // Should return original data unchanged
    });
  });

  describe('isTotalRow', () => {
    it('should identify total row with "Total" text', () => {
      const totalRow = ['Total', '150.00', '', ''];
      const result = isTotalRow(totalRow, mockHeaders);
      expect(result).toBe(true);
    });

    it('should identify total row with sum formula', () => {
      const totalRow = ['', '=SUM(B2:B4)', '', ''];
      const result = isTotalRow(totalRow, mockHeaders);
      expect(result).toBe(true);
    });

    it('should identify total row with mostly empty cells', () => {
      const totalRow = ['Subtotal', '', '', ''];
      const result = isTotalRow(totalRow, mockHeaders);
      expect(result).toBe(true);
    });

    it('should not identify regular data row as total', () => {
      const dataRow = ['2024-01-01', '100.00', 'Fuel', 'Transport'];
      const result = isTotalRow(dataRow, mockHeaders);
      expect(result).toBe(false);
    });
  });

  describe('getDataRowsOnly', () => {
    it('should return only data rows excluding headers and totals', () => {
      const result = getDataRowsOnly(mockSheetData, 3); // Total row at index 3
      expect(result).toHaveLength(3); // Should have 3 data rows
      expect(result[0]).toEqual(['2024-01-01', '100.00', 'Fuel', 'Transport']);
      expect(result[1]).toEqual(['2024-01-02', '50.00', 'Lunch', 'Food']);
      expect(result[2]).toEqual(['2024-01-03', '25.00', 'Coffee', 'Food']);
    });

    it('should handle data with no total row', () => {
      const dataWithoutTotals = [
        ['Date', 'Amount'],
        ['2024-01-01', '100.00'],
        ['2024-01-02', '50.00']
      ];
      const result = getDataRowsOnly(dataWithoutTotals, 999); // Use a high index since there's no total row
      expect(result).toHaveLength(2); // Should have 2 data rows
    });

    it('should handle empty data', () => {
      const result = getDataRowsOnly([], 2);
      expect(result).toHaveLength(0);
    });
  });
});
