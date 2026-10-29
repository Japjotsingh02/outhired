import "server-only";
import type { HireSourceKind } from "@/generated/prisma";

/** One new hire as reported by a provider, already validated and normalised. */
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
  headline?: string;
  location?: string;
  countryCode?: string;
  profileUrl?: string;
  seniorityBucket?: string;
  /** "YYYY-MM-DD" */
  sourceUpdatedAt?: string;
}

export interface StartSearchInput {
  domain: string;
  sinceMonth: string;
  keywords: string[];
  maxResults: number;
}

/** Opaque handle the service stores on the job and hands back when polling. */
export interface RunRef {
  runId: string;
  datasetId: string;
}

export type FailureReason = "PROVIDER_FAILED" | "LIMIT_REACHED";

export type CheckSearchResult =
  | { state: "running" }
  | { state: "succeeded"; records: HireRecord[]; costUsd: number | null }
  | { state: "failed"; reason: FailureReason };

/** A source of "who joined this company" data. Adding a provider means adding one file. */
export interface HireSource {
  kind: HireSourceKind;
  startSearch(input: StartSearchInput): Promise<RunRef>;
  checkSearch(runRef: RunRef): Promise<CheckSearchResult>;
  abortSearch(runRef: RunRef): Promise<void>;
}
