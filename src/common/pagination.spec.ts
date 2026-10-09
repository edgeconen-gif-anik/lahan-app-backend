import { buildPageMeta, resolvePaging } from './pagination';

describe('pagination helpers', () => {
  it('returns null (legacy array mode) when no page is given', () => {
    expect(resolvePaging(undefined, '10')).toBeNull();
    expect(resolvePaging('0', '10')).toBeNull();
    expect(resolvePaging('abc', '10')).toBeNull();
  });

  it('defaults and caps the page size', () => {
    expect(resolvePaging('2', undefined)).toEqual({
      page: 2,
      limit: 20,
      skip: 20,
    });
    expect(resolvePaging('1', '5000')).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });

  it('always reports at least one page', () => {
    expect(buildPageMeta(0, 1, 20).lastPage).toBe(1);
    expect(buildPageMeta(41, 1, 20).lastPage).toBe(3);
  });
});
