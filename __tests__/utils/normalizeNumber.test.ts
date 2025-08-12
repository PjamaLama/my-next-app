import { normalizeNumber } from '../../lib/utils/normalizeNumber';

describe('normalizeNumber', () => {
  const cases: Array<[string, number | null]> = [
    ['R10,000.00', 10000],
    ['500,500.00', 500500],
    ['$1,234', 1234],
    ['1 000,50', 1000.5],
    ['(1,234.56)', -1234.56],
    ['R10,000.00 incl VAT', 10000],
    ['N/A', null],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['R$ 2.345,67', 2345.67],
    ['- 1 234,00', -1234],
    ['10%', null],
    ['abc', null],
    ['1,2,3', 123], // best-effort: treat commas as thousands
  ];

  test.each(cases)('parses %s', (input, expected) => {
    const out = normalizeNumber(input);
    if (expected === null) {
      expect(out.value).toBeNull();
    } else {
      expect(out.value).not.toBeNull();
      expect(out.value!).toBeCloseTo(expected, 6);
    }
  });

  it('returns reason for nulls', () => {
    const percent = normalizeNumber('10%');
    expect(percent.value).toBeNull();
    expect(percent.reason).toBe('percent_value');

    const na = normalizeNumber('N/A');
    expect(na.value).toBeNull();
    expect(na.reason).toBeDefined();
  });
});


