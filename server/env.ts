import "server-only";
import { z } from "zod";
import { MAX_RESULTS_PER_SEARCH } from "@/lib/plans";

// Lazy: parsed on first use, never at import, so a missing optional value cannot crash a build.
const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback);

/** PDL bills one credit per record returned, so the page size is the cost control: never above this. */
export const PDL_MAX_RESULTS_CAP = 25;

const hireSearchSchema = z.object({
  PDL_API_KEY: z.string().trim().min(1).optional().catch(undefined),
  PDL_MAX_RESULTS: positiveInt(MAX_RESULTS_PER_SEARCH),
  PDL_MONTHLY_CREDIT_BUDGET: positiveInt(90),
  HIRE_SEARCH_ALLOWED_EMAILS: z.string().optional(),
  HIRE_SEARCH_DAILY_LIMIT_PER_USER: positiveInt(10),
  HIRE_SEARCH_REFRESH_AFTER_HOURS: positiveInt(24),
  HIRE_CACHE_TTL_HOURS: positiveInt(168),
  HIRE_EMPTY_CACHE_TTL_HOURS: positiveInt(24),
  HIRE_CACHE_DISABLED: z.string().optional(),
});

export interface HireSearchConfig {
  pdlApiKey: string | undefined;
  /** Records requested per search (1 credit each); at most PDL_MAX_RESULTS_CAP. */
  maxResults: number;
  /** Credits all users together may spend per UTC month. */
  monthlyCreditBudget: number;
  /** Lowercased emails allowed to trigger provider searches; null means everyone. */
  allowedEmails: string[] | null;
  dailyLimitPerUser: number;
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
    pdlApiKey: env.PDL_API_KEY,
    maxResults: Math.min(env.PDL_MAX_RESULTS, PDL_MAX_RESULTS_CAP),
    monthlyCreditBudget: env.PDL_MONTHLY_CREDIT_BUDGET,
    allowedEmails: allowed.length > 0 ? allowed : null,
    dailyLimitPerUser: env.HIRE_SEARCH_DAILY_LIMIT_PER_USER,
    refreshAfterHours: env.HIRE_SEARCH_REFRESH_AFTER_HOURS,
    cacheTtlHours: env.HIRE_CACHE_TTL_HOURS,
    emptyCacheTtlHours: env.HIRE_EMPTY_CACHE_TTL_HOURS,
    cacheDisabled:
      env.HIRE_CACHE_DISABLED === "true" && process.env.NODE_ENV !== "production",
  };
}
