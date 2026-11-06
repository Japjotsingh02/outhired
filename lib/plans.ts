// Plan numbers and display copy. Safe for browser and server: the server limits in
// server/services/billing/plans.ts are built from these values, so each number lives here once.
// The hidden Compare fair-use cap is server-only and deliberately not in this file.

export type PlanId = "FREE" | "PRO";

export const FREE_HIRE_SEARCHES_TOTAL = 1;
export const FREE_COMPARES_TOTAL = 1;
export const PRO_HIRE_SEARCHES_PER_MONTH = 10;
export const PRO_PRICE_USD = 20;
/** Likely hires returned per search (PDL bills one credit per record). */
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
      { text: `${FREE_HIRE_SEARCHES_TOTAL} new-hire search to try it` },
      { text: "Community votes on results" },
      { text: "Unlimited access to results someone already searched" },
      { text: `${FREE_COMPARES_TOTAL} Compare gap analysis` },
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
      { text: `${PRO_HIRE_SEARCHES_PER_MONTH} new-hire searches per month` },
      { text: "Unlimited Compare gap analyses" },
      { text: `Up to ${MAX_RESULTS_PER_SEARCH} likely hires per search` },
      { text: "Re-search alerts", note: "Coming soon" },
      { text: "Priority support" },
    ],
  },
};

export const PRICING_NOTE = "Prices in USD. Cancel any time. Taxes may apply.";

/** What GET /api/me/usage returns (dates are ISO strings; limit null = unlimited). */
export interface UsageMeter {
  used: number;
  limit: number | null;
  resetsAt: string | null;
}
export interface UsageSummary {
  plan: PlanId;
  hireSearch: UsageMeter;
  compare: UsageMeter;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Dec 1" from an ISO timestamp, in UTC (the periods are UTC months). */
export function formatResetDay(iso: string | null | undefined): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})T/.exec(iso) : null;
  if (!match) return null;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

/** The panel line for a meter: "1 free search", "7 of 10 left this month, resets Dec 1". Null when unlimited. */
export function usageLine(
  plan: PlanId,
  meter: UsageMeter,
  noun: "search" | "Compare",
): string | null {
  if (meter.limit === null) return null;
  const left = Math.max(0, meter.limit - meter.used);
  if (plan === "FREE") {
    return left > 0 ? `${left} free ${noun === "search" ? "search" : "Compare"}` : `No free ${noun === "search" ? "searches" : "Compares"} left`;
  }
  const reset = formatResetDay(meter.resetsAt);
  return `${left} of ${meter.limit} left this month${reset ? `, resets ${reset}` : ""}`;
}

/** Error codes that mean "a plan limit stopped this", where the fix is the pricing page. */
const UPGRADE_CODES = new Set(["PLAN_LIMIT_REACHED", "FREE_SEARCHES_PAUSED"]);
export function isUpgradeCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && UPGRADE_CODES.has(code);
}
