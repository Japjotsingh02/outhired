import "./helpers/testEnv";
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "./helpers/fakeDb";
import type { HireRecord, HireSource, SearchInput, SearchOutcome } from "@/server/services/hireSearch/types";

type Service = typeof import("@/server/services/hireSearch");

let service: Service;
let db: ReturnType<typeof createFakeDb>;
let restore: () => void;

const ENV_KEYS = [
  "HIRE_SEARCH_ALLOWED_EMAILS",
  "HIRE_SEARCH_DAILY_LIMIT_PER_USER",
  "HIRE_SEARCH_REFRESH_AFTER_HOURS",
  "PDL_MAX_RESULTS",
  "PDL_MONTHLY_CREDIT_BUDGET",
  "HIRE_CACHE_DISABLED",
  "NODE_ENV",
] as const;
const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  service = await import("@/server/services/hireSearch");
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

beforeEach(async () => {
  db = createFakeDb();
  restore = await db.install();
  db.addUser("u1", "PRO"); // plan limits have their own tests (credits.test.ts)
  for (const key of ENV_KEYS) delete process.env[key];
  (process.env as Record<string, string>).NODE_ENV = "test";
  console.error = () => undefined;
  console.info = () => undefined;
});

afterEach(() => {
  restore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string>)[key] = savedEnv[key]!;
  }
});

const NOW = new Date(Date.UTC(2026, 5, 1, 12, 0, 0)); // 2026-06-01 12:00 UTC
const HOUR = 3_600_000;

const record = (externalId: string, overrides: Partial<HireRecord> = {}): HireRecord => ({
  externalId,
  fullName: `Person ${externalId}`,
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
  confidence: "MEDIUM",
  ...overrides,
});

class FakeSource implements HireSource {
  kind = "PDL" as const;
  calls: SearchInput[] = [];
  outcome: SearchOutcome = { records: [], total: 0, skippedInternal: 0, creditsUsed: 0 };
  failWith: Error | null = null;

  fingerprint(input: SearchInput): string {
    return `fp:${input.role}`;
  }
  async search(input: SearchInput): Promise<SearchOutcome> {
    this.calls.push(input);
    // Yield, so a second request can arrive while this one is "at the provider".
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    return this.outcome;
  }
}

const outcome = (records: HireRecord[], extra: Partial<SearchOutcome> = {}): SearchOutcome => ({
  records,
  total: records.length,
  skippedInternal: 0,
  creditsUsed: records.length,
  ...extra,
});

const deps = (source: FakeSource, now: Date = NOW) => ({ source, now: () => now });
const user = (id: string, email = `${id}@example.test`) => ({ id, email });
const later = (ms: number) => new Date(NOW.getTime() + ms);
const start = (source: FakeSource, jobId = "j1", userId = "u1", now: Date = NOW) =>
  service.startHireSearchForJob(user(userId), jobId, {}, deps(source, now));

// ─── a search ────────────────────────────────────────────────────────────────

test("start: claims the job, runs one search and returns the final state", async () => {
  db.addJob({ id: "j1", userId: "u1", location: "Bengaluru, India" });
  const source = new FakeSource();
  source.outcome = outcome([record("a"), record("b"), record("c", { startedMonth: "2025-06" })], {
    total: 31,
    skippedInternal: 4,
    creditsUsed: 3,
  });
  const summary = await start(source);

  assert.equal(source.calls.length, 1);
  assert.deepEqual(source.calls[0], {
    domain: "stripe.com",
    sinceMonth: "2026-02",
    untilMonth: "2026-05",
    role: "Senior Product Manager",
    location: "Bengaluru, India",
    size: 5,
  });
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.candidateCount, 2, "the record before the window is not stored");
  assert.equal(summary.searchTotalMatches, 31);
  assert.equal(summary.searchSkippedInternal, 4);
  assert.ok(summary.lastSearchedAt);
  const job = db.jobs.get("j1")!;
  assert.equal(job.searchCreditsUsed, 3);
  assert.equal(db.counters.cacheWrites, 1);
});

test("start: two simultaneous requests run only one search", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  await Promise.all([start(source), start(source)]);
  assert.equal(source.calls.length, 1);
  assert.equal(db.candidates.size, 1);
});

test("start: a search that is RUNNING right now is reported, not started again", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "RUNNING", searchStartedAt: later(-30_000) });
  const source = new FakeSource();
  const summary = await start(source);
  assert.equal(summary.searchStatus, "RUNNING");
  assert.equal(source.calls.length, 0);
});

test("start: a job left RUNNING for over 2 minutes is taken over and searched", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "RUNNING", searchStartedAt: later(-3 * 60_000) });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  const summary = await start(source);
  assert.equal(source.calls.length, 1);
  assert.equal(summary.searchStatus, "DONE");
});

test("start: another user's job is a 404", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  await assert.rejects(
    () => start(new FakeSource(), "j1", "intruder"),
    (err: { status?: number }) => err.status === 404,
  );
});

test("start: saves a normalised domain, and rejects bad or missing ones", async () => {
  db.addJob({ id: "j1", userId: "u1", domain: null });
  const source = new FakeSource();

  await assert.rejects(
    () => service.startHireSearchForJob(user("u1"), "j1", { domain: "https://www.linkedin.com/jobs/1" }, deps(source)),
    (err: { code?: string; status?: number }) => err.code === "INVALID_DOMAIN" && err.status === 400,
  );
  await assert.rejects(
    () => start(source),
    (err: { code?: string }) => err.code === "NO_DOMAIN",
  );
  assert.equal(db.jobs.get("j1")!.searchError, "NO_DOMAIN");
  assert.equal(source.calls.length, 0);

  await service.startHireSearchForJob(user("u1"), "j1", { domain: "https://www.Stripe.com/about" }, deps(source));
  assert.equal(db.jobs.get("j1")!.domain, "stripe.com");
  assert.equal(source.calls.length, 1);
});

test("start: the allowlist blocks other users before any claim or paid call", async () => {
  process.env.HIRE_SEARCH_ALLOWED_EMAILS = "Beta@Example.test, other@example.test";
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();

  await assert.rejects(
    () => service.startHireSearchForJob(user("u1", "stranger@example.test"), "j1", {}, deps(source)),
    (err: { code?: string; status?: number }) => err.code === "FEATURE_RESTRICTED" && err.status === 403,
  );
  assert.equal(db.jobs.get("j1")!.searchStatus, "NOT_STARTED");
  assert.equal(source.calls.length, 0);

  await service.startHireSearchForJob(user("u1", "BETA@example.test"), "j1", {}, deps(source));
  assert.equal(source.calls.length, 1);
});

test("start: refuses SEARCH_TOO_SOON after a recent search, but a failed one may retry", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-HOUR) });
  const source = new FakeSource();
  await assert.rejects(
    () => start(source),
    (err: { code?: string; status?: number }) => err.code === "SEARCH_TOO_SOON" && err.status === 409,
  );
  assert.equal(source.calls.length, 0);

  db.jobs.get("j1")!.searchStatus = "FAILED";
  await start(source);
  assert.equal(source.calls.length, 1);
});

test("start: a search older than the refresh interval is allowed", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-25 * HOUR) });
  const source = new FakeSource();
  await start(source);
  assert.equal(source.calls.length, 1);
});

// ─── limits ──────────────────────────────────────────────────────────────────

test("daily limit: counted from the database, provider searches only", async () => {
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "2";
  // Two provider searches in the last day (credits recorded), and one cache hit (none recorded).
  db.addJob({ id: "a", userId: "u1", role: "Role A Manager", searchStatus: "DONE", lastSearchedAt: later(-2 * HOUR), searchCreditsUsed: 3 });
  db.addJob({ id: "b", userId: "u1", role: "Role B Manager", searchStatus: "DONE", lastSearchedAt: later(-3 * HOUR), searchCreditsUsed: 0 });
  db.addJob({ id: "cached", userId: "u1", role: "Role C Manager", searchStatus: "DONE", lastSearchedAt: later(-1 * HOUR), searchCreditsUsed: null });
  db.addJob({ id: "c", userId: "u1", role: "Role D Manager" });
  const source = new FakeSource();

  await assert.rejects(
    () => start(source, "c"),
    (err: { code?: string; status?: number }) => err.code === "DAILY_LIMIT_REACHED" && err.status === 429,
  );
  assert.equal(source.calls.length, 0);
  assert.equal(db.jobs.get("c")!.searchStatus, "FAILED");
  assert.equal(db.jobs.get("c")!.searchError, "DAILY_LIMIT_REACHED");
});

test("daily limit: searches older than a day and other users' searches do not count", async () => {
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "1";
  db.addJob({ id: "old", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-30 * HOUR), searchCreditsUsed: 5 });
  db.addJob({ id: "theirs", userId: "u2", searchStatus: "DONE", lastSearchedAt: later(-HOUR), searchCreditsUsed: 5 });
  db.addJob({ id: "j1", userId: "u1", role: "Staff Data Scientist" });
  const source = new FakeSource();
  source.outcome = outcome([record("a", { title: "Data Scientist" })]);
  await start(source, "j1");
  assert.equal(source.calls.length, 1);
});

test("monthly budget: a free user is paused before the provider is called", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUser("u1", "FREE");
  db.addUsage("u2", "HIRE_SEARCH", later(-HOUR), { pdlRecords: 10 });
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();

  await assert.rejects(
    () => start(source),
    (err: { code?: string; status?: number }) => err.code === "FREE_SEARCHES_PAUSED" && err.status === 403,
  );
  assert.equal(source.calls.length, 0);
  assert.equal(db.jobs.get("j1")!.searchStatus, "FAILED");
  assert.equal(db.jobs.get("j1")!.searchError, "FREE_SEARCHES_PAUSED");
});

test("monthly budget: the page size shrinks to what is left, and last month's credits do not count", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUser("u1", "FREE");
  db.addUsage("u2", "HIRE_SEARCH", new Date(Date.UTC(2026, 4, 31, 23, 0, 0)), { pdlRecords: 99 });
  db.addUsage("u2", "HIRE_SEARCH", later(-HOUR), { pdlRecords: 7 });
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await start(source);
  assert.equal(source.calls[0].size, 3, "10 budget - 7 used this month");
});

test("page size: PDL_MAX_RESULTS applies, and is capped at 25", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u1", role: "Staff Data Scientist" });
  process.env.PDL_MAX_RESULTS = "4";
  const source = new FakeSource();
  await start(source, "j1");
  assert.equal(source.calls[0].size, 4);

  process.env.PDL_MAX_RESULTS = "500";
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "1000";
  await start(source, "j2");
  assert.equal(source.calls[1].size, 25);
});

// ─── failures ────────────────────────────────────────────────────────────────

test("a provider error releases the claim as FAILED, is never cached, and reaches the caller", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.failWith = new Error("boom");
  await assert.rejects(() => start(source), /boom/);
  const job = db.jobs.get("j1")!;
  assert.equal(job.searchStatus, "FAILED");
  assert.equal(job.searchError, "PROVIDER_FAILED");
  assert.equal(db.counters.cacheWrites, 0);
  assert.equal(db.candidates.size, 0);
  assert.equal(job.searchCreditsUsed, null);
});

test("a provider rate limit and a missing key are stored as their own codes", async () => {
  const { RateLimitedError, ServiceUnavailableError } = await import("@/server/errors");
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u1", role: "Staff Data Scientist" });
  const source = new FakeSource();

  source.failWith = new RateLimitedError("slow down", undefined, "RATE_LIMITED", 30);
  await assert.rejects(() => start(source, "j1"));
  assert.equal(db.jobs.get("j1")!.searchError, "RATE_LIMITED");

  source.failWith = new ServiceUnavailableError("Hire search is not configured");
  await assert.rejects(() => start(source, "j2"));
  assert.equal(db.jobs.get("j2")!.searchError, "SERVICE_UNAVAILABLE");
});

test("a failed search can be retried and then succeeds", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.failWith = new Error("boom");
  await assert.rejects(() => start(source));
  source.failWith = null;
  source.outcome = outcome([record("a")]);
  const summary = await start(source, "j1", "u1", later(60_000));
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.searchError, null);
});

// ─── ingestion ───────────────────────────────────────────────────────────────

test("a later search keeps votes and never duplicates candidates", async () => {
  process.env.HIRE_CACHE_DISABLED = "true";
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  await start(source);
  db.candidates.get("j1|a")!.votes.push("vote-1");

  source.outcome = outcome([record("a", { title: "Group Product Manager" })]);
  await start(source, "j1", "u1", later(25 * HOUR));

  assert.equal(db.candidates.size, 1);
  assert.deepEqual(db.candidates.get("j1|a")!.votes, ["vote-1"]);
  assert.equal(db.candidates.get("j1|a")!.title, "Group Product Manager");
});

test("a search that no longer holds the claim writes nothing", async () => {
  const { ingestRecords } = await import("@/server/services/hireSearch/ingest");
  db.addJob({ id: "j1", userId: "u1", searchStatus: "RUNNING", searchStartedAt: later(0) });
  const written = await ingestRecords(
    { id: "j1", role: "Product Manager", postedMonth: new Date(Date.UTC(2026, 1, 1)) },
    [record("a")],
    { jobId: "j1", startedAt: later(-60_000), now: NOW, creditsUsed: 1, totalMatches: 1, skippedInternal: 0 },
  );
  assert.equal(written, null);
  assert.equal(db.candidates.size, 0);
  assert.equal(db.jobs.get("j1")!.searchStatus, "RUNNING");
});

// ─── refresh (status read) ───────────────────────────────────────────────────

test("refresh: a fresh RUNNING job stays RUNNING", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "RUNNING", searchStartedAt: later(-10_000) });
  const summary = await service.refreshHireSearch("u1", "j1", { now: () => NOW });
  assert.equal(summary.searchStatus, "RUNNING");
});

test("refresh: a RUNNING job past 2 minutes becomes FAILED/TIMEOUT and can be retried", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "RUNNING", searchStartedAt: later(-121_000) });
  const summary = await service.refreshHireSearch("u1", "j1", { now: () => NOW });
  assert.equal(summary.searchStatus, "FAILED");
  assert.equal(summary.searchError, "TIMEOUT");

  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  assert.equal((await start(source)).searchStatus, "DONE");
});

test("refresh: a DONE job is returned as is, and only the owner can read it", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-HOUR), searchTotalMatches: 12, searchSkippedInternal: 2 });
  const summary = await service.refreshHireSearch("u1", "j1", { now: () => NOW });
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.searchTotalMatches, 12);
  assert.equal(summary.searchSkippedInternal, 2);
  await assert.rejects(
    () => service.refreshHireSearch("intruder", "j1", { now: () => NOW }),
    (err: { status?: number }) => err.status === 404,
  );
});

// ─── shared cache ────────────────────────────────────────────────────────────

test("cache: a second job with the same inputs is served from the cache with no provider call and no credits", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u2" });
  const source = new FakeSource();
  source.outcome = outcome([record("a"), record("b")], { total: 9, skippedInternal: 1 });
  await start(source, "j1", "u1");
  assert.equal(db.cache.size, 1);

  const summary = await start(source, "j2", "u2", later(60_000));
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.candidateCount, 2);
  assert.equal(summary.searchTotalMatches, 9);
  assert.equal(summary.searchSkippedInternal, 1);
  assert.equal(source.calls.length, 1, "no second provider call");
  assert.equal(db.jobs.get("j2")!.searchCreditsUsed, null, "stored results record no provider records");
});

test("cache: a cache hit does not count against the daily limit", async () => {
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "1";
  db.addJob({ id: "j1", userId: "u2" });
  db.addJob({ id: "j2", userId: "u1" });
  db.addJob({ id: "j3", userId: "u1", role: "Staff Data Scientist" });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  await start(source, "j1", "u2");
  await start(source, "j2", "u1", later(60_000)); // cache hit
  source.outcome = outcome([record("b", { title: "Data Scientist" })]);
  const summary = await start(source, "j3", "u1", later(120_000)); // first provider search for u1
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(source.calls.length, 2);
});

test("cache: HIRE_CACHE_DISABLED skips reads and writes outside production, and is ignored in production", async () => {
  process.env.HIRE_CACHE_DISABLED = "true";
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u2" });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  await start(source, "j1", "u1");
  assert.equal(db.cache.size, 0);
  await start(source, "j2", "u2", later(60_000));
  assert.equal(source.calls.length, 2);

  db.cache.clear();
  db.addJob({ id: "j3", userId: "u3" });
  (process.env as Record<string, string>).NODE_ENV = "production";
  await start(source, "j3", "u3", later(120_000));
  assert.equal(db.cache.size, 1);
});

test("cache: empty results get the short TTL, non-empty the long one", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u1", role: "Staff Data Scientist" });
  const source = new FakeSource();
  source.outcome = outcome([]);
  await start(source, "j1");
  source.outcome = outcome([record("a", { title: "Data Scientist" })]);
  await start(source, "j2");

  const ttlsHours = [...db.cache.values()]
    .map((entry) => Math.round((entry.expiresAt.getTime() - NOW.getTime()) / HOUR))
    .sort((a, b) => a - b);
  assert.deepEqual(ttlsHours, [24, 168]);
});

test("cache: rows that fail validation are ignored rather than ingested", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.outcome = outcome([record("a")]);
  const key = service.hireCacheKey({
    source: "PDL",
    domain: "stripe.com",
    sinceMonth: "2026-02",
    untilMonth: "2026-05",
    fingerprint: source.fingerprint({ role: "Senior Product Manager" } as SearchInput),
  });
  db.cache.set(key, { cacheKey: key, rows: { nope: true }, expiresAt: later(HOUR) });
  const summary = await start(source);
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(source.calls.length, 1);
});

test("cache: only the minimal record fields are stored", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  const withExtras = { ...record("a"), email: "someone@example.test", phone: "555", rawProfile: { x: 1 } };
  source.outcome = outcome([withExtras as HireRecord]);
  await start(source);
  const stored = JSON.stringify([...db.cache.values()][0].rows);
  assert.ok(stored.includes("Person a"), "the kept fields are there");
  // Anything a provider layer let through that is not a kept field is stripped at the cache boundary.
  assert.ok(!stored.includes("someone@example.test"));
  assert.ok(!stored.includes("rawProfile"));
  assert.ok(!stored.includes("phone"));
});

// ─── search-again timing ─────────────────────────────────────────────────────

test("nextSearchAllowedAt: set inside the interval, null after it or when failed", () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000);
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  assert.ok(service.nextSearchAllowedAt(recent, "DONE"));
  assert.equal(service.nextSearchAllowedAt(old, "DONE"), null);
  assert.equal(service.nextSearchAllowedAt(recent, "FAILED"), null);
  assert.equal(service.nextSearchAllowedAt(null, "NOT_STARTED"), null);
});
