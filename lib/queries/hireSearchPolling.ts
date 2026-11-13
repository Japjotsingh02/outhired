// Pure rules for polling a hire search. No React, so they can be tested directly.

export type HireSearchStatus = "NOT_STARTED" | "RUNNING" | "DONE" | "FAILED";

/** What GET/POST /api/jobs/[id]/search returns (dates are ISO strings). */
export interface HireSearchSummary {
  searchStatus: HireSearchStatus;
  searchStartedAt: string | null;
  lastSearchedAt: string | null;
  nextSearchAllowedAt: string | null;
  candidateCount: number;
  searchError: string | null;
}

export const POLL_INTERVAL_MS = 3_000;
/** Polling stops this long after the run started (or after the last "Check again"). */
export const POLL_WINDOW_MS = 4 * 60 * 1000;
/** "Having trouble updating" shows once this many polls in a row have failed. */
export const TROUBLE_AFTER_FAILURES = 3;

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;

/** Milliseconds for a UTC ISO timestamp from our own API, or null. Parsed without `new Date(string)`. */
export function isoToMs(iso: string | null | undefined): number | null {
  const match = iso ? ISO_UTC.exec(iso) : null;
  if (!match) return null;
  const [, y, mo, d, h, mi, s, frac] = match;
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000) : 0;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
}

/** True once the polling window has passed. `checkedAt` is the last "Check again" click, if any. */
export function pollingExpired(
  summary: Pick<HireSearchSummary, "searchStartedAt"> | undefined,
  nowMs: number,
  checkedAt: number | null,
): boolean {
  const origin = Math.max(isoToMs(summary?.searchStartedAt) ?? 0, checkedAt ?? 0);
  return origin > 0 && nowMs - origin >= POLL_WINDOW_MS;
}

/** The query's refetchInterval: 3 s while RUNNING and inside the window, otherwise off. */
export function hireSearchRefetchInterval(
  summary: HireSearchSummary | undefined,
  nowMs: number,
  checkedAt: number | null = null,
): number | false {
  if (summary?.searchStatus !== "RUNNING") return false;
  return pollingExpired(summary, nowMs, checkedAt) ? false : POLL_INTERVAL_MS;
}

/** Consecutive failed polls after one more query event; a success resets it. */
export function nextFailureCount(current: number, event: "success" | "error"): number {
  return event === "success" ? 0 : current + 1;
}

export function isHavingTrouble(consecutiveFailures: number): boolean {
  return consecutiveFailures >= TROUBLE_AFTER_FAILURES;
}
