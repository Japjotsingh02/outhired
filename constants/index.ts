/** Status badge colours and labels keyed by job status. */
export const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "Applied", bg: "var(--yellow-soft)", color: "var(--yellow)" },
  REJECTED: { label: "Rejected", bg: "var(--red-soft)", color: "var(--red)" },
  INTERVIEWING: { label: "Interview", bg: "var(--green-soft)", color: "var(--green)" },
};

export const TAB_LABELS: Record<string, string> = {
  candidates: "Potential hires",
  gap: "Compare",
  log: "Discovery log",
};

/** Shared external service endpoints and operational limits. */
export const APOLLO_BASE = "https://api.apollo.io/api/v1";
export const APOLLO_LEGACY_BASE = "https://api.apollo.io/v1";
export const JOB_PARSE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PROXYCURL_CACHE_TTL_MS = 60 * 60 * 1000;
export const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT = 10;
