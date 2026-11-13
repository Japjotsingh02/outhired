import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// The repository imports the Prisma client wrapper, which needs a connection string at
// import time (it never connects until a query runs). Queries are stubbed below.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

type Repo = typeof import("@/server/repositories/parsedJob.repo");
type ParseResult = Parameters<Repo["cacheParsedJob"]>[1];

let getFreshCachedJob: Repo["getFreshCachedJob"];
let cacheParsedJob: Repo["cacheParsedJob"];
let delegate: Record<string, unknown>;
let original: { findUnique: unknown; upsert: unknown };

before(async () => {
  const { prisma } = await import("@/server/db");
  ({ getFreshCachedJob, cacheParsedJob } = await import("@/server/repositories/parsedJob.repo"));
  delegate = prisma.parsedJob as unknown as Record<string, unknown>;
  original = { findUnique: delegate.findUnique, upsert: delegate.upsert };
});

const originalEnv = {
  PARSE_CACHE_DISABLED: process.env.PARSE_CACHE_DISABLED,
  NODE_ENV: process.env.NODE_ENV,
};
const originalWarn = console.warn;

const FRESH_DATA = { role: "Engineer" };
let findCalls = 0;
let upsertCalls = 0;
let warnings: string[] = [];

function setEnv(name: "PARSE_CACHE_DISABLED" | "NODE_ENV", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else (process.env as Record<string, string>)[name] = value;
}

beforeEach(() => {
  findCalls = 0;
  upsertCalls = 0;
  warnings = [];
  delegate.findUnique = async () => {
    findCalls++;
    return { url: "u", data: FRESH_DATA, parsedAt: new Date() };
  };
  delegate.upsert = async () => {
    upsertCalls++;
    return {};
  };
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };
});

afterEach(() => {
  delegate.findUnique = original.findUnique;
  delegate.upsert = original.upsert;
  console.warn = originalWarn;
  setEnv("PARSE_CACHE_DISABLED", originalEnv.PARSE_CACHE_DISABLED);
  setEnv("NODE_ENV", originalEnv.NODE_ENV);
});

const data = { role: "Engineer" } as unknown as ParseResult;

// Runs first: the warning is once per process, so later disabled calls must not repeat it.
test("disabled: warns exactly once per process, not on every call", async () => {
  setEnv("PARSE_CACHE_DISABLED", "true");
  setEnv("NODE_ENV", "test");
  await getFreshCachedJob("https://example.test/a");
  await getFreshCachedJob("https://example.test/b");
  await cacheParsedJob("https://example.test/a", data);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Parse cache disabled via PARSE_CACHE_DISABLED/);
});

test("disabled outside production: read is a miss and write does nothing", async () => {
  setEnv("PARSE_CACHE_DISABLED", "true");
  setEnv("NODE_ENV", "test");
  assert.equal(await getFreshCachedJob("https://example.test/a"), null);
  await cacheParsedJob("https://example.test/a", data);
  assert.equal(findCalls, 0);
  assert.equal(upsertCalls, 0);
});

test("variable unset: cache behaves as before", async () => {
  setEnv("PARSE_CACHE_DISABLED", undefined);
  setEnv("NODE_ENV", "test");
  assert.deepEqual(await getFreshCachedJob("https://example.test/a"), FRESH_DATA);
  await cacheParsedJob("https://example.test/a", data);
  assert.equal(findCalls, 1);
  assert.equal(upsertCalls, 1);
});

test("production ignores the variable: cache still works", async () => {
  setEnv("PARSE_CACHE_DISABLED", "true");
  setEnv("NODE_ENV", "production");
  assert.deepEqual(await getFreshCachedJob("https://example.test/a"), FRESH_DATA);
  await cacheParsedJob("https://example.test/a", data);
  assert.equal(findCalls, 1);
  assert.equal(upsertCalls, 1);
});
