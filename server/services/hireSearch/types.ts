import "server-only";
import type { HireSourceKind, MatchConfidence } from "@/generated/prisma";

/**
 * One new hire as reported by a provider, already validated and reduced to the fields we keep.
 * This is also exactly what the shared cache stores: nothing else about a person is kept.
 */
export interface HireRecord {
  externalId: string;
  fullName: string;
  title: string;
  companyName?: string;
  companyDomain?: string;
  /** "YYYY-MM". For year-only rows this is January of that year. */
  startedMonth: string;
  startPrecision: "month" | "year";
  previousCompany?: string;
  previousTitle?: string;
  /** "YYYY-MM" */
  previousEndedMonth?: string;
  /** Country name as the provider reports it (lowercase), when known. */
  country?: string;
  profileUrl?: string;
  seniorityBucket?: string;
  confidence: MatchConfidence;
  /** "YYYY-MM-DD" */
  sourceUpdatedAt?: string;
}

export interface SearchInput {
  /** Normalised company website, e.g. "stripe.com". */
  domain: string;
  /** First and last month people may have joined in ("YYYY-MM"). */
  sinceMonth: string;
  untilMonth: string;
  /** The job's role text; the source decides how to filter on it. */
  role: string;
  /** The job's free-text location, if any. */
  location: string | null;
  /** How many records to ask for (the source bills per record). */
  size: number;
}

export interface SearchOutcome {
  /** New hires, mapped and validated. */
  records: HireRecord[];
  /** All matches at the provider, including those not returned. */
  total: number;
  /** Matches that were internal role changes or promotions at the company: hidden, counted. */
  skippedInternal: number;
  /** Credits the provider charged (one per record returned). */
  creditsUsed: number;
}

/** A source of "who joined this company" data. Adding a provider means adding one file. */
export interface HireSource {
  kind: HireSourceKind;
  /** Stable text for the filters this input will use; part of the shared cache key. */
  fingerprint(input: SearchInput): string;
  search(input: SearchInput): Promise<SearchOutcome>;
}
