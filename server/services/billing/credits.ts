import "server-only";
import type { Plan } from "@/generated/prisma";
import type { PlanId, UsageSummary } from "@/lib/plans";
import { getHireSearchConfig } from "@/server/env";
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from "@/server/errors";
import {
  countUsage,
  deleteUsageEvent,
  findUserPlan,
  sumCredits,
  sumPdlRecords,
  withLockedUser,
} from "@/server/repositories/usage.repo";
import { PLAN_LIMITS, PRO_BUDGET_CEILING } from "@/server/services/billing/plans";

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

function creditsLimitError(plan: PlanId, used: number, now: Date): ForbiddenError {
  return new ForbiddenError(
    "Credits used",
    {
      feature: "hire_search",
      plan,
      limit: PLAN_LIMITS[plan].monthlyCredits,
      used,
      resetsAt: nextMonthStart(now).toISOString(),
    },
    "PLAN_LIMIT_REACHED",
  );
}

// ─── before a paid provider call ─────────────────────────────────────────────

/**
 * Called only when the people are not already known (no stored results), right before the provider
 * is asked. Out of credits -> PLAN_LIMIT_REACHED; then the shared monthly provider budget (Free is
 * paused at 100%, Pro at 120%). Returns how many people may be requested.
 */
export async function assertCanSearchProvider(
  userId: string,
  now: Date = new Date(),
): Promise<{ plan: PlanId; size: number }> {
  const row = await findUserPlan(userId);
  if (!row) throw new NotFoundError("User not found");
  const plan = effectivePlan(row, now);
  const config = getHireSearchConfig();
  const since = monthStart(now);

  const used = await sumCredits(userId, since);
  const remaining = PLAN_LIMITS[plan].monthlyCredits - used;
  if (remaining <= 0) throw creditsLimitError(plan, used, now);

  const budget = config.monthlyCreditBudget;
  const spent = await sumPdlRecords(since);
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
  return { plan, size: Math.min(config.maxResults, remaining, ceiling - spent) };
}

// ─── showing people ──────────────────────────────────────────────────────────

export interface ShowResult {
  /** People unlocked on this job, in total. */
  unlockedCount: number;
  /** People unlocked by this call (each cost 1 credit). */
  newlyUnlocked: number;
  /** People found but still locked. */
  lockedCount: number;
  creditsRemaining: number;
  plan: PlanId;
}

/** How many found people are still locked: capped by what one user may unlock on one job. */
export function lockedCountFor(totalVisible: number, unlocked: number): number {
  const cap = Math.max(0, getHireSearchConfig().maxResults - unlocked);
  return Math.min(Math.max(0, totalVisible - unlocked), cap);
}

/**
 * Shows this job's found people to the user. People already unlocked are shown free. New people
 * cost 1 credit each (whether they came from stored results or a fresh provider call): in one
 * transaction with the user row locked, unlock the best matches up to the credits left and the
 * per-job maximum. The rest stay locked. `pdlRecords` is what the provider billed for this call
 * (0 when no provider call was made); it is recorded so the shared budget is accurate, even when
 * nobody could be shown.
 */
export async function showCandidates(
  userId: string,
  jobId: string,
  now: Date = new Date(),
  options: { pdlRecords?: number } = {},
): Promise<ShowResult> {
  const pdlRecords = options.pdlRecords ?? 0;
  const maxPerJob = getHireSearchConfig().maxResults;
  const result = await withLockedUser(userId, async (user) => {
    const plan = effectivePlan(user, now);
    const used = await user.creditsSince(monthStart(now));
    const remaining = Math.max(0, PLAN_LIMITS[plan].monthlyCredits - used);

    const ranked = await user.rankedCandidateIds(jobId);
    const alreadyUnlocked = new Set(await user.unlockedCandidateIds(jobId));
    const locked = ranked.filter((id) => !alreadyUnlocked.has(id));

    const allowance = Math.max(0, Math.min(remaining, maxPerJob - alreadyUnlocked.size));
    const toUnlock = locked.slice(0, allowance);
    if (toUnlock.length > 0) await user.unlock(jobId, toUnlock, now);
    // Nothing newly unlocked costs nothing, but provider records that were billed are still recorded.
    if (toUnlock.length > 0 || pdlRecords > 0) {
      await user.insert("HIRE_SEARCH", jobId, now, { credits: toUnlock.length, pdlRecords });
    }

    const unlockedCount = alreadyUnlocked.size + toUnlock.length;
    return {
      unlockedCount,
      newlyUnlocked: toUnlock.length,
      lockedCount: lockedCountFor(ranked.length, unlockedCount),
      creditsRemaining: remaining - toUnlock.length,
      plan,
    } satisfies ShowResult;
  });
  if (!result) throw new NotFoundError("User not found");
  return result;
}

/** The "Unlock" button: show more of this job's found people, or say the credits are used up. */
export async function unlockForUser(userId: string, jobId: string, now: Date = new Date()): Promise<ShowResult> {
  const result = await showCandidates(userId, jobId, now);
  if (result.newlyUnlocked === 0 && result.lockedCount > 0 && result.creditsRemaining === 0) {
    const limit = PLAN_LIMITS[result.plan].monthlyCredits;
    throw creditsLimitError(result.plan, limit, now);
  }
  return result;
}

// ─── Compare ─────────────────────────────────────────────────────────────────

/** An event inserted before a paid action. Refund it if the action fails. */
export interface UsageReservation {
  eventId: string;
}

/** Compare: Free gets one per UTC month; Pro is unlimited up to a hidden fair-use cap per month. */
export async function assertCanCompare(userId: string, now: Date = new Date()): Promise<UsageReservation> {
  const reservation = await withLockedUser(userId, async (user) => {
    const plan = effectivePlan(user, now);
    const rule = PLAN_LIMITS[plan].compare;
    const limit = rule.limit ?? rule.fairUse ?? null;
    if (limit !== null) {
      const used = await user.countCompares(monthStart(now));
      if (used >= limit) {
        throw new ForbiddenError(
          "Plan limit reached",
          { feature: "compare", plan, limit, used, resetsAt: nextMonthStart(now).toISOString() },
          "PLAN_LIMIT_REACHED",
        );
      }
    }
    return { eventId: await user.insert("COMPARE", null, now) };
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

// ─── reading ─────────────────────────────────────────────────────────────────

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
  const since = monthStart(now);
  const resetsAt = nextMonthStart(now).toISOString();
  const limit = PLAN_LIMITS[plan].monthlyCredits;
  const used = await sumCredits(userId, since);
  const compareLimit = PLAN_LIMITS[plan].compare.limit;
  return {
    plan,
    credits: { used, limit, remaining: Math.max(0, limit - used), resetsAt },
    compare: {
      used: await countUsage(userId, "COMPARE", since),
      limit: compareLimit,
      resetsAt: compareLimit === null ? null : resetsAt,
    },
  };
}
