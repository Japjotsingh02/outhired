import "server-only";
import type { MatchConfidence } from "@/generated/prisma";
import { prisma } from "@/server/db";

/** A candidate row ready to write, derived from a provider record. */
export interface CandidateWrite {
  externalId: string;
  name: string;
  initials: string;
  title: string;
  headline: string | null;
  linkedinUrl: string | null;
  location: string | null;
  currentCompany: string | null;
  previousRole: string | null;
  previousCompany: string | null;
  previousEndedMonth: Date | null;
  startedMonth: Date;
  startedYearOnly: boolean;
  seniorityBucket: string | null;
  countryCode: string | null;
  roleMatchScore: number | null;
  confidence: MatchConfidence;
  sourceUpdatedAt: Date | null;
}

export interface SearchCompletion {
  jobId: string;
  /** The claim this search holds: the time it moved the job to RUNNING. */
  startedAt: Date;
  now: Date;
  /** Credits PDL charged; null when the rows came from the shared cache. */
  creditsUsed: number | null;
  totalMatches: number;
  skippedInternal: number;
}

/**
 * Finishes a search atomically: moves the job RUNNING -> DONE and upserts the
 * candidates in one transaction. The conditional update is the claim: it only
 * succeeds for the search that holds it, so a search that was timed out and
 * replaced writes nothing. Candidates are keyed by (jobId, source, externalId),
 * so repeated ingestion never duplicates rows, and votes (their own table) are
 * never touched. Returns false when this search no longer holds the claim.
 */
export function commitSearchResult(
  completion: SearchCompletion,
  rows: CandidateWrite[],
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.job.updateMany({
      where: { id: completion.jobId, searchStatus: "RUNNING", searchStartedAt: completion.startedAt },
      data: {
        searchStatus: "DONE",
        searchError: null,
        lastSearchedAt: completion.now,
        searchCreditsUsed: completion.creditsUsed,
        searchTotalMatches: completion.totalMatches,
        searchSkippedInternal: completion.skippedInternal,
      },
    });
    if (claimed.count !== 1) return false;

    for (const row of rows) {
      await tx.candidate.upsert({
        where: {
          jobId_source_externalId: {
            jobId: completion.jobId,
            source: "PDL",
            externalId: row.externalId,
          },
        },
        create: { jobId: completion.jobId, source: "PDL", ...row },
        update: row,
      });
    }
    return true;
  });
}
