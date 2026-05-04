const FISCAL_YEAR_PATTERN = /^(\d{4})\s*[/-]\s*(\d{2,3})$/;

export function getCurrentNepaliFiscalYear(referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1;
  const adYear = referenceDate.getFullYear();
  const fiscalStartAdYear = month >= 7 ? adYear : adYear - 1;
  const bsStartYear = fiscalStartAdYear + (month >= 4 ? 57 : 56);
  const bsEndYear = bsStartYear + 1;

  return `${bsStartYear}/${String(bsEndYear).slice(-3)}`;
}

export function normalizeFiscalYear(value?: string | null) {
  const match = value?.trim().match(FISCAL_YEAR_PATTERN);
  if (!match) {
    return null;
  }

  const [, startYear, endYear] = match;
  return `${startYear}/${endYear.padStart(3, '0')}`;
}

export function getFiscalYearVariants(value?: string | null) {
  const normalized = normalizeFiscalYear(value);

  if (!normalized) {
    return value?.trim() ? [value.trim()] : [];
  }

  const [startYear, endYearThreeDigit] = normalized.split('/');
  const endYearTwoDigit = endYearThreeDigit.slice(-2);

  return Array.from(
    new Set([
      normalized,
      `${startYear}/${endYearTwoDigit}`,
      `${startYear}-${endYearThreeDigit}`,
      `${startYear}-${endYearTwoDigit}`,
    ]),
  );
}

export function sortFiscalYearsDescending(a: string, b: string) {
  const aStart = Number(normalizeFiscalYear(a)?.slice(0, 4) ?? 0);
  const bStart = Number(normalizeFiscalYear(b)?.slice(0, 4) ?? 0);
  return bStart - aStart || b.localeCompare(a);
}
