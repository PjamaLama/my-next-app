import { normalizeNumber } from '../lib/utils/normalizeNumber';

describe('normalizeNumber (sheet samples and edge cases)', () => {
  const samples: Array<[string, number|null]> = [
    ['R10,000.00', 10000],
    ['500,500.00', 500500],
    ['$1,234', 1234],
    ['1 000,50', 1000.5],
    ['(1,234.56)', -1234.56],
    ['R10,000.00 incl VAT', 10000],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['R$ 2.345,67', 2345.67],
    ['- 1 234,00', -1234],
    ['10%', null],
    ['N/A', null],
    ['abc', null],
  ];

  test.each(samples)('parses %s', (input, expected) => {
    const out = normalizeNumber(input);
    if (expected === null) {
      expect(out.value).toBeNull();
    } else {
      expect(out.value).not.toBeNull();
      expect(out.value!).toBeCloseTo(expected, 6);
    }
  });
});


