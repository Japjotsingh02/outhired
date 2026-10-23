import "server-only";
import { z } from "zod";

// Lazy: parsed on first use, never at import, so a missing optional value cannot crash a build.
const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback);
const positiveNumber = (fallback: number) =>
  z.coerce.number().positive().catch(fallback);

const hireSearchSchema = z.object({
  APIFY_TOKEN: z.string().trim().min(1).optional().catch(undefined),
  HIRE_ACTOR_ID: z.string().trim().min(1).catch("b2bsearch~new-hires-finder"),
  HIRE_SEARCH_ALLOWED_EMAILS: z.string().optional(),
  HIRE_SEARCH_DAILY_LIMIT_PER_USER: positiveInt(10),
  HIRE_SEARCH_MAX_RESULTS: positiveInt(50),
  HIRE_SEARCH_MAX_CHARGE_USD: positiveNumber(0.5),
  HIRE_SEARCH_RUN_TIMEOUT_MS: positiveInt(300_000),
  HIRE_SEARCH_REFRESH_AFTER_HOURS: positiveInt(24),
  HIRE_CACHE_TTL_HOURS: positiveInt(168),
  HIRE_EMPTY_CACHE_TTL_HOURS: positiveInt(24),
  HIRE_CACHE_DISABLED: z.string().optional(),
});

export interface HireSearchConfig {
  apifyToken: string | undefined;
  actorId: string;
  /** Lowercased emails allowed to trigger provider searches; null means everyone. */
  allowedEmails: string[] | null;
  dailyLimitPerUser: number;
  maxResults: number;
  maxChargeUsd: number;
  runTimeoutMs: number;
  refreshAfterHours: number;
  cacheTtlHours: number;
  emptyCacheTtlHours: number;
  /** Development only: ignored in production. */
  cacheDisabled: boolean;
}

/** Reads the hire-search settings from the environment on every call (cheap and testable). */
export function getHireSearchConfig(): HireSearchConfig {
  const env = hireSearchSchema.parse(process.env);
  const allowed = (env.HIRE_SEARCH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return {
    apifyToken: env.APIFY_TOKEN,
    actorId: env.HIRE_ACTOR_ID,
    allowedEmails: allowed.length > 0 ? allowed : null,
    dailyLimitPerUser: env.HIRE_SEARCH_DAILY_LIMIT_PER_USER,
    maxResults: env.HIRE_SEARCH_MAX_RESULTS,
    maxChargeUsd: env.HIRE_SEARCH_MAX_CHARGE_USD,
    runTimeoutMs: env.HIRE_SEARCH_RUN_TIMEOUT_MS,
    refreshAfterHours: env.HIRE_SEARCH_REFRESH_AFTER_HOURS,
    cacheTtlHours: env.HIRE_CACHE_TTL_HOURS,
    emptyCacheTtlHours: env.HIRE_EMPTY_CACHE_TTL_HOURS,
    cacheDisabled:
      env.HIRE_CACHE_DISABLED === "true" && process.env.NODE_ENV !== "production",
  };
}
