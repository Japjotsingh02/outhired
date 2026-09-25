import { POSTED_MONTH_MAX_AGE_MONTHS } from "@/constants/jobParsing";

// Shared by the month/year dropdown and POST /api/jobs so both enforce the same
// rule: a posted month cannot be in the future or more than 3 years old.
// Everything uses UTC so client and server agree on "this month".

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

const monthIndex = ({ year, month }: YearMonth) => year * 12 + (month - 1);

/** Accepts "YYYY-MM" or a full "YYYY-MM-DD" and returns its year and month. */
export function parseYearMonth(value: string): YearMonth | null {
  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The 1st of the month at UTC midnight: the value stored in Job.postedMonth. */
export function postedMonthToDate({ year, month }: YearMonth): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Newest and oldest months a job can have been posted in. */
export function postedMonthBounds(now: Date = new Date()): { min: YearMonth; max: YearMonth } {
  const max = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const minIndex = monthIndex(max) - POSTED_MONTH_MAX_AGE_MONTHS;
  return { min: { year: Math.floor(minIndex / 12), month: (minIndex % 12) + 1 }, max };
}

export function isAllowedPostedMonth(value: YearMonth, now: Date = new Date()): boolean {
  const { min, max } = postedMonthBounds(now);
  const index = monthIndex(value);
  return index >= monthIndex(min) && index <= monthIndex(max);
}

/** Returns an error message, or null when the value is a valid posted month. */
export function validatePostedMonth(value: string, now: Date = new Date()): string | null {
  const parsed = parseYearMonth(value);
  if (!parsed) return "Choose the month and year the job was posted.";
  const { min, max } = postedMonthBounds(now);
  const index = monthIndex(parsed);
  if (index > monthIndex(max)) return "The posted month cannot be in the future.";
  if (index < monthIndex(min)) return "The posted month cannot be more than 3 years ago.";
  return null;
}
