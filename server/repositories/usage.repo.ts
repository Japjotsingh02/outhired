import "server-only";
import type { Plan, UsageKind } from "@/generated/prisma";
import { prisma } from "@/server/db";
import { CANDIDATE_RANK_ORDER } from "@/server/repositories/jobs.repo";

export interface PlanRow {
  plan: Plan;
  planEndsAt: Date | null;
}

export function findUserPlan(userId: string): Promise<PlanRow | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planEndsAt: true } });
}

export function setUserPlan(email: string, plan: Plan, now: Date) {
  return prisma.user.updateMany({
    where: { email: { equals: email, mode: "insensitive" } },
    data: { plan, planStartedAt: plan === "PRO" ? now : null, planEndsAt: null },
  });
}

/** Events of one kind by the user since `since`. */
export function countUsage(userId: string, kind: UsageKind, since: Date): Promise<number> {
  return prisma.usageEvent.count({ where: { userId, kind, createdAt: { gte: since } } });
}

/** Credits the user has spent on unlocking people since `since`. */
export async function sumCredits(userId: string, since: Date): Promise<number> {
  const sum = await prisma.usageEvent.aggregate({
    where: { userId, kind: "HIRE_SEARCH", createdAt: { gte: since } },
    _sum: { credits: true },
  });
  return sum._sum.credits ?? 0;
}

/** PDL records billed to us (all users together) since `since`. */
export async function sumPdlRecords(since: Date): Promise<number> {
  const sum = await prisma.usageEvent.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { pdlRecords: true },
  });
  return sum._sum.pdlRecords ?? 0;
}

/** True when the user has unlocked this person (and the person has not been taken down). */
export async function isCandidateUnlocked(userId: string, candidateId: string): Promise<boolean> {
  const count = await prisma.candidateUnlock.count({
    where: { userId, candidateId, candidate: { hidden: false } },
  });
  return count > 0;
}

/** Unlocked people on a job (not taken down). */
export function countUnlocked(userId: string, jobId: string): Promise<number> {
  return prisma.candidateUnlock.count({ where: { userId, jobId, candidate: { hidden: false } } });
}

/** What a transaction that holds the user's row lock may do. */
export interface LockedUser {
  plan: Plan;
  planEndsAt: Date | null;
  /** Compare events by the user since `since`. */
  countCompares(since: Date): Promise<number>;
  creditsSince(since: Date): Promise<number>;
  insert(
    kind: UsageKind,
    jobId: string | null,
    now: Date,
    amounts?: { credits?: number; pdlRecords?: number },
  ): Promise<string>;
  /** Ids of the job's visible people, best match first. */
  rankedCandidateIds(jobId: string): Promise<string[]>;
  unlockedCandidateIds(jobId: string): Promise<string[]>;
  unlock(jobId: string, candidateIds: string[], now: Date): Promise<void>;
}

/**
 * Runs `fn` in one transaction with the user's row locked (SELECT ... FOR UPDATE), so two requests
 * for the same user are serialised: the second counts what the first inserted.
 * Returns null when the user does not exist.
 */
export function withLockedUser<T>(userId: string, fn: (user: LockedUser) => Promise<T>): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.user.findUnique({ where: { id: userId }, select: { plan: true, planEndsAt: true } });
    if (!row) return null;
    return fn({
      ...row,
      countCompares: (since) =>
        tx.usageEvent.count({ where: { userId, kind: "COMPARE", createdAt: { gte: since } } }),
      creditsSince: async (since) => {
        const sum = await tx.usageEvent.aggregate({
          where: { userId, kind: "HIRE_SEARCH", createdAt: { gte: since } },
          _sum: { credits: true },
        });
        return sum._sum.credits ?? 0;
      },
      insert: async (kind, jobId, now, amounts = {}) =>
        (
          await tx.usageEvent.create({
            data: {
              userId,
              kind,
              jobId,
              credits: amounts.credits ?? 0,
              pdlRecords: amounts.pdlRecords ?? 0,
              createdAt: now,
            },
            select: { id: true },
          })
        ).id,
      rankedCandidateIds: async (jobId) =>
        (
          await tx.candidate.findMany({
            where: { jobId, hidden: false },
            orderBy: CANDIDATE_RANK_ORDER,
            select: { id: true },
          })
        ).map((candidate) => candidate.id),
      unlockedCandidateIds: async (jobId) =>
        (
          await tx.candidateUnlock.findMany({
            where: { userId, jobId, candidate: { hidden: false } },
            select: { candidateId: true },
          })
        ).map((unlock) => unlock.candidateId),
      unlock: async (jobId, candidateIds, now) => {
        await tx.candidateUnlock.createMany({
          data: candidateIds.map((candidateId) => ({ userId, jobId, candidateId, createdAt: now })),
          skipDuplicates: true,
        });
      },
    });
  });
}

export async function deleteUsageEvent(id: string): Promise<void> {
  await prisma.usageEvent.deleteMany({ where: { id } });
}
