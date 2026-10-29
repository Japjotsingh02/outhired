import "server-only";
import type { MatchConfidence } from "@/generated/prisma";
import { initials } from "@/lib/helpers";
import {
  commitSearchResult,
  type CandidateWrite,
  type SearchCompletion,
} from "@/server/repositories/candidates.repo";
import { normalizeRole } from "@/server/services/jobParsing/compare/role";
import { hireWindow, monthIndex, monthToDate } from "@/server/services/hireSearch/window";
import type { HireRecord } from "@/server/services/hireSearch/types";

export interface IngestJob {
  id: string;
  role: string;
  postedMonth: Date;
}

const HIGH_GAP_MONTHS = 3;
const LOW_GAP_MONTHS = 12;

/** Share (0-1) of the job's core-role words that appear in the candidate's title; null if the role has none. */
export function roleMatchScore(jobRole: string, candidateTitle: string): number | null {
  const wanted = normalizeRole(jobRole).words;
  if (wanted.size === 0) return null;
  const have = normalizeRole(candidateTitle).words;
  let hits = 0;
  for (const word of wanted) if (have.has(word)) hits++;
  return hits / wanted.size;
}

/**
 * HIGH: left a previous company within 3 months before starting.
 * LOW: year-only start, or the previous job ended over 12 months earlier (could be
 * an internal move or promotion: a heuristic, so the row is kept).
 * MEDIUM: everything else, including no previous company.
 */
export function candidateConfidence(record: HireRecord): MatchConfidence {
  if (record.startPrecision === "year") return "LOW";
  if (!record.previousCompany) return "MEDIUM";
  const started = monthIndex(record.startedMonth);
  const ended = record.previousEndedMonth ? monthIndex(record.previousEndedMonth) : null;
  if (started === null || ended === null) return "MEDIUM";
  const gap = started - ended;
  if (gap > LOW_GAP_MONTHS) return "LOW";
  if (gap >= 0 && gap <= HIGH_GAP_MONTHS) return "HIGH";
  return "MEDIUM";
}

/** True when the record's start falls inside [sinceMonth, untilMonth] (year-only: by year). */
export function startsWithinWindow(
  record: HireRecord,
  window: { sinceMonth: string; untilMonth: string },
): boolean {
  if (record.startPrecision === "year") {
    const year = Number(record.startedMonth.slice(0, 4));
    return year >= Number(window.sinceMonth.slice(0, 4)) && year <= Number(window.untilMonth.slice(0, 4));
  }
  const started = monthIndex(record.startedMonth);
  const since = monthIndex(window.sinceMonth);
  const until = monthIndex(window.untilMonth);
  if (started === null || since === null || until === null) return false;
  return started >= since && started <= until;
}

function dateOnly(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

/** Pure mapping from provider records to candidate rows: filters the window, scores, grades. */
export function buildCandidateRows(job: IngestJob, records: HireRecord[]): CandidateWrite[] {
  const window = hireWindow(job.postedMonth);
  const byExternalId = new Map<string, CandidateWrite>();

  for (const record of records) {
    if (!startsWithinWindow(record, window)) continue;
    const startedMonth = monthToDate(record.startedMonth);
    if (!startedMonth) continue;
    byExternalId.set(record.externalId, {
      externalId: record.externalId,
      name: record.fullName,
      initials: initials(record.fullName),
      title: record.title,
      headline: record.headline ?? null,
      linkedinUrl: record.profileUrl ?? null,
      location: record.location ?? null,
      currentCompany: record.companyName ?? null,
      previousRole: record.previousTitle ?? null,
      previousCompany: record.previousCompany ?? null,
      previousEndedMonth: record.previousEndedMonth ? monthToDate(record.previousEndedMonth) : null,
      startedMonth,
      startedYearOnly: record.startPrecision === "year",
      seniorityBucket: record.seniorityBucket ?? null,
      countryCode: record.countryCode ?? null,
      roleMatchScore: roleMatchScore(job.role, record.title),
      confidence: candidateConfidence(record),
      sourceUpdatedAt: dateOnly(record.sourceUpdatedAt),
    });
  }
  return [...byExternalId.values()];
}

/**
 * Writes the records for a job and marks the search DONE in one transaction.
 * Returns the number of candidates written, or null when another caller had
 * already finished this search.
 */
export async function ingestRecords(
  job: IngestJob,
  records: HireRecord[],
  completion: SearchCompletion,
  commit: typeof commitSearchResult = commitSearchResult,
): Promise<number | null> {
  const rows = buildCandidateRows(job, records);
  return (await commit(completion, rows)) ? rows.length : null;
}
