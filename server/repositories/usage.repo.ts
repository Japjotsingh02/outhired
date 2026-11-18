import "server-only";
import type { Plan, UsageKind } from "@/generated/prisma";
import { prisma } from "@/server/db";

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

/** Events of one kind by the user since `since` (null = all time). */
export function countUsage(userId: string, kind: UsageKind, since: Date | null): Promise<number> {
  return prisma.usageEvent.count({ where: { userId, kind, ...(since && { createdAt: { gte: since } }) } });
}

/** What a transaction that holds the user's row lock may do. */
export interface LockedUser {
  plan: Plan;
  planEndsAt: Date | null;
  count(kind: UsageKind, since: Date | null): Promise<number>;
  /** Provider credits recorded by every user's events since `since` (the PDL account is shared). */
  creditsSince(since: Date): Promise<number>;
  insert(kind: UsageKind, jobId: string | null, now: Date): Promise<string>;
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
      count: (kind, since) =>
        tx.usageEvent.count({ where: { userId, kind, ...(since && { createdAt: { gte: since } }) } }),
      creditsSince: async (since) => {
        const sum = await tx.usageEvent.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { creditsUsed: true },
        });
        return sum._sum.creditsUsed ?? 0;
      },
      insert: async (kind, jobId, now) =>
        (await tx.usageEvent.create({ data: { userId, kind, jobId, createdAt: now }, select: { id: true } })).id,
    });
  });
}

export async function deleteUsageEvent(id: string): Promise<void> {
  await prisma.usageEvent.deleteMany({ where: { id } });
}

export async function setUsageCredits(id: string, creditsUsed: number): Promise<void> {
  await prisma.usageEvent.updateMany({ where: { id }, data: { creditsUsed } });
}
