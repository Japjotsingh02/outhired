import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db";

/** Prisma include shape used whenever we return a job with its candidates. */
export const JOB_WITH_CANDIDATES_INCLUDE = {
  candidates: {
    where: { hidden: false },
    include: { votes: true },
    // Votes are ranked client-side; this order breaks ties: confidence (HIGH first),
    // best title match, then the start closest to the posted month.
    orderBy: [
      { confidence: "asc" },
      { roleMatchScore: { sort: "desc", nulls: "last" } },
      { startedMonth: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  },
} as const satisfies Prisma.JobInclude;

const SEARCH_JOB_SELECT = {
  id: true,
  role: true,
  company: true,
  location: true,
  postedMonth: true,
  domain: true,
  searchStatus: true,
  searchStartedAt: true,
  lastSearchedAt: true,
  searchError: true,
  searchTotalMatches: true,
  searchSkippedInternal: true,
  _count: { select: { candidates: { where: { hidden: false } } } },
} as const satisfies Prisma.JobSelect;

export type SearchJob = Prisma.JobGetPayload<{ select: typeof SEARCH_JOB_SELECT }>;

/** The job when it belongs to the user, otherwise null. */
export function findOwnedSearchJob(userId: string, jobId: string) {
  return prisma.job.findFirst({ where: { id: jobId, userId }, select: SEARCH_JOB_SELECT });
}

export function setJobDomain(jobId: string, domain: string) {
  return prisma.job.update({ where: { id: jobId }, data: { domain }, select: { id: true } });
}

export function setSearchError(jobId: string, code: string) {
  return prisma.job.update({ where: { id: jobId }, data: { searchError: code }, select: { id: true } });
}

/**
 * Moves the job to RUNNING unless a search is already running that started after
 * `staleBefore`. Returns 1 when this caller won, 0 when it lost the race. The time
 * written to searchStartedAt is this search's claim: only it may finish or fail the job.
 */
export async function claimSearchStart(jobId: string, now: Date, staleBefore: Date): Promise<number> {
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      OR: [{ searchStatus: { not: "RUNNING" } }, { searchStartedAt: { lt: staleBefore } }],
    },
    data: { searchStatus: "RUNNING", searchStartedAt: now, searchError: null },
  });
  return result.count;
}

/** RUNNING -> FAILED with a short code. A no-op (count 0) if this claim no longer holds. */
export async function markSearchFailed(
  jobId: string,
  startedAt: Date | null,
  code: string,
): Promise<number> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, searchStatus: "RUNNING", searchStartedAt: startedAt },
    data: { searchStatus: "FAILED", searchError: code },
  });
  return result.count;
}

/** Searches by this user that called the provider (cache hits have no credits recorded) since `since`. */
export function countProviderSearchesSince(userId: string, since: Date): Promise<number> {
  return prisma.job.count({
    where: { userId, searchCreditsUsed: { not: null }, lastSearchedAt: { gte: since } },
  });
}
