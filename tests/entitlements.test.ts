import "./helpers/testEnv";
import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "./helpers/fakeDb";
import { getErrorMessage, ApiError } from "@/lib/apiClient";
import type { HireRecord, HireSource, SearchInput, SearchOutcome } from "@/server/services/hireSearch/types";

type Service = typeof import("@/server/services/hireSearch");
type Billing = typeof import("@/server/services/billing/entitlements");

let service: Service;
let billing: Billing;
let db: ReturnType<typeof createFakeDb>;
let restore: () => void;

const ENV_KEYS = ["HIRE_SEARCH_ALLOWED_EMAILS", "HIRE_SEARCH_DAILY_LIMIT_PER_USER", "PDL_MONTHLY_CREDIT_BUDGET", "HIRE_CACHE_DISABLED", "NODE_ENV"] as const;
const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  service = await import("@/server/services/hireSearch");
  billing = await import("@/server/services/billing/entitlements");
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
const DAY = 86_400_000;

const record = (id: string): HireRecord => ({
  externalId: id,
  fullName: `Person ${id}`,
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
  confidence: "MEDIUM",
});

class FakeSource implements HireSource {
  kind = "PDL" as const;
  calls = 0;
  failWith: Error | null = null;
  fingerprint(input: SearchInput) {
    return `fp:${input.role}`;
  }
  async search(): Promise<SearchOutcome> {
    this.calls++;
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    return { records: [record(`r${this.calls}`), record(`s${this.calls}`)], total: 2, skippedInternal: 0, creditsUsed: 2 };
  }
}

/** A search for a fresh job (own cache key, so it always reaches the provider). */
let jobSeq = 0;
function search(source: FakeSource, userId = "u1", now = NOW) {
  const id = `job${++jobSeq}`;
  db.addJob({ id, userId, role: `Role ${id}` });
  return service.startHireSearchForJob({ id: userId, email: `${userId}@example.test` }, id, {}, { source, now: () => now });
}
const blocked = (code: string) => (err: { code?: string }) => err.code === code;
const hireEvents = () => [...db.usageEvents.values()].filter((e) => e.kind === "HIRE_SEARCH");

// ─── hire search limits ──────────────────────────────────────────────────────

test("free: the first search works, the second is blocked", async () => {
  const source = new FakeSource();
  await search(source);
  await assert.rejects(search(source), blocked("PLAN_LIMIT_REACHED"));
  assert.equal(source.calls, 1);
  assert.equal(hireEvents().length, 1);
});

test("the limit error carries feature, plan, limit, used and resetsAt", async () => {
  await search(new FakeSource());
  await assert.rejects(search(new FakeSource()), (err: { details?: unknown }) => {
    assert.deepEqual(err.details, { feature: "hire_search", plan: "FREE", limit: 1, used: 1, resetsAt: null });
    return true;
  });
});

test("pro: 10 searches work, the 11th is blocked and resets next month", async () => {
  db.addUser("u1", "PRO");
  const source = new FakeSource();
  for (let i = 0; i < 10; i++) await search(source);
  await assert.rejects(search(source), (err: { code?: string; details?: { resetsAt: string } }) => {
    assert.equal(err.code, "PLAN_LIMIT_REACHED");
    assert.equal(err.details?.resetsAt, "2026-07-01T00:00:00.000Z");
    return true;
  });
  assert.equal(source.calls, 10);
});

test("pro: a new UTC month starts a fresh count", async () => {
  db.addUser("u1", "PRO");
  const source = new FakeSource();
  for (let i = 0; i < 10; i++) await search(source);
  await assert.rejects(search(source), blocked("PLAN_LIMIT_REACHED"));
  await search(source, "u1", new Date(NOW.getTime() + 20 * DAY)); // 2026-07-05
  assert.equal(source.calls, 11);
});

test("an expired pro plan counts as free", async () => {
  db.addUser("u1", "PRO", new Date(NOW.getTime() - DAY));
  const source = new FakeSource();
  await search(source);
  await assert.rejects(search(source), blocked("PLAN_LIMIT_REACHED"));
});

test("a cache hit uses no search and creates no usage event, even for a free user who is out", async () => {
  const source = new FakeSource();
  db.addJob({ id: "first", userId: "u2", role: "Same Role" });
  await service.startHireSearchForJob({ id: "u2", email: "u2@example.test" }, "first", {}, { source, now: () => NOW });
  assert.equal(source.calls, 1);
  db.addJob({ id: "second", userId: "u1", role: "Same Role" });
  await service.startHireSearchForJob({ id: "u1", email: "u1@example.test" }, "second", {}, { source, now: () => NOW });
  assert.equal(source.calls, 1, "served from the cache");
  assert.equal(hireEvents().filter((e) => e.userId === "u1").length, 0);
  // The free search is still there for a job nobody has searched.
  await search(source, "u1");
  assert.equal(source.calls, 2);
});

test("a failed provider call refunds the search", async () => {
  const source = new FakeSource();
  source.failWith = new Error("boom");
  await assert.rejects(search(source), /boom/);
  assert.equal(hireEvents().length, 0);
  source.failWith = null;
  await search(source); // the free search is still available
  assert.equal(hireEvents().length, 1);
});

test("a successful search records the credits it used", async () => {
  await search(new FakeSource());
  assert.equal(hireEvents()[0].creditsUsed, 2);
});

test("budget reached: free is paused, pro keeps going until 120%, then capacity is reached", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUsage("other", "HIRE_SEARCH", NOW, 10); // 100%
  db.addUser("p1", "PRO");
  const source = new FakeSource();

  await assert.rejects(search(source, "f1"), blocked("FREE_SEARCHES_PAUSED"));
  assert.equal(source.calls, 0);

  await search(source, "p1"); // pro is still allowed at 100% and spends 2 credits (now 12 = 120%)
  assert.equal(source.calls, 1);
  await assert.rejects(search(source, "p1"), (err: { code?: string; status?: number }) => {
    return err.code === "SEARCH_CAPACITY_REACHED" && err.status === 503;
  });
  assert.equal(source.calls, 1);
});

test("last month's credits do not count against this month's budget", async () => {
  process.env.PDL_MONTHLY_CREDIT_BUDGET = "10";
  db.addUsage("other", "HIRE_SEARCH", new Date(Date.UTC(2026, 4, 20)), 10);
  await search(new FakeSource());
});

test("two simultaneous searches by a free user: exactly one succeeds", async () => {
  const source = new FakeSource();
  const results = await Promise.allSettled([search(source), search(source)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(source.calls, 1);
  assert.equal(hireEvents().length, 1);
});

// ─── compare ─────────────────────────────────────────────────────────────────

test("compare: free gets one, then is blocked", async () => {
  await billing.assertCanCompare("u1", NOW);
  await assert.rejects(billing.assertCanCompare("u1", NOW), (err: { code?: string; details?: { feature: string } }) => {
    return err.code === "PLAN_LIMIT_REACHED" && err.details?.feature === "compare";
  });
});

test("compare: a refunded use is available again", async () => {
  const reservation = await billing.assertCanCompare("u1", NOW);
  await billing.refundUsage(reservation);
  await billing.assertCanCompare("u1", NOW);
});

test("compare: pro is allowed 50 a month and blocked at the 51st", async () => {
  db.addUser("u1", "PRO");
  for (let i = 0; i < 50; i++) await billing.assertCanCompare("u1", NOW);
  await assert.rejects(billing.assertCanCompare("u1", NOW), blocked("PLAN_LIMIT_REACHED"));
  await billing.assertCanCompare("u1", new Date(NOW.getTime() + 20 * DAY));
});

// ─── usage summary and messages ──────────────────────────────────────────────

test("getUsage: free is lifetime, pro is monthly, unlimited is null and the fair-use cap is hidden", async () => {
  await search(new FakeSource());
  assert.deepEqual(await billing.getUsage("u1", NOW), {
    plan: "FREE",
    hireSearch: { used: 1, limit: 1, resetsAt: null },
    compare: { used: 0, limit: 1, resetsAt: null },
  });
  db.addUser("p1", "PRO");
  db.addUsage("p1", "COMPARE", NOW);
  assert.deepEqual(await billing.getUsage("p1", NOW), {
    plan: "PRO",
    hireSearch: { used: 0, limit: 10, resetsAt: "2026-07-01T00:00:00.000Z" },
    compare: { used: 1, limit: null, resetsAt: null },
  });
});

test("getErrorMessage covers the new codes, with details for the plan limit", () => {
  assert.match(getErrorMessage("FREE_SEARCHES_PAUSED"), /Free searches are full this month. Upgrade to Pro or try again next month./);
  assert.match(getErrorMessage("SEARCH_CAPACITY_REACHED"), /temporarily unavailable. Please try again later./);
  assert.match(getErrorMessage("PLAN_LIMIT_REACHED"), /Upgrade to Pro/);
  const pro = new ApiError(403, "PLAN_LIMIT_REACHED", "x", { feature: "hire_search", plan: "PRO", limit: 10, used: 10, resetsAt: "2026-07-01T00:00:00.000Z" });
  assert.match(getErrorMessage(pro), /resets on Jul 1/);
  const compare = new ApiError(403, "PLAN_LIMIT_REACHED", "x", { feature: "compare", plan: "FREE", limit: 1, used: 1, resetsAt: null });
  assert.match(getErrorMessage(compare), /free Compare/);
});
