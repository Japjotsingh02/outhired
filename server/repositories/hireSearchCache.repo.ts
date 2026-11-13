import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db";

export interface HireCacheEntry {
  cacheKey: string;
  domain: string;
  sinceMonth: string;
  keywords: string[];
  rows: unknown;
  rowCount: number;
  expiresAt: Date;
}

/** The cached rows for a key while they are still fresh, otherwise null. */
export async function findFreshHireCache(cacheKey: string, now: Date): Promise<unknown | null> {
  const entry = await prisma.hireSearchCache.findUnique({ where: { cacheKey } });
  return entry && entry.expiresAt.getTime() > now.getTime() ? entry.rows : null;
}

/** Writes or refreshes an entry and drops expired ones. */
export async function saveHireCache(entry: HireCacheEntry, now: Date): Promise<void> {
  const rows = entry.rows as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.hireSearchCache.upsert({
      where: { cacheKey: entry.cacheKey },
      create: { ...entry, rows, fetchedAt: now },
      update: { ...entry, rows, fetchedAt: now },
    }),
    prisma.hireSearchCache.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
}
