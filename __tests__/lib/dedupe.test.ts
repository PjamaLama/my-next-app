import {
  stableRowKey,
  buildExistingKeySet,
  filterNewRows,
  type RowObject
} from '../../lib/dedupe';

describe('Dedupe Utilities', () => {
  describe('stableRowKey', () => {
    it('should generate consistent keys for the same data', () => {
      const row1: RowObject = { name: 'John', age: 25, city: 'NYC' };
      const row2: RowObject = { name: 'John', age: 25, city: 'NYC' };

      const key1 = stableRowKey(row1, ['name', 'age']);
      const key2 = stableRowKey(row2, ['name', 'age']);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe('string');
      expect(key1.length).toBe(40); // SHA1 hash length
    });

    it('should generate different keys for different data', () => {
      const row1: RowObject = { name: 'John', age: 25 };
      const row2: RowObject = { name: 'Jane', age: 25 };

      const key1 = stableRowKey(row1, ['name']);
      const key2 = stableRowKey(row2, ['name']);

      expect(key1).not.toBe(key2);
    });

    it('should be case insensitive', () => {
      const row1: RowObject = { name: 'John' };
      const row2: RowObject = { name: 'JOHN' };

      const key1 = stableRowKey(row1, ['name']);
      const key2 = stableRowKey(row2, ['name']);

      expect(key1).toBe(key2);
    });

    it('should trim whitespace', () => {
      const row1: RowObject = { name: ' John ' };
      const row2: RowObject = { name: 'John' };

      const key1 = stableRowKey(row1, ['name']);
      const key2 = stableRowKey(row2, ['name']);

      expect(key1).toBe(key2);
    });

    it('should handle missing fields', () => {
      const row: RowObject = { name: 'John' };

      const key = stableRowKey(row, ['name', 'missingField']);
      expect(key).toBeDefined();
    });

    it('should handle null and undefined values', () => {
      const row: RowObject = {
        name: 'John',
        age: null,
        city: undefined
      };

      const key = stableRowKey(row, ['name', 'age', 'city']);
      expect(key).toBeDefined();
    });

    it('should handle numeric values', () => {
      const row: RowObject = { amount: 123.45 };

      const key = stableRowKey(row, ['amount']);
      expect(key).toBeDefined();
    });

    it('should generate different keys for different field orders', () => {
      const row: RowObject = { first: 'John', last: 'Doe' };

      const key1 = stableRowKey(row, ['first', 'last']);
      const key2 = stableRowKey(row, ['last', 'first']);

      expect(key1).not.toBe(key2);
    });
  });

  describe('buildExistingKeySet', () => {
    const headers = ['Name', 'Age', 'City'];
    const rows = [
      ['Name', 'Age', 'City'], // Header row
      ['John', '25', 'NYC'], // Data row 1
      ['Jane', '30', 'LA'], // Data row 2
      ['Bob', '35', 'Chicago'] // Data row 3
    ];

    it('should build key set from existing rows', () => {
      const keySet = buildExistingKeySet(rows, headers, ['Name']);

      expect(keySet.size).toBe(3);
      expect(keySet.has(stableRowKey({ Name: 'John' }, ['Name']))).toBe(true);
      expect(keySet.has(stableRowKey({ Name: 'Jane' }, ['Name']))).toBe(true);
      expect(keySet.has(stableRowKey({ Name: 'Bob' }, ['Name']))).toBe(true);
    });

    it('should use multiple key fields', () => {
      const keySet = buildExistingKeySet(rows, headers, ['Name', 'City']);

      expect(keySet.size).toBe(3);
      expect(keySet.has(stableRowKey({ Name: 'John', City: 'NYC' }, ['Name', 'City']))).toBe(true);
    });

    it('should skip header row', () => {
      const keySet = buildExistingKeySet(rows, headers, ['Name']);

      // Should not include header row data
      expect(keySet.has(stableRowKey({ Name: 'Name' }, ['Name']))).toBe(false);
    });

    it('should handle missing columns', () => {
      const incompleteRows = [
        ['Name', 'Age'],
        ['John', '25'],
        ['Jane', '30']
      ];

      const keySet = buildExistingKeySet(incompleteRows, ['Name', 'Age'], ['Name', 'City']);

      expect(keySet.size).toBe(2);
      // City field is missing, so it should be empty string in key
      expect(keySet.has(stableRowKey({ Name: 'John', City: '' }, ['Name', 'City']))).toBe(true);
    });

    it('should handle empty data', () => {
      const emptyRows: string[][] = [];
      const keySet = buildExistingKeySet(emptyRows, headers, ['Name']);

      expect(keySet.size).toBe(0);
    });

    it('should handle rows with missing data', () => {
      const sparseRows = [
        ['Name', 'Age', 'City'],
        ['John', '25'], // Missing city
        ['', '30', 'LA'], // Missing name
        ['Bob', '', 'Chicago'] // Missing age
      ];

      const keySet = buildExistingKeySet(sparseRows, headers, ['Name']);

      expect(keySet.size).toBe(3);
    });
  });

  describe('filterNewRows', () => {
    it('should filter out duplicate rows', () => {
      const existingKeys = new Set([
        stableRowKey({ name: 'John', age: '25' }, ['name', 'age'])
      ]);

      const candidateRows: RowObject[] = [
        { name: 'John', age: '25' }, // Duplicate
        { name: 'Jane', age: '30' }, // New
        { name: 'Bob', age: '35' } // New
      ];

      const result = filterNewRows(candidateRows, existingKeys, ['name', 'age']);

      expect(result).toEqual([
        { name: 'Jane', age: '30' },
        { name: 'Bob', age: '35' }
      ]);
      expect(existingKeys.size).toBe(3); // Original + 2 new
    });

    it('should handle empty candidate rows', () => {
      const existingKeys = new Set<string>();
      const candidateRows: RowObject[] = [];

      const result = filterNewRows(candidateRows, existingKeys, ['name']);

      expect(result).toEqual([]);
    });

    it('should handle empty existing keys', () => {
      const existingKeys = new Set<string>();
      const candidateRows: RowObject[] = [
        { name: 'John' },
        { name: 'Jane' }
      ];

      const result = filterNewRows(candidateRows, existingKeys, ['name']);

      expect(result).toEqual(candidateRows);
      expect(existingKeys.size).toBe(2);
    });

    it('should be case insensitive and trim whitespace', () => {
      const existingKeys = new Set([
        stableRowKey({ name: 'John' }, ['name'])
      ]);

      const candidateRows: RowObject[] = [
        { name: ' JOHN ' }, // Should be considered duplicate
        { name: 'Jane' } // Should be new
      ];

      const result = filterNewRows(candidateRows, existingKeys, ['name']);

      expect(result).toEqual([
        { name: 'Jane' }
      ]);
    });

    it('should handle complex key combinations', () => {
      const existingKeys = new Set([
        stableRowKey({ name: 'John', city: 'NYC', amount: '100' }, ['name', 'city'])
      ]);

      const candidateRows: RowObject[] = [
        { name: 'John', city: 'NYC', amount: '200' }, // Duplicate (same name+city)
        { name: 'John', city: 'LA', amount: '100' }, // New (different city)
        { name: 'Jane', city: 'NYC', amount: '100' } // New (different name)
      ];

      const result = filterNewRows(candidateRows, existingKeys, ['name', 'city']);

      expect(result).toEqual([
        { name: 'John', city: 'LA', amount: '100' },
        { name: 'Jane', city: 'NYC', amount: '100' }
      ]);
    });

    it('should modify the existing keys set', () => {
      const existingKeys = new Set<string>();
      const candidateRows: RowObject[] = [
        { name: 'John' },
        { name: 'Jane' }
      ];

      expect(existingKeys.size).toBe(0);

      filterNewRows(candidateRows, existingKeys, ['name']);

      expect(existingKeys.size).toBe(2);
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end with typical data', () => {
      const headers = ['Name', 'Email', 'Amount'];
      const existingRows = [
        ['Name', 'Email', 'Amount'],
        ['John Doe', 'john@example.com', '100.00'],
        ['Jane Smith', 'jane@example.com', '200.00']
      ];

      // Build existing key set
      const existingKeys = buildExistingKeySet(existingRows, headers, ['Email']);

      // New candidate rows
      const candidateRows: RowObject[] = [
        { Name: 'Bob Wilson', Email: 'bob@example.com', Amount: '150.00' }, // New
        { Name: 'Jane Smith', Email: 'jane@example.com', Amount: '250.00' } // Duplicate email
      ];

      // Filter new rows
      const newRows = filterNewRows(candidateRows, existingKeys, ['Email']);

      expect(newRows).toEqual([
        { Name: 'Bob Wilson', Email: 'bob@example.com', Amount: '150.00' }
      ]);
      expect(existingKeys.size).toBe(3); // 2 original + 1 new
    });

    it('should handle edge cases', () => {
      // Empty strings should be handled
      const row1: RowObject = { name: '', email: 'test@example.com' };
      const row2: RowObject = { name: '', email: 'test@example.com' };

      const key1 = stableRowKey(row1, ['name', 'email']);
      const key2 = stableRowKey(row2, ['name', 'email']);

      expect(key1).toBe(key2);

      // Null/undefined should be handled
      const row3: RowObject = { name: null, email: undefined };
      const key3 = stableRowKey(row3, ['name', 'email']);

      expect(key3).toBeDefined();
    });
  });
});
