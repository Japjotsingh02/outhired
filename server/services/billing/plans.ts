import "server-only";
import {
  FREE_COMPARES_TOTAL,
  FREE_HIRE_SEARCHES_TOTAL,
  PRO_HIRE_SEARCHES_PER_MONTH,
  type PlanId,
} from "@/lib/plans";

export type PlanPeriod = "lifetime" | "month";

export interface FeatureLimit {
  /** null = unlimited. */
  limit: number | null;
  /** Free counts every event ever; Pro counts since the start of the UTC month. */
  period: PlanPeriod;
  /** Hidden cap on an "unlimited" feature; never shown to the user. */
  fairUse?: number;
}

export interface PlanLimits {
  hireSearch: FeatureLimit;
  compare: FeatureLimit;
}

/** The single source of truth for what each plan may do. */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: {
    hireSearch: { limit: FREE_HIRE_SEARCHES_TOTAL, period: "lifetime" },
    compare: { limit: FREE_COMPARES_TOTAL, period: "lifetime" },
  },
  PRO: {
    hireSearch: { limit: PRO_HIRE_SEARCHES_PER_MONTH, period: "month" },
    compare: { limit: null, period: "month", fairUse: 50 },
  },
};

/** Pro may keep searching until the shared PDL budget is this share used; Free stops at 100%. */
export const PRO_BUDGET_CEILING = 1.2;
