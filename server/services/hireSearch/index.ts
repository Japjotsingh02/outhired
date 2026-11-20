import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeCompanyDomain } from "@/lib/domain";
import { errorMessage } from "@/lib/errorMessage";
import { getHireSearchConfig } from "@/server/env";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
} from "@/server/errors";
import { countUnlocked } from "@/server/repositories/usage.repo";
import { findFreshHireCache, saveHireCache } from "@/server/repositories/hireSearchCache.repo";
import {
  claimSearchStart,
  countProviderSearchesSince,
  findOwnedSearchJob,
  markSearchFailed,
  setJobDomain,
  setSearchError,
  type SearchJob,
} from "@/server/repositories/jobs.repo";
import { assertCanSearchProvider, lockedCountFor, showCandidates } from "@/server/services/billing/credits";
import { ingestRecords } from "@/server/services/hireSearch/ingest";
import { createPdlNewHiresSource } from "@/server/services/hireSearch/pdlNewHires";
import type { HireSource, SearchInput, SearchOutcome } from "@/server/services/hireSearch/types";
import { hireWindow } from "@/server/services/hireSearch/window";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A search normally takes seconds; a job still RUNNING after this is a request that died. */
export const STALE_RUNNING_MS = 2 * 60 * 1000;

/** The one place that picks the provider: a second source is a one-file change. */
const HIRE_SOURCE_FACTORY = createPdlNewHiresSource;
export function getHireSource(): HireSource {
  return HIRE_SOURCE_FACTORY();
}

export interface SearchSummary {
  searchStatus: SearchJob["searchStatus"];
  lastSearchedAt: Date | null;
  /** Earliest time a new search is allowed; null when one is allowed now. */
  nextSearchAllowedAt: Date | null;
  /** People this user has unlocked on the job. */
  candidateCount: number;
  /** People found but still locked (only the number is ever sent). */
  lockedCount: number;
  searchError: string | null;
  /** All matches the provider reported, including people we did not fetch or hid. */
  searchTotalMatches: number | null;
  /** Matches hidden because they were internal role changes at the company. */
  searchSkippedInternal: number | null;
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

const monthString = z.string().regex(/^\d{4}-\d{2}$/);

// What the shared cache stores, and all it stores. Read back, it is validated again before use.
const cachedSearch = z.object({
  total: z.number().int().nonnegative(),
  skippedInternal: z.number().int().nonnegative(),
  records: z.array(
    z.object({
      externalId: z.string().min(1),
      fullName: z.string().min(1),
      title: z.string(),
      companyName: z.string().optional(),
      companyDomain: z.string().optional(),
      startedMonth: monthString,
      startPrecision: z.enum(["month", "year"]),
      previousCompany: z.string().optional(),
      previousTitle: z.string().optional(),
      previousEndedMonth: monthString.optional(),
      country: z.string().optional(),
      profileUrl: z.string().optional(),
      seniorityBucket: z.string().optional(),
      confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
      sourceUpdatedAt: z.string().optional(),
    }),
  ),
});
type CachedSearch = z.infer<typeof cachedSearch>;

/** Same inputs always give the same key: source | domain | window | role filter and country. */
export function hireCacheKey(input: {
  source: string;
  domain: string;
  sinceMonth: string;
  untilMonth: string;
  fingerprint: string;
}): string {
  const material = [input.source, input.domain, input.sinceMonth, input.untilMonth, input.fingerprint].join("|");
  return createHash("sha256").update(material).digest("hex");
}

/** 00:00 UTC on the 1st of the month containing `now`. */
export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

async function summarize(userId: string, job: SearchJob): Promise<SearchSummary> {
  const unlocked = await countUnlocked(userId, job.id);
  return {
    searchStatus: job.searchStatus,
    lastSearchedAt: job.lastSearchedAt,
    nextSearchAllowedAt: nextSearchAllowedAt(job.lastSearchedAt, job.searchStatus),
    candidateCount: unlocked,
    lockedCount: lockedCountFor(job._count.candidates, unlocked),
    searchError: job.searchError,
    searchTotalMatches: job.searchTotalMatches,
    searchSkippedInternal: job.searchSkippedInternal,
  };
}

async function loadSummary(userId: string, jobId: string): Promise<SearchSummary> {
  const job = await findOwnedSearchJob(userId, jobId);
  if (!job) throw new NotFoundError("Job not found");
  return summarize(userId, job);
}

function assertAllowed(user: SearchUser): void {
  const { allowedEmails } = getHireSearchConfig();
  if (allowedEmails && !allowedEmails.includes(user.email.toLowerCase())) {
    throw new ForbiddenError("This feature is in private beta", undefined, "FEATURE_RESTRICTED");
  }
}

async function readCache(cacheKey: string, now: Date): Promise<CachedSearch | null> {
  try {
    const rows = await findFreshHireCache(cacheKey, now);
    if (rows === null) return null;
    const parsed = cachedSearch.safeParse(rows);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    // Cache problems must not block a search.
    console.error("[hireSearch] Cache read failed:", errorMessage(err));
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  input: SearchInput,
  fingerprint: string,
  entry: CachedSearch,
  now: Date,
): Promise<void> {
  const config = getHireSearchConfig();
  if (config.cacheDisabled) return;
  const ttlHours = entry.records.length > 0 ? config.cacheTtlHours : config.emptyCacheTtlHours;
  try {
    await saveHireCache(
      {
        cacheKey,
        domain: input.domain,
        sinceMonth: input.sinceMonth,
        keywords: [fingerprint],
        rows: entry,
        rowCount: entry.records.length,
        expiresAt: new Date(now.getTime() + ttlHours * HOUR_MS),
      },
      now,
    );
  } catch (err) {
    console.error("[hireSearch] Cache write failed:", errorMessage(err));
  }
}

const BILLING_CODES = new Set(["PLAN_LIMIT_REACHED", "FREE_SEARCHES_PAUSED", "SEARCH_CAPACITY_REACHED"]);

/** The short code stored on a failed job and shown to the user through getErrorMessage. */
function failureCode(err: unknown): string {
  if (err instanceof RateLimitedError) return err.code;
  if (err instanceof AppError && BILLING_CODES.has(err.code)) return err.code;
  if (err instanceof ServiceUnavailableError) return "SERVICE_UNAVAILABLE";
  return "PROVIDER_FAILED";
}

/**
 * Runs a hire search for a job the user owns and returns the final state. The whole search
 * happens inside this call (one provider request), so there is nothing to poll. Guards run in
 * order: ownership, domain, allowlist, a search already running, "searched recently", then the
 * claim (so two requests cannot both search), the shared cache (a hit is free for everyone), the
 * per-user daily limit, the plan limit and the monthly credit budget, and only then the provider.
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

  // Another request is searching this job right now: report its state, start nothing.
  const runningSince = job.searchStartedAt?.getTime();
  if (
    job.searchStatus === "RUNNING" &&
    runningSince !== undefined &&
    now.getTime() - runningSince < STALE_RUNNING_MS
  ) {
    return summarize(user.id, job);
  }

  const refreshAfterMs = config.refreshAfterHours * HOUR_MS;
  if (
    job.lastSearchedAt &&
    job.searchStatus !== "FAILED" &&
    now.getTime() - job.lastSearchedAt.getTime() < refreshAfterMs
  ) {
    throw new ConflictError("This job was searched recently", undefined, "SEARCH_TOO_SOON");
  }

  // Claim before any paid call so two requests cannot both search. A search left RUNNING for
  // longer than STALE_RUNNING_MS (its request died) is taken over here.
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_MS);
  if ((await claimSearchStart(job.id, now, staleBefore)) !== 1) return loadSummary(user.id, jobId);

  const window = hireWindow(job.postedMonth);
  const input: SearchInput = {
    domain,
    sinceMonth: window.sinceMonth,
    untilMonth: window.untilMonth,
    role: job.role,
    location: job.location,
    size: config.maxResults,
  };
  const fingerprint = deps.source.fingerprint(input);
  const cacheKey = hireCacheKey({ source: deps.source.kind, domain, ...window, fingerprint });
  const completion = { jobId: job.id, startedAt: now, now };

  try {
    if (!config.cacheDisabled) {
      const cached = await readCache(cacheKey, now);
      if (cached) {
        // Stored results need no provider call, so the provider budget does not apply. The people
        // still cost credits: showCandidates charges 1 per person this user has not unlocked yet.
        await ingestRecords(job, cached.records, {
          ...completion,
          creditsUsed: null,
          totalMatches: cached.total,
          skippedInternal: cached.skippedInternal,
        });
        await showCandidates(user.id, job.id, now);
        return loadSummary(user.id, jobId);
      }
    }

    // The daily limit is counted from the database, so it holds across restarts and servers.
    const searchesToday = await countProviderSearchesSince(user.id, new Date(now.getTime() - DAY_MS));
    if (searchesToday >= config.dailyLimitPerUser) {
      throw new RateLimitedError("Daily search limit reached", undefined, "DAILY_LIMIT_REACHED");
    }
    // Credits left (PLAN_LIMIT_REACHED), then the shared provider budget. Nothing is charged yet:
    // a provider error below costs the user nothing.
    const allowance = await assertCanSearchProvider(user.id, now);
    const size = Math.min(config.maxResults, allowance.size);

    // The source drops internal role changes and promotions before returning records.
    const outcome: SearchOutcome = await deps.source.search({ ...input, size });
    // The schema strips anything that is not a kept field, so the shared store can never hold more.
    const entry = cachedSearch.parse({
      total: outcome.total,
      skippedInternal: outcome.skippedInternal,
      records: outcome.records,
    });
    const written = await ingestRecords(job, outcome.records, {
      ...completion,
      creditsUsed: outcome.creditsUsed,
      totalMatches: outcome.total,
      skippedInternal: outcome.skippedInternal,
    });
    // Only a finished, complete search is stored for others: a short page that was cut by this
    // user's credits (the provider had more) is not complete. Failures are never stored.
    const complete = size >= config.maxResults || outcome.creditsUsed < size;
    if (written !== null && complete) await writeCache(cacheKey, input, fingerprint, entry, now);
    // The people found cost 1 credit each; a search that found nobody costs none.
    await showCandidates(user.id, job.id, now, { pdlRecords: outcome.creditsUsed });
  } catch (err) {
    // Release the claim so the user can retry; the error still reaches the caller.
    await markSearchFailed(job.id, now, failureCode(err)).catch(() => undefined);
    console.error("[hireSearch] Search failed:", err instanceof AppError ? err.code : errorMessage(err));
    throw err;
  }
  return loadSummary(user.id, jobId);
}

/**
 * The current search state for a job the user owns. A search left RUNNING past
 * STALE_RUNNING_MS (its request died) is marked FAILED/TIMEOUT so it can be retried.
 */
export async function refreshHireSearch(
  userId: string,
  jobId: string,
  deps: Pick<SearchDeps, "now"> = { now: () => new Date() },
): Promise<SearchSummary> {
  const job = await findOwnedSearchJob(userId, jobId);
  if (!job) throw new NotFoundError("Job not found");
  if (job.searchStatus !== "RUNNING") return summarize(userId, job);

  const startedAt = job.searchStartedAt?.getTime() ?? 0;
  if (deps.now().getTime() - startedAt <= STALE_RUNNING_MS) return summarize(userId, job);

  await markSearchFailed(job.id, job.searchStartedAt, "TIMEOUT");
  return loadSummary(userId, jobId);
}
