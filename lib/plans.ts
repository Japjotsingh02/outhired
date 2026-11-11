// Plan numbers and display copy. Safe for browser and server: the server limits in
// server/services/billing/plans.ts are built from these values, so each number lives here once.
// The hidden Compare fair-use cap is server-only and deliberately not in this file.

export type PlanId = "FREE" | "PRO";

/** 1 credit = 1 person unlocked on a job. Credits reset at the start of each UTC month. */
export const FREE_MONTHLY_CREDITS = 3;
export const PRO_MONTHLY_CREDITS = 50;
export const FREE_MONTHLY_COMPARES = 1;
export const PRO_PRICE_USD = 20;
/** Most people one user can unlock on one job (PDL bills one credit per record). */
export const MAX_RESULTS_PER_SEARCH = 5;
export const SUPPORT_EMAIL = "japjot@outhired.app";

export interface PlanDisplay {
  id: PlanId;
  name: string;
  priceUsd: number;
  period: string;
  tagline: string;
  badge?: string;
  features: { text: string; note?: string }[];
}

export const PLAN_DISPLAY: Record<PlanId, PlanDisplay> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceUsd: 0,
    period: "forever",
    tagline: "For trying it on the role that stung the most.",
    features: [
      { text: "Unlimited job tracking and parsing" },
      { text: `${FREE_MONTHLY_CREDITS} free credits every month` },
      { text: "Community votes on results" },
      { text: `${FREE_MONTHLY_COMPARES} Compare gap analysis per month` },
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceUsd: PRO_PRICE_USD,
    period: "month",
    tagline: "For an active search across many companies.",
    badge: "Most useful while job hunting",
    features: [
      { text: "Everything in Free" },
      {
        text: `${PRO_MONTHLY_CREDITS} credits every month (about ${Math.round(PRO_MONTHLY_CREDITS / MAX_RESULTS_PER_SEARCH)} searches)`,
      },
      { text: "Compare with anyone you unlock" },
      { text: "Searches that find nobody are free" },
      { text: "Re-search alerts", note: "Coming soon" },
      { text: "Priority support" },
    ],
  },
};

export const PRICING_NOTE =
  "1 credit = 1 person found. Credits reset every month. Cancel any time. Prices in USD; taxes may apply.";

/** What GET /api/me/usage returns (dates are ISO strings; limit null = unlimited). */
export interface CreditsMeter {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}
export interface CompareMeter {
  used: number;
  limit: number | null;
  resetsAt: string | null;
}
export interface UsageSummary {
  plan: PlanId;
  credits: CreditsMeter;
  compare: CompareMeter;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Dec 1" from an ISO timestamp, in UTC (the periods are UTC months). */
export function formatResetDay(iso: string | null | undefined): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})T/.exec(iso) : null;
  if (!match) return null;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

/** "Uses up to 3 credits · 3 left this month" for the search form. */
export function creditsBeforeSearchLine(credits: CreditsMeter): string {
  const upTo = Math.min(MAX_RESULTS_PER_SEARCH, credits.remaining);
  return `Uses up to ${upTo} ${upTo === 1 ? "credit" : "credits"} · ${credits.remaining} left this month`;
}

/** "1 Compare per month" or, once used, "Compare used · resets Dec 1". Null when unlimited. */
export function compareLine(compare: CompareMeter): string | null {
  if (compare.limit === null) return null;
  if (compare.used < compare.limit) return `${compare.limit} Compare per month`;
  const reset = formatResetDay(compare.resetsAt);
  return reset ? `Compare used · resets ${reset}` : "Compare used";
}

/** Error codes that mean "a plan limit stopped this", where the fix is the pricing page. */
const UPGRADE_CODES = new Set(["PLAN_LIMIT_REACHED", "FREE_SEARCHES_PAUSED"]);
export function isUpgradeCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && UPGRADE_CODES.has(code);
}
