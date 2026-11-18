import "./helpers/testEnv";
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createFakeDb } from "./helpers/fakeDb";
import { getErrorMessage, ApiError } from "@/lib/apiClient";
import { compareLine, creditsBeforeSearchLine } from "@/lib/plans";
import type { HireRecord, HireSource, SearchInput, SearchOutcome } from "@/server/services/hireSearch/types";

type Service = typeof import("@/server/services/hireSearch");
type Credits = typeof import("@/server/services/billing/credits");

let service: Service;
let credits: Credits;
let db: ReturnType<typeof createFakeDb>;
let restore: () => void;

const ENV_KEYS = ["HIRE_SEARCH_ALLOWED_EMAILS", "HIRE_SEARCH_DAILY_LIMIT_PER_USER", "PDL_MONTHLY_CREDIT_BUDGET", "PDL_MAX_RESULTS", "HIRE_CACHE_DISABLED", "NODE_ENV"] as const;
const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  service = await import("@/server/services/hireSearch");
  credits = await import("@/server/services/billing/credits");
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

beforeEach(async () => {
  db = createFakeDb();
  restore = await db.install();
  for (const key of ENV_KEYS) delete process.env[key];
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.HIRE_SEARCH_DAILY_LIMIT_PER_USER = "1000";
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "1000";
  console.error = () => undefined;
});

afterEach(() => {
  restore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string>)[key] = savedEnv[key]!;
  }
});

const NOW = new Date(Date.UTC(2026, 5, 15, 12)); // 2026-06-15
const NEXT_MONTH = new Date(Date.UTC(2026, 6, 5, 12)); // 2026-07-05
const DAY = 86_400_000;

const record = (id: string): HireRecord => ({
  externalId: id,
  fullName: `Person ${id}`,
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
  confidence: "MEDIUM",
});

/** Returns `available` people (as many as were asked for), bills one provider record per person returned. */
class FakeSource implements HireSource {
  kind = "PDL" as const;
  sizes: number[] = [];
  available = 5;
  /** Records the provider billed beyond the ones it returned (people dropped as internal moves). */
  droppedAsInternal = 0;
  failWith: Error | null = null;
  fingerprint(input: SearchInput) {
    return `fp:${input.role}`;
  }
  async search(input: SearchInput): Promise<SearchOutcome> {
    this.sizes.push(input.size);
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    const n = Math.min(this.available, input.size);
    const records = Array.from({ length: n }, (_, i) => record(`r${this.sizes.length}-${i}`));
    return { records, total: this.available, skippedInternal: this.droppedAsInternal, creditsUsed: n + this.droppedAsInternal };
  }
}

let jobSeq = 0;
/** A search on a fresh job; `role` decides the shared-results key, so a repeated role is a stored-results hit. */
function search(source: FakeSource, userId = "u1", now = NOW, role = `Role ${++jobSeq}`) {
  const id = `job${++jobSeq}`;
  db.addJob({ id, userId, role });
  return service.startHireSearchForJob({ id: userId, email: `${userId}@example.test` }, id, {}, { source, now: () => now }).then(
    (summary) => ({ ...summary, jobId: id }),
  );
}
const blocked = (code: string) => (err: { code?: string }) => err.code === code;
const hireEvents = (userId?: string) =>
  [...db.usageEvents.values()].filter((e) => e.kind === "HIRE_SEARCH" && (!userId || e.userId === userId));
const creditsSpent = (userId: string) => hireEvents(userId).reduce((sum, e) => sum + e.credits, 0);
const unlockedBy = (userId: string) => [...db.unlocks.values()].filter((u) => u.userId === userId);

/** People found for a job, without any search (for direct showCandidates tests). */
function addPeople(jobId: string, userId: string, count: number) {
  db.addJob({ id: jobId, userId });
  for (let i = 0; i < count; i++) {
    db.candidates.set(`${jobId}|c${i}`, { id: `${jobId}|c${i}`, jobId, externalId: `c${i}`, hidden: false, votes: [], confidence: "MEDIUM" });
  }
}

// ─── free plan ───────────────────────────────────────────────────────────────

test("free: 3 credits a month; a fresh search asks for 3; the next one is blocked", async () => {
  const source = new FakeSource();
  const first = await search(source);
  assert.deepEqual(source.sizes, [3]);
  assert.equal(first.candidateCount, 3);
  assert.equal(creditsSpent("u1"), 3);

  await assert.rejects(search(source), (err: { code?: string; details?: unknown }) => {
    assert.equal(err.code, "PLAN_LIMIT_REACHED");
    assert.deepEqual(err.details, { feature: "hire_search", plan: "FREE", limit: 3, used: 3, resetsAt: "2026-07-01T00:00:00.000Z" });
    return true;
  });
  assert.equal(source.sizes.length, 1, "the provider was not called");
});

test("free: a new UTC month resets the credits (no rollover)", async () => {
  const source = new FakeSource();
  await search(source);
  await assert.rejects(search(source), blocked("PLAN_LIMIT_REACHED"));
  const again = await search(source, "u1", NEXT_MONTH);
  assert.equal(again.candidateCount, 3);
  assert.deepEqual(source.sizes, [3, 3]);
});

test("free: 1 Compare per month, then blocked until the month resets", async () => {
  await credits.assertCanCompare("u1", NOW);
  await assert.rejects(credits.assertCanCompare("u1", NOW), (err: { code?: string; details?: { feature: string; resetsAt: string } }) => {
    return err.code === "PLAN_LIMIT_REACHED" && err.details?.feature === "compare" && err.details.resetsAt === "2026-07-01T00:00:00.000Z";
  });
  await credits.assertCanCompare("u1", NEXT_MONTH);
});

// ─── pro plan ────────────────────────────────────────────────────────────────

test("pro with 2 credits left: a fresh search asks for 2", async () => {
  db.addUser("p1", "PRO");
  db.addUsage("p1", "HIRE_SEARCH", new Date(NOW.getTime() - DAY), { credits: 48, pdlRecords: 48 });
  const source = new FakeSource();
  const result = await search(source, "p1");
  assert.deepEqual(source.sizes, [2]);
  assert.equal(result.candidateCount, 2);
  await assert.rejects(search(source, "p1"), blocked("PLAN_LIMIT_REACHED"));
});

test("pro: a full search asks for 5 and costs 5 credits", async () => {
  db.addUser("p1", "PRO");
  const source = new FakeSource();
  await search(source, "p1");
  assert.deepEqual(source.sizes, [5]);
  assert.equal(creditsSpent("p1"), 5);
});

test("compare: pro is allowed 50 a month and blocked at the 51st; the cap is not in the usage numbers", async () => {
  db.addUser("p1", "PRO");
  for (let i = 0; i < 50; i++) await credits.assertCanCompare("p1", NOW);
  await assert.rejects(credits.assertCanCompare("p1", NOW), blocked("PLAN_LIMIT_REACHED"));
  const usage = await credits.getUsage("p1", NOW);
  assert.equal(usage.compare.limit, null);
  await credits.assertCanCompare("p1", NEXT_MONTH);
});

test("an expired pro plan counts as free", async () => {
  db.addUser("p1", "PRO", new Date(NOW.getTime() - DAY));
  const source = new FakeSource();
  await search(source, "p1");
  assert.deepEqual(source.sizes, [3]);
});

// ─── stored results are not free ─────────────────────────────────────────────

test("stored results charge for the people shown; re-opening the job charges nothing", async () => {
  db.addUser("a", "PRO");
  db.addUser("b", "PRO");
  const source = new FakeSource();
  await search(source, "a", NOW, "Shared Role");
  assert.equal(source.sizes.length, 1);

  const second = await search(source, "b", NOW, "Shared Role");
  assert.equal(source.sizes.length, 1, "no second provider call");
  assert.equal(second.candidateCount, 5);
  assert.equal(creditsSpent("b"), 5, "5 people newly shown cost 5 credits");
  assert.equal(hireEvents("b")[0].pdlRecords, 0, "and no provider records were billed");

  // Opening it again: nothing new to show, nothing charged, no new event.
  const events = hireEvents("b").length;
  const reopened = await credits.showCandidates("b", second.jobId, NOW);
  assert.equal(reopened.newlyUnlocked, 0);
  assert.equal((await credits.unlockForUser("b", second.jobId, NOW)).newlyUnlocked, 0);
  assert.equal(hireEvents("b").length, events);
  assert.equal(creditsSpent("b"), 5);
});

test("2 credits left and 5 found: 2 are unlocked, 3 stay locked and only the count is sent", async () => {
  db.addUser("a", "PRO");
  const source = new FakeSource();
  await search(source, "a", NOW, "Shared Role");

  db.addUsage("u2", "HIRE_SEARCH", new Date(NOW.getTime() - DAY), { credits: 1 });
  db.addUser("u2", "FREE"); // 3 - 1 = 2 left
  const result = await search(source, "u2", NOW, "Shared Role");
  assert.equal(result.candidateCount, 2);
  assert.equal(result.lockedCount, 3);
  assert.equal(unlockedBy("u2").length, 2);
  assert.doesNotMatch(JSON.stringify(result), /Person|r1-|linkedin|startedMonth/);

  // The job list only includes people the user has unlocked.
  const { jobWithCandidatesInclude } = await import("@/server/repositories/jobs.repo");
  assert.deepEqual(jobWithCandidatesInclude("u2").candidates.where, { hidden: false, unlocks: { some: { userId: "u2" } } });
});

test("the Unlock button spends the credits left on people already found, then says out of credits", async () => {
  addPeople("jx", "u1", 5);
  db.addUsage("u1", "HIRE_SEARCH", new Date(NOW.getTime() - DAY), { credits: 1 }); // 2 left
  const first = await credits.unlockForUser("u1", "jx", NOW);
  assert.equal(first.newlyUnlocked, 2);
  assert.equal(first.lockedCount, 3);
  await assert.rejects(credits.unlockForUser("u1", "jx", NOW), blocked("PLAN_LIMIT_REACHED"));
  // Next month there are credits again, but never more than 5 people per job.
  const next = await credits.unlockForUser("u1", "jx", NEXT_MONTH);
  assert.equal(next.newlyUnlocked, 3);
  assert.equal(next.lockedCount, 0);
});

test("no more than 5 people are unlocked on one job", async () => {
  db.addUser("p1", "PRO");
  addPeople("jx", "p1", 9);
  const result = await credits.showCandidates("p1", "jx", NOW);
  assert.equal(result.newlyUnlocked, 5);
  assert.equal(result.lockedCount, 0);
});

// ─── what is charged ─────────────────────────────────────────────────────────

test("the charge is the people shown after internal moves are dropped; the provider bill is recorded separately", async () => {
  db.addUser("p1", "PRO");
  const source = new FakeSource();
  source.available = 3;
  source.droppedAsInternal = 2;
  const result = await search(source, "p1");
  assert.equal(result.candidateCount, 3);
  const [event] = hireEvents("p1");
  assert.equal(event.credits, 3);
  assert.equal(event.pdlRecords, 5);
});

test("a search that finds nobody costs 0 credits", async () => {
  const source = new FakeSource();
  source.available = 0;
  const result = await search(source);
  assert.equal(result.searchStatus, "DONE");
  assert.equal(creditsSpent("u1"), 0);
  assert.equal(unlockedBy("u1").length, 0);
  assert.equal((await credits.getUsage("u1", NOW)).credits.remaining, 3);
});

test("a provider error charges nothing and records nothing", async () => {
  const source = new FakeSource();
  source.failWith = new Error("boom");
  await assert.rejects(search(source), /boom/);
  assert.equal(db.usageEvents.size, 0);
  assert.equal(db.unlocks.size, 0);
  source.failWith = null;
  assert.equal((await search(source)).candidateCount, 3, "the credits are all still there");
});

// ─── the shared provider budget ──────────────────────────────────────────────

test("stored results still work when the provider budget is used up; a fresh free search does not", async () => {
  db.addUser("a", "PRO");
  const source = new FakeSource();
  await search(source, "a", NOW, "Shared Role");

  process.env.PDL_MONTHLY_CREDIT_BUDGET = "5"; // the 5 records above used it all
  const fromStore = await search(source, "u1", NOW, "Shared Role");
  assert.equal(fromStore.candidateCount, 3);

  db.addUser("u3", "FREE");
  await assert.rejects(search(source, "u3", NOW, "Another Role"), blocked("FREE_SEARCHES_PAUSED"));
});

test("pro keeps searching until the budget is 120% used, then capacity is reached", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUsage("other", "HIRE_SEARCH", NOW, { pdlRecords: 10 });
  db.addUser("p1", "PRO");
  const source = new FakeSource();
  await search(source, "p1");
  assert.deepEqual(source.sizes, [2], "only 20% over budget is left");
  await assert.rejects(search(source, "p1"), (err: { code?: string; status?: number }) => {
    return err.code === "SEARCH_CAPACITY_REACHED" && err.status === 503;
  });
});

test("the budget counts provider records, not credits", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUsage("other", "HIRE_SEARCH", NOW, { credits: 40, pdlRecords: 0 }); // stored-results people: free for the budget
  await search(new FakeSource());
  db.addUsage("other", "HIRE_SEARCH", new Date(Date.UTC(2026, 4, 20)), { pdlRecords: 99 }); // last month
  await search(new FakeSource(), "u9");
});

// ─── races ───────────────────────────────────────────────────────────────────

test("simultaneous unlocks never spend more credits than the user has", async () => {
  addPeople("ja", "u1", 5);
  addPeople("jb", "u1", 5);
  const results = await Promise.allSettled([credits.unlockForUser("u1", "ja", NOW), credits.unlockForUser("u1", "jb", NOW)]);
  assert.equal(unlockedBy("u1").length, 3, "free has 3 credits");
  assert.equal(creditsSpent("u1"), 3);
  assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"], "the second one finds no credits left");
});

test("two simultaneous fresh searches by one free user unlock 3 people in total", async () => {
  const source = new FakeSource();
  await Promise.allSettled([search(source), search(source)]);
  assert.equal(unlockedBy("u1").length, 3);
  assert.equal(creditsSpent("u1"), 3);
});

// ─── usage numbers, copy and the migration ───────────────────────────────────

test("getUsage: credits are monthly for both plans; Compare is unlimited for pro", async () => {
  await search(new FakeSource());
  assert.deepEqual(await credits.getUsage("u1", NOW), {
    plan: "FREE",
    credits: { used: 3, limit: 3, remaining: 0, resetsAt: "2026-07-01T00:00:00.000Z" },
    compare: { used: 0, limit: 1, resetsAt: "2026-07-01T00:00:00.000Z" },
  });
  db.addUser("p1", "PRO");
  db.addUsage("p1", "COMPARE", NOW);
  assert.deepEqual(await credits.getUsage("p1", NOW), {
    plan: "PRO",
    credits: { used: 0, limit: 50, remaining: 50, resetsAt: "2026-07-01T00:00:00.000Z" },
    compare: { used: 1, limit: null, resetsAt: null },
  });
});

test("getErrorMessage covers the new codes", () => {
  assert.match(getErrorMessage("FREE_SEARCHES_PAUSED"), /Free searches are full this month. Upgrade to Pro or try again next month./);
  assert.match(getErrorMessage("SEARCH_CAPACITY_REACHED"), /temporarily unavailable. Please try again later./);
  const hire = new ApiError(403, "PLAN_LIMIT_REACHED", "x", { feature: "hire_search", plan: "FREE", limit: 3, used: 3, resetsAt: "2026-07-01T00:00:00.000Z" });
  assert.equal(getErrorMessage(hire), "You've used this month's credits. They reset on Jul 1.");
  const compare = new ApiError(403, "PLAN_LIMIT_REACHED", "x", { feature: "compare", plan: "FREE", limit: 1, used: 1, resetsAt: "2026-07-01T00:00:00.000Z" });
  assert.match(getErrorMessage(compare), /this month's Compare. It resets on Jul 1/);
  assert.match(getErrorMessage("CANDIDATE_LOCKED"), /Unlock this person/);
});

test("panel copy: credits line and Compare line", () => {
  assert.equal(creditsBeforeSearchLine({ used: 0, limit: 3, remaining: 3, resetsAt: "2026-07-01T00:00:00.000Z" }), "Uses up to 3 credits · 3 left this month");
  assert.equal(creditsBeforeSearchLine({ used: 0, limit: 50, remaining: 50, resetsAt: "2026-07-01T00:00:00.000Z" }), "Uses up to 5 credits · 50 left this month");
  assert.equal(compareLine({ used: 0, limit: 1, resetsAt: "2026-07-01T00:00:00.000Z" }), "1 Compare per month");
  assert.equal(compareLine({ used: 1, limit: 1, resetsAt: "2026-07-01T00:00:00.000Z" }), "Compare used · resets Jul 1");
  assert.equal(compareLine({ used: 4, limit: null, resetsAt: null }), null);
});

test("the migration backfills credits from the old column and creates unlocks for visible people", () => {
  const dir = readdirSync("prisma/migrations").find((name) => name.endsWith("monthly_credits_and_unlocks"))!;
  const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8");
  assert.match(sql, /RENAME COLUMN "creditsUsed" TO "pdlRecords"/);
  assert.match(sql, /UPDATE "usage_events" SET "credits" = "pdlRecords" WHERE "kind" = 'HIRE_SEARCH'/);
  assert.match(sql, /INSERT INTO "candidate_unlocks"[\s\S]*c\."hidden" = false[\s\S]*ON CONFLICT[\s\S]*DO NOTHING/);
});
