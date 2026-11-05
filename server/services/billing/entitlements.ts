import "server-only";
import type { Plan, UsageKind } from "@/generated/prisma";
import type { PlanId, UsageSummary } from "@/lib/plans";
import { getHireSearchConfig } from "@/server/env";
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from "@/server/errors";
import {
  countUsage,
  deleteUsageEvent,
  findUserPlan,
  setUsageCredits,
  withLockedUser,
  type LockedUser,
} from "@/server/repositories/usage.repo";
import { PLAN_LIMITS, PRO_BUDGET_CEILING, type FeatureLimit } from "@/server/services/billing/plans";

type Feature = "hire_search" | "compare";

/** An event inserted before a paid action. Refund it if the action fails; record its credits if it works. */
export interface UsageReservation {
  eventId: string;
  /** Provider credits this search may still spend this month (hire searches only). */
  creditsAllowed: number;
}

/** 00:00 UTC on the 1st of the month containing `now`. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** 00:00 UTC on the 1st of the next month. */
export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** An expired Pro plan counts as Free. */
export function effectivePlan(row: { plan: Plan; planEndsAt: Date | null }, now: Date): PlanId {
  if (row.plan === "PRO" && (row.planEndsAt === null || row.planEndsAt.getTime() > now.getTime())) return "PRO";
  return "FREE";
}

const KIND: Record<Feature, UsageKind> = { hire_search: "HIRE_SEARCH", compare: "COMPARE" };

function periodStart(rule: FeatureLimit, now: Date): Date | null {
  return rule.period === "month" ? monthStart(now) : null;
}

function resetsAt(rule: FeatureLimit, now: Date): string | null {
  return rule.period === "month" ? nextMonthStart(now).toISOString() : null;
}

/** The cap that actually blocks: the plan limit, or the hidden fair-use cap when the plan is unlimited. */
function effectiveLimit(rule: FeatureLimit): number | null {
  return rule.limit ?? rule.fairUse ?? null;
}

async function checkPlanLimit(user: LockedUser, plan: PlanId, feature: Feature, now: Date): Promise<void> {
  const rule = PLAN_LIMITS[plan][feature === "hire_search" ? "hireSearch" : "compare"];
  const limit = effectiveLimit(rule);
  if (limit === null) return;
  const used = await user.count(KIND[feature], periodStart(rule, now));
  if (used >= limit) {
    throw new ForbiddenError("Plan limit reached", { feature, plan, limit, used, resetsAt: resetsAt(rule, now) }, "PLAN_LIMIT_REACHED");
  }
}

/**
 * Called after the allowlist and the cache check, so only a search that will call the provider
 * gets here. In one transaction (user row locked): plan limit, then the shared monthly credit
 * budget, then the usage event is inserted. Free is paused at 100% of the budget; Pro at 120%.
 */
export async function assertCanHireSearch(
  userId: string,
  jobId: string | null = null,
  now: Date = new Date(),
): Promise<UsageReservation> {
  const reservation = await withLockedUser(userId, async (user) => {
    const plan = effectivePlan(user, now);
    await checkPlanLimit(user, plan, "hire_search", now);

    const budget = getHireSearchConfig().monthlyCreditBudget;
    const spent = await user.creditsSince(monthStart(now));
    if (plan === "FREE" && spent >= budget) {
      throw new ForbiddenError(
        "Free searches are full this month. Upgrade to Pro or try again next month.",
        undefined,
        "FREE_SEARCHES_PAUSED",
      );
    }
    const ceiling = plan === "PRO" ? Math.floor(budget * PRO_BUDGET_CEILING) : budget;
    if (spent >= ceiling) {
      throw new ServiceUnavailableError(
        "Searches are temporarily unavailable. Please try again later.",
        undefined,
        "SEARCH_CAPACITY_REACHED",
      );
    }
    const eventId = await user.insert("HIRE_SEARCH", jobId, now);
    return { eventId, creditsAllowed: ceiling - spent };
  });
  if (!reservation) throw new NotFoundError("User not found");
  return reservation;
}

/** Compare: Free gets one ever; Pro is unlimited up to a hidden fair-use cap per month. */
export async function assertCanCompare(userId: string, now: Date = new Date()): Promise<UsageReservation> {
  const reservation = await withLockedUser(userId, async (user) => {
    await checkPlanLimit(user, effectivePlan(user, now), "compare", now);
    return { eventId: await user.insert("COMPARE", null, now), creditsAllowed: 0 };
  });
  if (!reservation) throw new NotFoundError("User not found");
  return reservation;
}

/** The action failed before it produced anything: the user keeps their use. */
export async function refundUsage(reservation: UsageReservation): Promise<void> {
  try {
    await deleteUsageEvent(reservation.eventId);
  } catch (err) {
    console.error("[billing] Refund failed:", err instanceof Error ? err.message : String(err));
  }
}

/** The provider returned records: remember how many credits they cost (for the shared budget). */
export async function recordCredits(reservation: UsageReservation, creditsUsed: number): Promise<void> {
  try {
    await setUsageCredits(reservation.eventId, creditsUsed);
  } catch (err) {
    console.error("[billing] Recording credits failed:", err instanceof Error ? err.message : String(err));
  }
}

/** The plan the user is on right now (an expired Pro counts as Free); null if the user is gone. */
export async function getPlanId(userId: string, now: Date = new Date()): Promise<PlanId | null> {
  const row = await findUserPlan(userId);
  return row ? effectivePlan(row, now) : null;
}

/** The numbers behind GET /api/me/usage. The hidden fair-use cap is never included. */
export async function getUsage(userId: string, now: Date = new Date()): Promise<UsageSummary> {
  const row = await findUserPlan(userId);
  if (!row) throw new NotFoundError("User not found");
  const plan = effectivePlan(row, now);
  const meter = async (feature: Feature) => {
    const rule = PLAN_LIMITS[plan][feature === "hire_search" ? "hireSearch" : "compare"];
    return {
      used: await countUsage(userId, KIND[feature], periodStart(rule, now)),
      limit: rule.limit,
      resetsAt: rule.limit === null ? null : resetsAt(rule, now),
    };
  };
  return { plan, hireSearch: await meter("hire_search"), compare: await meter("compare") };
}
