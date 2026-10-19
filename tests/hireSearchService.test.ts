import "./helpers/testEnv";
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "./helpers/fakeDb";
import type { CheckSearchResult, HireRecord, HireSource, RunRef, StartSearchInput } from "@/server/services/hireSearch/types";

type Service = typeof import("@/server/services/hireSearch");

let service: Service;
let db: ReturnType<typeof createFakeDb>;
let restore: () => void;

const ENV_KEYS = [
  "HIRE_SEARCH_ALLOWED_EMAILS",
  "HIRE_SEARCH_DAILY_LIMIT_PER_USER",
  "HIRE_SEARCH_REFRESH_AFTER_HOURS",
  "HIRE_SEARCH_RUN_TIMEOUT_MS",
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
  for (const key of ENV_KEYS) delete process.env[key];
  (process.env as Record<string, string>).NODE_ENV = "test";
  // The in-memory limiter is shared across tests; only the limit test lowers this.
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "1000";
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

after(() => undefined);

const NOW = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));

class FakeSource implements HireSource {
  kind = "APIFY_NEW_HIRES" as const;
  starts: StartSearchInput[] = [];
  checks = 0;
  aborts = 0;
  next: CheckSearchResult = { state: "running" };
  failStart: Error | null = null;

  async startSearch(input: StartSearchInput): Promise<RunRef> {
    if (this.failStart) throw this.failStart;
    this.starts.push(input);
    return { runId: `run${this.starts.length}`, datasetId: `ds${this.starts.length}` };
  }
  async checkSearch(): Promise<CheckSearchResult> {
    this.checks++;
    return this.next;
  }
  async abortSearch(): Promise<void> {
    this.aborts++;
  }
}

const deps = (source: FakeSource, now: Date = NOW) => ({ source, now: () => now });
const user = (id: string, email = `${id}@example.test`) => ({ id, email });
const later = (ms: number) => new Date(NOW.getTime() + ms);

const record = (externalId: string, overrides: Partial<HireRecord> = {}): HireRecord => ({
  externalId,
  fullName: `Person ${externalId}`,
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
  ...overrides,
});

async function startAndRun(source: FakeSource, jobId = "j1", userId = "u1") {
  await service.startHireSearchForJob(user(userId), jobId, {}, deps(source));
}

// ─── start ───────────────────────────────────────────────────────────────────

test("start: claims the job, starts one run and records it", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  const summary = await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source));

  assert.equal(summary.searchStatus, "RUNNING");
  assert.equal(source.starts.length, 1);
  assert.equal(source.starts[0].domain, "stripe.com");
  assert.equal(source.starts[0].sinceMonth, "2026-02");
  assert.deepEqual(source.starts[0].keywords, ["product manager"]);
  const job = db.jobs.get("j1")!;
  assert.equal(job.searchRunId, "run1");
  assert.equal(job.searchDatasetId, "ds1");
});

test("start: a second call while RUNNING does not start another run", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  const again = await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source, later(60_000)));
  assert.equal(again.searchStatus, "RUNNING");
  assert.equal(source.starts.length, 1);
});

test("start: two simultaneous calls start only one run", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await Promise.all([
    service.startHireSearchForJob(user("u1"), "j1", {}, deps(source)),
    service.startHireSearchForJob(user("u1"), "j1", {}, deps(source)),
  ]);
  assert.equal(source.starts.length, 1);
});

test("start: another user's job is a 404", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  await assert.rejects(
    () => service.startHireSearchForJob(user("intruder"), "j1", {}, deps(new FakeSource())),
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
    () => service.startHireSearchForJob(user("u1"), "j1", {}, deps(source)),
    (err: { code?: string }) => err.code === "NO_DOMAIN",
  );
  assert.equal(db.jobs.get("j1")!.searchError, "NO_DOMAIN");
  assert.equal(source.starts.length, 0);

  await service.startHireSearchForJob(user("u1"), "j1", { domain: "https://www.Stripe.com/about" }, deps(source));
  assert.equal(db.jobs.get("j1")!.domain, "stripe.com");
  assert.equal(source.starts.length, 1);
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
  assert.equal(source.starts.length, 0);

  // Matching is case-insensitive.
  await service.startHireSearchForJob(user("u1", "BETA@example.test"), "j1", {}, deps(source));
  assert.equal(source.starts.length, 1);
});

test("start: the per-user daily limit counts provider runs", async () => {
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "2";
  const userId = `limited-${Math.random()}`;
  for (const id of ["a", "b", "c"]) db.addJob({ id, userId, role: `Role ${id} Manager` });
  const source = new FakeSource();

  await service.startHireSearchForJob(user(userId), "a", {}, deps(source));
  await service.startHireSearchForJob(user(userId), "b", {}, deps(source));
  await assert.rejects(
    () => service.startHireSearchForJob(user(userId), "c", {}, deps(source)),
    (err: { code?: string; status?: number }) => err.code === "LIMIT_REACHED" && err.status === 429,
  );
  assert.equal(source.starts.length, 2);
  const job = db.jobs.get("c")!;
  assert.equal(job.searchStatus, "FAILED");
  assert.equal(job.searchError, "LIMIT_REACHED");
});

test("start: refuses SEARCH_TOO_SOON after a recent search, but a failed one may retry", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-60 * 60 * 1000) });
  const source = new FakeSource();
  await assert.rejects(
    () => service.startHireSearchForJob(user("u1"), "j1", {}, deps(source)),
    (err: { code?: string; status?: number }) => err.code === "SEARCH_TOO_SOON" && err.status === 409,
  );
  assert.equal(source.starts.length, 0);

  db.jobs.get("j1")!.searchStatus = "FAILED";
  await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source));
  assert.equal(source.starts.length, 1);
});

test("start: a search older than the refresh interval is allowed", async () => {
  db.addJob({ id: "j1", userId: "u1", searchStatus: "DONE", lastSearchedAt: later(-25 * 60 * 60 * 1000) });
  const source = new FakeSource();
  await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source));
  assert.equal(source.starts.length, 1);
});

test("start: a provider error releases the claim as FAILED and reaches the caller", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  source.failStart = new Error("boom");
  await assert.rejects(() => service.startHireSearchForJob(user("u1"), "j1", {}, deps(source)), /boom/);
  const job = db.jobs.get("j1")!;
  assert.equal(job.searchStatus, "FAILED");
  assert.equal(job.searchError, "PROVIDER_FAILED");
});

// ─── refresh ─────────────────────────────────────────────────────────────────

test("refresh: stays RUNNING while the provider is running", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  const summary = await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(summary.searchStatus, "RUNNING");
  assert.equal(source.checks, 1);
  assert.equal(source.aborts, 0);
});

test("refresh: succeeded ingests the in-window records, marks DONE and writes the cache", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = {
    state: "succeeded",
    costUsd: 0.02,
    records: [record("a"), record("b", { startedMonth: "2025-06" }), record("c", { startedMonth: "2026-05" })],
  };
  const summary = await service.refreshHireSearch("u1", "j1", deps(source, later(30_000)));

  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.candidateCount, 2); // "b" is before the window
  assert.ok(summary.lastSearchedAt);
  assert.equal(db.jobs.get("j1")!.searchCostUsd, 0.02);
  assert.equal(db.counters.cacheWrites, 1);
});

test("refresh: concurrent polls ingest exactly once", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = { state: "succeeded", costUsd: 0, records: [record("a"), record("b")] };

  const results = await Promise.all([
    service.refreshHireSearch("u1", "j1", deps(source, later(30_000))),
    service.refreshHireSearch("u1", "j1", deps(source, later(30_000))),
    service.refreshHireSearch("u1", "j1", deps(source, later(30_000))),
  ]);
  for (const result of results) assert.equal(result.searchStatus, "DONE");
  assert.equal(db.counters.candidateUpserts, 2);
  assert.equal(db.counters.cacheWrites, 1);
});

test("refresh: is idempotent once DONE, and re-ingesting keeps votes and never duplicates", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = { state: "succeeded", costUsd: 0, records: [record("a")] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(30_000)));

  db.candidates.get("j1|a")!.votes.push("vote-1");
  const checksBefore = source.checks;
  const again = await service.refreshHireSearch("u1", "j1", deps(source, later(60_000)));
  assert.equal(again.searchStatus, "DONE");
  assert.equal(source.checks, checksBefore, "a DONE job is not re-checked");

  // Force a second ingestion of the same record (a later search): same key, votes kept.
  const job = db.jobs.get("j1")!;
  job.searchStatus = "FAILED";
  process.env.HIRE_CACHE_DISABLED = "true"; // otherwise the first run's cache entry would be reused
  await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source, later(3 * 60 * 1000)));
  source.next = { state: "succeeded", costUsd: 0, records: [record("a", { title: "Group Product Manager" })] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(4 * 60 * 1000)));

  assert.equal(db.candidates.size, 1);
  assert.deepEqual(db.candidates.get("j1|a")!.votes, ["vote-1"]);
  assert.equal(db.candidates.get("j1|a")!.title, "Group Product Manager");
});

test("refresh: a failed run becomes FAILED and is never cached", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = { state: "failed", reason: "PROVIDER_FAILED" };
  const summary = await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(summary.searchStatus, "FAILED");
  assert.equal(summary.searchError, "PROVIDER_FAILED");
  assert.equal(db.counters.cacheWrites, 0);
  assert.equal(db.candidates.size, 0);
});

test("refresh: a plan-limit failure is reported as LIMIT_REACHED", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = { state: "failed", reason: "LIMIT_REACHED" };
  const summary = await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(summary.searchError, "LIMIT_REACHED");
});

test("refresh: a run over the timeout is aborted and marked TIMEOUT", async () => {
  process.env.HIRE_SEARCH_RUN_TIMEOUT_MS = "60000";
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  const summary = await service.refreshHireSearch("u1", "j1", deps(source, later(61_000)));
  assert.equal(summary.searchStatus, "FAILED");
  assert.equal(summary.searchError, "TIMEOUT");
  assert.equal(source.aborts, 1);
  assert.equal(db.counters.cacheWrites, 0);
});

test("refresh: a status-check error is transient until the timeout", async () => {
  process.env.HIRE_SEARCH_RUN_TIMEOUT_MS = "60000";
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.checkSearch = async () => {
    throw new Error("network");
  };
  assert.equal((await service.refreshHireSearch("u1", "j1", deps(source, later(5_000)))).searchStatus, "RUNNING");
  const late = await service.refreshHireSearch("u1", "j1", deps(source, later(61_000)));
  assert.equal(late.searchError, "TIMEOUT");
});

test("refresh: only the owner can read a job's search", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  await assert.rejects(
    () => service.refreshHireSearch("intruder", "j1", deps(new FakeSource())),
    (err: { status?: number }) => err.status === 404,
  );
});

// ─── shared cache ────────────────────────────────────────────────────────────

test("cache: a second job with the same inputs is served from the cache without a provider run", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u2" });
  const source = new FakeSource();
  await startAndRun(source, "j1", "u1");
  source.next = { state: "succeeded", costUsd: 0.01, records: [record("a"), record("b")] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(db.cache.size, 1);

  const summary = await service.startHireSearchForJob(user("u2"), "j2", {}, deps(source, later(20_000)));
  assert.equal(summary.searchStatus, "DONE");
  assert.equal(summary.candidateCount, 2);
  assert.equal(source.starts.length, 1, "no second provider run");
});

test("cache: HIRE_CACHE_DISABLED skips reads and writes outside production", async () => {
  process.env.HIRE_CACHE_DISABLED = "true";
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u2" });
  const source = new FakeSource();
  await startAndRun(source, "j1", "u1");
  source.next = { state: "succeeded", costUsd: 0, records: [record("a")] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(db.cache.size, 0);

  const summary = await service.startHireSearchForJob(user("u2"), "j2", {}, deps(source, later(20_000)));
  assert.equal(summary.searchStatus, "RUNNING");
  assert.equal(source.starts.length, 2);
});

test("cache: HIRE_CACHE_DISABLED is ignored in production", async () => {
  process.env.HIRE_CACHE_DISABLED = "true";
  (process.env as Record<string, string>).NODE_ENV = "production";
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  await startAndRun(source);
  source.next = { state: "succeeded", costUsd: 0, records: [record("a")] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));
  assert.equal(db.cache.size, 1);
});

test("cache: empty results get the short TTL, non-empty the long one", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  db.addJob({ id: "j2", userId: "u1", role: "Staff Data Scientist" });
  const source = new FakeSource();

  await startAndRun(source, "j1");
  source.next = { state: "succeeded", costUsd: 0, records: [] };
  await service.refreshHireSearch("u1", "j1", deps(source, later(10_000)));

  await startAndRun(source, "j2");
  source.next = { state: "succeeded", costUsd: 0, records: [record("a", { title: "Data Scientist" })] };
  await service.refreshHireSearch("u1", "j2", deps(source, later(10_000)));

  const ttlsHours = [...db.cache.values()]
    .map((entry) => Math.round((entry.expiresAt.getTime() - later(10_000).getTime()) / 3_600_000))
    .sort((a, b) => a - b);
  assert.deepEqual(ttlsHours, [24, 168]);
});

test("cache: rows that fail validation are ignored rather than ingested", async () => {
  db.addJob({ id: "j1", userId: "u1" });
  const source = new FakeSource();
  const inputs = { sinceMonth: "2026-02", keywords: ["product manager"] };
  db.cache.set(service.hireCacheKey("stripe.com", inputs.sinceMonth, inputs.keywords), {
    cacheKey: service.hireCacheKey("stripe.com", inputs.sinceMonth, inputs.keywords),
    rows: [{ nope: true }],
    expiresAt: later(3_600_000),
  });
  const summary = await service.startHireSearchForJob(user("u1"), "j1", {}, deps(source));
  assert.equal(summary.searchStatus, "RUNNING");
  assert.equal(source.starts.length, 1);
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
