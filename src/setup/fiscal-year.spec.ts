import { getFiscalYearVariants, normalizeFiscalYear } from './fiscal-year';

describe('fiscal year matching', () => {
  it.each(['2083/84', '2083/084', '2083/2084', '2083-2084', '083/84', '83/84'])(
    'matches stored forms of 2083/84 when querying %s',
    (value) => {
      expect(normalizeFiscalYear(value)).toBe('2083/084');
      expect(getFiscalYearVariants(value)).toEqual(
        expect.arrayContaining([
          '2083/84',
          '2083/084',
          '2083/2084',
          '2083-2084',
          '083/84',
          '083/084',
          '083-84',
          '83/84',
        ]),
      );
      expect(getFiscalYearVariants(value)).not.toContain('2082/2083');
    },
  );
});
