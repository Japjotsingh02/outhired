import "server-only";
import { stringValue } from "@/server/services/jobParsing/utils/values";

// ─── Date utilities ──────────────────────────────────────────────────────────
// All dates are stored as "YYYY-MM-01" (month + year only). Nothing here calls
// `new Date(<string>)`: that is timezone dependent (in IST "March 12, 2026"
// becomes 2026-03-11). Strings are parsed with regexes and lookup tables, and
// relative dates use UTC epoch math.

const MONTH_LOOKUP: Record<string, number> = (() => {
  const names = [
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
  ];
  const lookup: Record<string, number> = { sept: 9 };
  names.forEach((name, index) => {
    lookup[name] = index + 1;
    lookup[name.slice(0, 3)] = index + 1;
  });
  return lookup;
})();

const DAY_MS = 86_400_000;

function monthNumber(name: string): number | null {
  const key = name.toLowerCase();
  return Object.prototype.hasOwnProperty.call(MONTH_LOOKUP, key)
    ? MONTH_LOOKUP[key]
    : null;
}

function formatMonth(year: number, month: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function validDay(day: string | undefined): boolean {
  if (day === undefined) return true;
  const value = Number(day);
  return value >= 1 && value <= 31;
}

function parseIsoMonth(text: string): string | null {
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?=$|[T\s])/);
  if (!match || !validDay(match[3])) return null;
  return formatMonth(Number(match[1]), Number(match[2]));
}

function parseNamedMonth(text: string): string | null {
  // "March 2026", "Mar 12, 2026", "March 12th 2026"
  const monthFirst = text.match(
    /^([A-Za-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})$/,
  );
  if (monthFirst && validDay(monthFirst[2])) {
    const month = monthNumber(monthFirst[1]);
    if (month) return formatMonth(Number(monthFirst[3]), month);
  }
  // "12 March 2026", "12th of March, 2026"
  const dayFirst = text.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})$/,
  );
  if (dayFirst && validDay(dayFirst[1])) {
    const month = monthNumber(dayFirst[2]);
    if (month) return formatMonth(Number(dayFirst[3]), month);
  }
  return null;
}

function parseRelativeMonth(text: string, now: Date): string | null {
  const lower = text.toLowerCase();
  let amount: number;
  let unit: string;

  if (lower === "today" || lower === "just now") {
    amount = 0;
    unit = "day";
  } else if (lower === "yesterday") {
    amount = 1;
    unit = "day";
  } else {
    const match = lower.match(/^(\d+|an?|one)\s+(day|week|month|year)s?\s+ago$/);
    if (!match) return null;
    amount = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
    unit = match[2];
  }
  if (amount > 1200) return null;

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  let result: number;
  if (unit === "day") result = Date.UTC(year, month, day) - amount * DAY_MS;
  else if (unit === "week") result = Date.UTC(year, month, day) - amount * 7 * DAY_MS;
  else if (unit === "month") result = Date.UTC(year, month - amount, 1);
  else result = Date.UTC(year - amount, month, 1);

  const date = new Date(result);
  return formatMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

/**
 * Parses an ISO date, a month-name date ("March 2026", "Mar 12, 2026",
 * "12 March 2026") or a relative date ("3 weeks ago") into "YYYY-MM-01".
 */
export function toIsoDate(value: unknown, now: Date = new Date()): string | null {
  const text = stringValue(value);
  if (!text) return null;
  return parseIsoMonth(text) ?? parseNamedMonth(text) ?? parseRelativeMonth(text, now);
}

/** Same as toIsoDate: month precision, always "YYYY-MM-01". */
export function toIsoMonth(value: unknown, now: Date = new Date()): string | null {
  return toIsoDate(value, now);
}

const DATE_PHRASE =
  "(?:[A-Za-z]{3,9}\\.?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?[A-Za-z]{3,9}\\.?,?\\s+\\d{4})";

const RELATIVE_PHRASE = "\\d+\\s+(?:day|week|month)s?\\s+ago";

const POSTED_DATE_PATTERNS = [
  new RegExp(`\\bposted\\s+(?:on\\s+)?(${DATE_PHRASE})`, "i"),
  new RegExp(`\\bposted\\s+(${RELATIVE_PHRASE}|yesterday|today)\\b`, "i"),
  // LinkedIn style: a bare "3 weeks ago".
  new RegExp(`\\b(${RELATIVE_PHRASE})\\b`, "i"),
];

export function findPostedDate(text: string, now: Date = new Date()): string | null {
  for (const pattern of POSTED_DATE_PATTERNS) {
    const match = text.match(pattern);
    const parsed = match ? toIsoDate(match[1], now) : null;
    if (parsed) return parsed;
  }
  return null;
}
