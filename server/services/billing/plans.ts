import "server-only";
import {
  FREE_MONTHLY_COMPARES,
  FREE_MONTHLY_CREDITS,
  PRO_MONTHLY_CREDITS,
  type PlanId,
} from "@/lib/plans";

export interface PlanLimits {
  /** People the user may unlock per UTC month (1 credit each). */
  monthlyCredits: number;
  compare: {
    /** Compares per UTC month; null = unlimited in the UI. */
    limit: number | null;
    /** Hidden cap on an "unlimited" feature; never shown to the user. */
    fairUse?: number;
  };
}

/** The single source of truth for what each plan may do. Every period is a UTC calendar month. */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: { monthlyCredits: FREE_MONTHLY_CREDITS, compare: { limit: FREE_MONTHLY_COMPARES } },
  PRO: { monthlyCredits: PRO_MONTHLY_CREDITS, compare: { limit: null, fairUse: 50 } },
};

/** Pro may keep searching until the shared PDL budget is this share used; Free stops at 100%. */
export const PRO_BUDGET_CEILING = 1.2;
