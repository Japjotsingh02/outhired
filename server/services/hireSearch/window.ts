import "server-only";
import { HIRE_WINDOW_EXTRA_DAYS } from "@/constants/jobParsing";
import { formatYearMonth, parseYearMonth } from "@/lib/postedMonth";

const DAY_MS = 86_400_000;

export interface HireWindowMonths {
  /** First month people may have joined in ("YYYY-MM"). */
  sinceMonth: string;
  /** Last month people may have joined in ("YYYY-MM"). */
  untilMonth: string;
}

/**
 * The posted month through the month containing (last day of the posted month +
 * HIRE_WINDOW_EXTRA_DAYS). All UTC; the year rolls over naturally.
 */
export function hireWindow(postedMonth: Date): HireWindowMonths {
  const year = postedMonth.getUTCFullYear();
  const month = postedMonth.getUTCMonth();
  const lastDay = Date.UTC(year, month + 1, 1) - DAY_MS;
  const until = new Date(lastDay + HIRE_WINDOW_EXTRA_DAYS * DAY_MS);
  return {
    sinceMonth: formatYearMonth({ year, month: month + 1 }),
    untilMonth: formatYearMonth({ year: until.getUTCFullYear(), month: until.getUTCMonth() + 1 }),
  };
}

/** Months since year 0, for comparing "YYYY-MM" values; null when malformed. */
export function monthIndex(value: string): number | null {
  const parsed = parseYearMonth(value);
  return parsed ? parsed.year * 12 + (parsed.month - 1) : null;
}

/** "YYYY-MM" -> Date at the 1st, UTC midnight. */
export function monthToDate(value: string): Date | null {
  const parsed = parseYearMonth(value);
  return parsed ? new Date(Date.UTC(parsed.year, parsed.month - 1, 1)) : null;
}
