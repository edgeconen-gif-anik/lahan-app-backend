const FISCAL_YEAR_PATTERN = /^(\d{2,4})\s*[/-]\s*(\d{2,4})$/;
const NEPALI_FISCAL_YEAR_START_MONTH = 7;
const NEPALI_FISCAL_YEAR_START_DAY = 16;

export function getCurrentNepaliFiscalYear(referenceDate = new Date()) {
  const month = referenceDate.getMonth() + 1;
  const day = referenceDate.getDate();
  const adYear = referenceDate.getFullYear();
  const hasNewFiscalYearStarted =
    month > NEPALI_FISCAL_YEAR_START_MONTH ||
    (month === NEPALI_FISCAL_YEAR_START_MONTH &&
      day >= NEPALI_FISCAL_YEAR_START_DAY);
  const fiscalStartAdYear = hasNewFiscalYearStarted ? adYear : adYear - 1;
  const bsStartYear = fiscalStartAdYear + 57;
  const bsEndYear = bsStartYear + 1;

  return `${bsStartYear}/${String(bsEndYear).slice(-3)}`;
}

export function normalizeFiscalYear(value?: string | null) {
  const match = value?.trim().match(FISCAL_YEAR_PATTERN);
  if (!match) {
    return null;
  }

  const [, startYearRaw, endYearRaw] = match;
  const startYear =
    startYearRaw.length === 4
      ? startYearRaw
      : startYearRaw.length === 3
        ? `2${startYearRaw}`
        : `20${startYearRaw}`;
  const endYear = endYearRaw.slice(-3).padStart(3, '0');

  return `${startYear}/${endYear}`;
}

export function getFiscalYearVariants(value?: string | null) {
  const normalized = normalizeFiscalYear(value);

  if (!normalized) {
    return value?.trim() ? [value.trim()] : [];
  }

  const [startYear, endYearThreeDigit] = normalized.split('/');
  const endYearTwoDigit = endYearThreeDigit.slice(-2);
  const startYearTwoDigit = startYear.slice(-2);

  return Array.from(
    new Set([
      normalized,
      `${startYear}/${endYearTwoDigit}`,
      `${startYear}-${endYearThreeDigit}`,
      `${startYear}-${endYearTwoDigit}`,
      `${startYearTwoDigit}/${endYearThreeDigit}`,
      `${startYearTwoDigit}/${endYearTwoDigit}`,
      `${startYearTwoDigit}-${endYearThreeDigit}`,
      `${startYearTwoDigit}-${endYearTwoDigit}`,
    ]),
  );
}

export function sortFiscalYearsDescending(a: string, b: string) {
  const aStart = Number(normalizeFiscalYear(a)?.slice(0, 4) ?? 0);
  const bStart = Number(normalizeFiscalYear(b)?.slice(0, 4) ?? 0);
  return bStart - aStart || b.localeCompare(a);
}
