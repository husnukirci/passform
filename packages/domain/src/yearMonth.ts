import { DomainError, type YearMonth } from "./types.ts";

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isYearMonth(s: string): boolean {
  return YEAR_MONTH.test(s);
}

/**
 * Lexical comparison is correct because both parts are fixed-width and
 * zero-padded; the tests prove it across a month and a year boundary.
 */
export function compareYearMonth(a: YearMonth, b: YearMonth): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Inclusive on both ends; a null bound is open on that side. */
export function withinWindow(
  date: YearMonth,
  from: YearMonth | null,
  to: YearMonth | null,
): boolean {
  assertYearMonth("date", date);
  if (from !== null) assertYearMonth("from", from);
  if (to !== null) assertYearMonth("to", to);

  const afterFrom = from === null || compareYearMonth(from, date) <= 0;
  const beforeTo = to === null || compareYearMonth(date, to) <= 0;
  return afterFrom && beforeTo;
}

function assertYearMonth(field: string, value: string): void {
  if (!isYearMonth(value)) {
    throw new DomainError(`${field}: expected YYYY-MM, got "${value}"`);
  }
}
