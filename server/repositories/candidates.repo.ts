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
  /** The run this ingestion belongs to; null when the rows came from the shared cache. */
  expectedRunId: string | null;
  costUsd: number | null;
  now: Date;
}

/**
 * Finishes a search atomically: moves the job RUNNING -> DONE and upserts the
 * candidates in one transaction. The conditional update is the claim: when two
 * callers race, the second one sees count 0 and writes nothing. Candidates are
 * keyed by (jobId, source, externalId), so repeated ingestion never duplicates
 * rows, and votes (their own table) are never touched.
 * Returns false when another caller already finished or failed this search.
 */
export function commitSearchResult(
  completion: SearchCompletion,
  rows: CandidateWrite[],
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.job.updateMany({
      where: { id: completion.jobId, searchStatus: "RUNNING", searchRunId: completion.expectedRunId },
      data: {
        searchStatus: "DONE",
        searchError: null,
        lastSearchedAt: completion.now,
        searchCostUsd: completion.costUsd,
      },
    });
    if (claimed.count !== 1) return false;

    for (const row of rows) {
      await tx.candidate.upsert({
        where: {
          jobId_source_externalId: {
            jobId: completion.jobId,
            source: "APIFY_NEW_HIRES",
            externalId: row.externalId,
          },
        },
        create: { jobId: completion.jobId, source: "APIFY_NEW_HIRES", ...row },
        update: row,
      });
    }
    return true;
  });
}
