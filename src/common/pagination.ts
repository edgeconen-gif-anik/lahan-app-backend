export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageMeta = {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Paging is opt-in: when `page` is missing the caller gets the legacy plain
 * array, so existing screens that load a whole list keep working.
 */
export function resolvePaging(page: unknown, limit: unknown) {
  const resolvedPage = toPositiveInt(page);
  if (!resolvedPage) return null;

  const resolvedLimit = Math.min(
    toPositiveInt(limit) ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  return {
    page: resolvedPage,
    limit: resolvedLimit,
    skip: (resolvedPage - 1) * resolvedLimit,
  };
}

export function buildPageMeta(
  total: number,
  page: number,
  limit: number,
): PageMeta {
  return {
    total,
    page,
    limit,
    lastPage: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Keep a page carried over from another filter within the available results. */
export function clampPaging(
  paging: NonNullable<ReturnType<typeof resolvePaging>>,
  total: number,
) {
  const lastPage = Math.max(1, Math.ceil(total / paging.limit));
  const page = Math.min(paging.page, lastPage);
  return { ...paging, page, skip: (page - 1) * paging.limit };
}
