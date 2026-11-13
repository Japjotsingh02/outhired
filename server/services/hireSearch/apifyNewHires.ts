import "server-only";
import { z } from "zod";
import { getApifyClient, type ApifyClient } from "@/server/clients/apify";
import { getHireSearchConfig } from "@/server/env";
import { parseYearMonth } from "@/lib/postedMonth";
import type {
  CheckSearchResult,
  FailureReason,
  HireRecord,
  HireSource,
  RunRef,
  StartSearchInput,
} from "@/server/services/hireSearch/types";

// ─── Row parsing ─────────────────────────────────────────────────────────────

/** A trimmed, non-empty string capped at `max` chars, or undefined for anything else. */
const text = (max: number) =>
  z.unknown().transform((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  });

/** "YYYY-MM" or "YYYY" with a plausible year and a real month. */
function parseStart(value: string): { month: string; precision: "month" | "year" } | null {
  if (/^\d{4}$/.test(value)) {
    const year = Number(value);
    return year >= 1970 && year <= 2200 ? { month: `${value}-01`, precision: "year" } : null;
  }
  const parsed = parseYearMonth(value);
  if (!parsed || !/^\d{4}-\d{2}$/.test(value)) return null;
  return { month: value, precision: "month" };
}

const LINKEDIN_URL = /^https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\//i;

const foundRow = z.object({
  _status: z.literal("found"),
  personId: z.union([z.string().trim().min(1), z.number()]),
  fullName: z.string().trim().min(1).max(200),
  startedAt: z.string().trim().refine((value) => parseStart(value) !== null),
  jobTitle: text(200),
  companyName: text(200),
  companyDomain: text(200),
  previousCompany: text(200),
  previousTitle: text(200),
  previousEndedAt: text(10),
  headline: text(300),
  location: text(200),
  countryCode: text(2),
  linkedinUrl: text(300),
  seniority: text(30),
  updatedAt: text(40),
});

function toRecord(row: z.infer<typeof foundRow>): HireRecord {
  const start = parseStart(row.startedAt)!;
  const previousEnd = row.previousEndedAt ? parseStart(row.previousEndedAt) : null;
  const updated = row.updatedAt?.match(/^(\d{4}-\d{2}-\d{2})/);
  return {
    externalId: String(row.personId),
    fullName: row.fullName,
    title: row.jobTitle ?? "",
    companyName: row.companyName,
    companyDomain: row.companyDomain,
    startedMonth: start.month,
    startPrecision: start.precision,
    previousCompany: row.previousCompany,
    previousTitle: row.previousTitle,
    previousEndedMonth: previousEnd?.month,
    headline: row.headline,
    location: row.location,
    countryCode: row.countryCode && /^[A-Za-z]{2}$/.test(row.countryCode) ? row.countryCode.toUpperCase() : undefined,
    // Only real LinkedIn links are kept: the value ends up in an href.
    profileUrl: row.linkedinUrl && LINKEDIN_URL.test(row.linkedinUrl) ? row.linkedinUrl : undefined,
    seniorityBucket: row.seniority,
    sourceUpdatedAt: updated?.[1],
  };
}

export interface ParsedRows {
  records: HireRecord[];
  /** Rows that were not billed "found" rows (notes such as no_results). */
  notFound: number;
  /** "found" rows dropped for failing validation. */
  invalid: number;
  /** _status values seen on non-found rows, for limit detection. */
  noteStatuses: string[];
}

/** Validates dataset rows one by one: bad rows are dropped and counted, never thrown. */
export function parseDatasetRows(items: unknown[]): ParsedRows {
  const records: HireRecord[] = [];
  const noteStatuses: string[] = [];
  let notFound = 0;
  let invalid = 0;
  for (const item of items) {
    const status = (item as { _status?: unknown } | null)?._status;
    if (status !== "found") {
      notFound++;
      if (typeof status === "string") noteStatuses.push(status);
      continue;
    }
    const parsed = foundRow.safeParse(item);
    if (parsed.success) records.push(toRecord(parsed.data));
    else invalid++;
  }
  return { records, notFound, invalid, noteStatuses };
}

// ─── Source ──────────────────────────────────────────────────────────────────

const RUNNING = new Set(["READY", "RUNNING", "TIMING-OUT", "ABORTING"]);
const LIMIT_HINT = /limit|quota|plan|monthly|upgrade/i;

function failureReason(...hints: Array<string | null | undefined>): FailureReason {
  return hints.some((hint) => hint && LIMIT_HINT.test(hint)) ? "LIMIT_REACHED" : "PROVIDER_FAILED";
}

/** b2bsearch/new-hires-finder on Apify. Pass a client in tests. */
export function createApifyNewHiresSource(clientFactory: () => ApifyClient = getApifyClient): HireSource {
  return {
    kind: "APIFY_NEW_HIRES",

    async startSearch(input: StartSearchInput): Promise<RunRef> {
      const config = getHireSearchConfig();
      const actorInput = {
        companyDomains: [input.domain],
        since: input.sinceMonth,
        ...(input.keywords.length > 0 && { jobTitles: input.keywords.slice(0, 10) }),
        maxResults: input.maxResults,
        maxPerCompany: input.maxResults,
      };
      const run = await clientFactory().startRun(config.actorId, actorInput, {
        maxTotalChargeUsd: config.maxChargeUsd,
        timeoutSecs: config.runTimeoutMs / 1000,
      });
      console.info(`[hireSearch] Apify run started: ${run.runId} (${run.status})`);
      return { runId: run.runId, datasetId: run.datasetId };
    },

    async checkSearch(runRef: RunRef): Promise<CheckSearchResult> {
      const client = clientFactory();
      const run = await client.getRun(runRef.runId);
      if (RUNNING.has(run.status)) return { state: "running" };
      if (run.status !== "SUCCEEDED") {
        console.error(`[hireSearch] Apify run ${run.runId} ended as ${run.status}`);
        return { state: "failed", reason: failureReason(run.statusMessage) };
      }

      const { maxResults } = getHireSearchConfig();
      // Headroom for the free note rows that sit beside the billed ones.
      const items = await client.getDatasetItems(runRef.datasetId, { limit: maxResults + 50 });
      const parsed = parseDatasetRows(items);
      console.info(
        `[hireSearch] Run ${run.runId}: ${parsed.records.length} found, ${parsed.notFound} notes, ${parsed.invalid} invalid`,
      );
      if (parsed.records.length === 0 && failureReason(...parsed.noteStatuses) === "LIMIT_REACHED") {
        return { state: "failed", reason: "LIMIT_REACHED" };
      }
      return { state: "succeeded", records: parsed.records, costUsd: run.usageTotalUsd };
    },

    async abortSearch(runRef: RunRef): Promise<void> {
      await clientFactory().abortRun(runRef.runId);
    },
  };
}
