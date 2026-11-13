import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeCompanyDomain } from "@/lib/domain";
import { errorMessage } from "@/lib/errorMessage";
import { getHireSearchConfig } from "@/server/env";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from "@/server/errors";
import { checkRateLimit } from "@/server/security/rateLimit";
import { findFreshHireCache, saveHireCache } from "@/server/repositories/hireSearchCache.repo";
import {
  attachSearchRun,
  claimSearchStart,
  findOwnedSearchJob,
  markSearchFailed,
  setJobDomain,
  setSearchError,
  type SearchJob,
} from "@/server/repositories/jobs.repo";
import { createApifyNewHiresSource } from "@/server/services/hireSearch/apifyNewHires";
import { ingestRecords } from "@/server/services/hireSearch/ingest";
import { buildTitleKeywords } from "@/server/services/hireSearch/keywords";
import type { HireRecord, HireSource } from "@/server/services/hireSearch/types";
import { hireWindow } from "@/server/services/hireSearch/window";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The one place that picks the provider: a second source is a one-file change. */
const HIRE_SOURCE_FACTORY = createApifyNewHiresSource;
export function getHireSource(): HireSource {
  return HIRE_SOURCE_FACTORY();
}

export interface SearchSummary {
  searchStatus: SearchJob["searchStatus"];
  /** When the current run started; the client stops polling a few minutes after this. */
  searchStartedAt: Date | null;
  lastSearchedAt: Date | null;
  /** Earliest time a new search is allowed; null when one is allowed now. */
  nextSearchAllowedAt: Date | null;
  candidateCount: number;
  searchError: string | null;
}

export interface SearchUser {
  id: string;
  email: string;
}

export interface SearchDeps {
  source: HireSource;
  now: () => Date;
}

const defaultDeps = (): SearchDeps => ({ source: getHireSource(), now: () => new Date() });

// Rows read back from the shared cache are validated again before use.
const cachedRecords = z.array(
  z.object({
    externalId: z.string().min(1),
    fullName: z.string().min(1),
    title: z.string(),
    companyName: z.string().optional(),
    companyDomain: z.string().optional(),
    startedMonth: z.string().regex(/^\d{4}-\d{2}$/),
    startPrecision: z.enum(["month", "year"]),
    previousCompany: z.string().optional(),
    previousTitle: z.string().optional(),
    previousEndedMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    headline: z.string().optional(),
    location: z.string().optional(),
    countryCode: z.string().optional(),
    profileUrl: z.string().optional(),
    seniorityBucket: z.string().optional(),
    sourceUpdatedAt: z.string().optional(),
  }),
);

/** Same inputs always give the same key: domain | sinceMonth | sorted keywords. */
export function hireCacheKey(domain: string, sinceMonth: string, keywords: string[]): string {
  const material = `${domain}|${sinceMonth}|${[...keywords].sort().join(",")}`;
  return createHash("sha256").update(material).digest("hex");
}

function searchInputs(job: SearchJob, domain: string) {
  const { sinceMonth } = hireWindow(job.postedMonth);
  const keywords = buildTitleKeywords(job.role);
  return { domain, sinceMonth, keywords, cacheKey: hireCacheKey(domain, sinceMonth, keywords) };
}

/** A failed search can be retried at once; otherwise the refresh interval applies. */
export function nextSearchAllowedAt(
  lastSearchedAt: Date | null,
  searchStatus: SearchJob["searchStatus"],
): Date | null {
  if (!lastSearchedAt || searchStatus === "FAILED") return null;
  const next = new Date(lastSearchedAt.getTime() + getHireSearchConfig().refreshAfterHours * HOUR_MS);
  return next.getTime() > Date.now() ? next : null;
}

function summarize(job: SearchJob): SearchSummary {
  return {
    searchStatus: job.searchStatus,
    searchStartedAt: job.searchStartedAt,
    lastSearchedAt: job.lastSearchedAt,
    nextSearchAllowedAt: nextSearchAllowedAt(job.lastSearchedAt, job.searchStatus),
    candidateCount: job._count.candidates,
    searchError: job.searchError,
  };
}

async function loadSummary(userId: string, jobId: string): Promise<SearchSummary> {
  const job = await findOwnedSearchJob(userId, jobId);
  if (!job) throw new NotFoundError("Job not found");
  return summarize(job);
}

function assertAllowed(user: SearchUser): void {
  const { allowedEmails } = getHireSearchConfig();
  if (allowedEmails && !allowedEmails.includes(user.email.toLowerCase())) {
    throw new ForbiddenError("This feature is in private beta", undefined, "FEATURE_RESTRICTED");
  }
}

async function readCache(cacheKey: string, now: Date): Promise<HireRecord[] | null> {
  try {
    const rows = await findFreshHireCache(cacheKey, now);
    if (rows === null) return null;
    const parsed = cachedRecords.safeParse(rows);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    // Cache problems must not block a search.
    console.error("[hireSearch] Cache read failed:", errorMessage(err));
    return null;
  }
}

async function writeCache(
  inputs: ReturnType<typeof searchInputs>,
  records: HireRecord[],
  now: Date,
): Promise<void> {
  const config = getHireSearchConfig();
  if (config.cacheDisabled) return;
  const ttlHours = records.length > 0 ? config.cacheTtlHours : config.emptyCacheTtlHours;
  try {
    await saveHireCache(
      {
        cacheKey: inputs.cacheKey,
        domain: inputs.domain,
        sinceMonth: inputs.sinceMonth,
        keywords: inputs.keywords,
        rows: records,
        rowCount: records.length,
        expiresAt: new Date(now.getTime() + ttlHours * HOUR_MS),
      },
      now,
    );
  } catch (err) {
    console.error("[hireSearch] Cache write failed:", errorMessage(err));
  }
}

/**
 * Starts (or short-circuits) a hire search for a job the user owns. Never waits for
 * the provider: it records the run and returns; refreshHireSearch collects results.
 */
export async function startHireSearchForJob(
  user: SearchUser,
  jobId: string,
  options: { domain?: string } = {},
  deps: SearchDeps = defaultDeps(),
): Promise<SearchSummary> {
  const config = getHireSearchConfig();
  const now = deps.now();
  const job = await findOwnedSearchJob(user.id, jobId);
  if (!job) throw new NotFoundError("Job not found");

  // Domain: an explicit one wins and is saved; otherwise use what the job already has.
  let domain = job.domain;
  if (options.domain !== undefined && options.domain.trim() !== "") {
    domain = normalizeCompanyDomain(options.domain);
    if (!domain) {
      throw new BadRequestError("Enter a valid company website, for example stripe.com", undefined, "INVALID_DOMAIN");
    }
    if (domain !== job.domain) await setJobDomain(job.id, domain);
  }
  if (!domain) {
    await setSearchError(job.id, "NO_DOMAIN");
    throw new BadRequestError("A company website is needed to find hires", undefined, "NO_DOMAIN");
  }

  assertAllowed(user);

  const runningSince = job.searchStartedAt?.getTime();
  if (
    job.searchStatus === "RUNNING" &&
    runningSince !== undefined &&
    now.getTime() - runningSince < config.runTimeoutMs
  ) {
    return summarize(job);
  }

  const refreshAfterMs = config.refreshAfterHours * HOUR_MS;
  if (
    job.lastSearchedAt &&
    job.searchStatus !== "FAILED" &&
    now.getTime() - job.lastSearchedAt.getTime() < refreshAfterMs
  ) {
    throw new ConflictError("This job was searched recently", undefined, "SEARCH_TOO_SOON");
  }

  // Claim before any paid call so two requests cannot both start a run.
  const staleBefore = new Date(now.getTime() - config.runTimeoutMs);
  if ((await claimSearchStart(job.id, now, staleBefore)) !== 1) return loadSummary(user.id, jobId);

  const inputs = searchInputs(job, domain);
  try {
    if (!config.cacheDisabled) {
      const cached = await readCache(inputs.cacheKey, now);
      if (cached) {
        await ingestRecords(job, cached, { jobId: job.id, expectedRunId: null, costUsd: null, now });
        return loadSummary(user.id, jobId);
      }
    }

    // The daily limit counts provider runs only; a cache hit costs nothing.
    const limit = await checkRateLimit(`user:${user.id}`, {
      scope: "hire-search",
      limit: config.dailyLimitPerUser,
      windowMs: DAY_MS,
    });
    if (limit.limited) {
      throw new RateLimitedError("Daily search limit reached", undefined, "LIMIT_REACHED", limit.retryAfterSeconds);
    }

    const runRef = await deps.source.startSearch({
      domain: inputs.domain,
      sinceMonth: inputs.sinceMonth,
      keywords: inputs.keywords,
      maxResults: config.maxResults,
    });
    await attachSearchRun(job.id, runRef.runId, runRef.datasetId);
  } catch (err) {
    // Release the claim so the user can retry; the error still reaches the caller.
    const code = err instanceof RateLimitedError ? "LIMIT_REACHED" : "PROVIDER_FAILED";
    await markSearchFailed(job.id, null, code).catch(() => undefined);
    console.error("[hireSearch] Could not start search:", errorMessage(err));
    throw err;
  }
  return loadSummary(user.id, jobId);
}

/**
 * Checks a RUNNING search and finishes it. Safe to call repeatedly and concurrently:
 * results are ingested exactly once, and any non-RUNNING job just returns its state.
 */
export async function refreshHireSearch(
  userId: string,
  jobId: string,
  deps: SearchDeps = defaultDeps(),
): Promise<SearchSummary> {
  const config = getHireSearchConfig();
  const now = deps.now();
  const job = await findOwnedSearchJob(userId, jobId);
  if (!job) throw new NotFoundError("Job not found");
  if (job.searchStatus !== "RUNNING") return summarize(job);

  const startedAt = job.searchStartedAt?.getTime() ?? 0;
  const timedOut = now.getTime() - startedAt > config.runTimeoutMs;

  // The run has not been recorded yet (start in progress) or never will be.
  if (!job.searchRunId || !job.searchDatasetId) {
    if (timedOut) await markSearchFailed(job.id, job.searchRunId, "TIMEOUT");
    return loadSummary(userId, jobId);
  }
  const runRef = { runId: job.searchRunId, datasetId: job.searchDatasetId };

  let result;
  try {
    result = await deps.source.checkSearch(runRef);
  } catch (err) {
    // A failed status check is transient; the next poll tries again (until the timeout).
    console.error("[hireSearch] Status check failed:", errorMessage(err));
    if (timedOut) await markSearchFailed(job.id, runRef.runId, "TIMEOUT");
    return loadSummary(userId, jobId);
  }

  if (result.state === "running") {
    if (timedOut) {
      await deps.source.abortSearch(runRef).catch((err) => {
        console.error("[hireSearch] Abort failed:", errorMessage(err));
      });
      await markSearchFailed(job.id, runRef.runId, "TIMEOUT");
    }
  } else if (result.state === "failed") {
    await markSearchFailed(job.id, runRef.runId, result.reason);
  } else if (!job.domain) {
    await markSearchFailed(job.id, runRef.runId, "NO_DOMAIN");
  } else {
    const written = await ingestRecords(job, result.records, {
      jobId: job.id,
      expectedRunId: runRef.runId,
      costUsd: result.costUsd,
      now,
    });
    // Only the caller that finished the search writes the shared cache.
    if (written !== null) await writeCache(searchInputs(job, job.domain), result.records, now);
  }
  return loadSummary(userId, jobId);
}
