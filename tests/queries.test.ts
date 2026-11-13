import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError, apiFetch, getErrorMessage, isAbortError, redirectIfAuthExpired } from "@/lib/apiClient";
import { withVote } from "@/lib/helpers";
import { queryKeys } from "@/lib/queries/keys";
import { MAX_RETRIES, retryDelay, shouldRetry } from "@/lib/queries/retry";
import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_MS,
  TROUBLE_AFTER_FAILURES,
  hireSearchRefetchInterval,
  isHavingTrouble,
  isoToMs,
  nextFailureCount,
  pollingExpired,
  type HireSearchSummary,
} from "@/lib/queries/hireSearchPolling";
import { handleGlobalError } from "@/lib/queries/globalError";
import { handle } from "@/server/http";
import { RateLimitedError } from "@/server/errors";
import { checkRateLimit } from "@/server/security/rateLimit";
import type { DBJob } from "@/types";

const env = process.env as Record<string, string | undefined>;
const realNodeEnv = env.NODE_ENV;
const realFetch = globalThis.fetch;
const realConsoleError = console.error;
const realWarn = console.warn;

afterEach(() => {
  env.NODE_ENV = realNodeEnv;
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
  console.warn = realWarn;
});

/* ── retry predicate ─────────────────────────────────────────────────────── */

test("shouldRetry never retries a 4xx, an abort, or a non-API error", () => {
  for (const status of [400, 401, 403, 404, 409, 429]) {
    assert.equal(shouldRetry(0, new ApiError(status, "X", "x")), false, String(status));
  }
  assert.equal(shouldRetry(0, new DOMException("aborted", "AbortError")), false);
  assert.equal(shouldRetry(0, new Error("boom")), false);
  assert.equal(shouldRetry(0, "nope"), false);
});

test("shouldRetry retries network failures and 5xx exactly twice", () => {
  for (const error of [new ApiError(0, "NETWORK", "x"), new ApiError(500, "INTERNAL", "x"), new ApiError(502, "UPSTREAM_ERROR", "x")]) {
    assert.equal(shouldRetry(0, error), true);
    assert.equal(shouldRetry(1, error), true);
    assert.equal(shouldRetry(MAX_RETRIES, error), false);
  }
});

test("retryDelay backs off exponentially up to a cap", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(retryDelay), [1000, 2000, 4000, 8000, 8000, 8000]);
});

/* ── hire search polling ─────────────────────────────────────────────────── */

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const summary = (searchStatus: HireSearchSummary["searchStatus"], startedMsAgo: number | null): HireSearchSummary => ({
  searchStatus,
  searchStartedAt: startedMsAgo === null ? null : iso(NOW - startedMsAgo),
  lastSearchedAt: null,
  nextSearchAllowedAt: null,
  candidateCount: 0,
  searchError: null,
});

test("refetchInterval polls every 3 s while RUNNING inside the window", () => {
  assert.equal(hireSearchRefetchInterval(summary("RUNNING", 5_000), NOW), POLL_INTERVAL_MS);
  assert.equal(hireSearchRefetchInterval(summary("RUNNING", POLL_WINDOW_MS - 1), NOW), POLL_INTERVAL_MS);
  // Started time not known yet (the claim is still being written): keep polling.
  assert.equal(hireSearchRefetchInterval(summary("RUNNING", null), NOW), POLL_INTERVAL_MS);
});

test("refetchInterval is off for DONE, FAILED, NOT_STARTED, no data, and past the window", () => {
  assert.equal(hireSearchRefetchInterval(summary("DONE", 5_000), NOW), false);
  assert.equal(hireSearchRefetchInterval(summary("FAILED", 5_000), NOW), false);
  assert.equal(hireSearchRefetchInterval(summary("NOT_STARTED", null), NOW), false);
  assert.equal(hireSearchRefetchInterval(undefined, NOW), false);
  assert.equal(hireSearchRefetchInterval(summary("RUNNING", POLL_WINDOW_MS), NOW), false);
  assert.equal(hireSearchRefetchInterval(summary("RUNNING", POLL_WINDOW_MS + 60_000), NOW), false);
});

test("Check again gives polling a fresh window", () => {
  const old = summary("RUNNING", POLL_WINDOW_MS + 60_000);
  assert.equal(pollingExpired(old, NOW, null), true);
  assert.equal(pollingExpired(old, NOW, NOW - 1_000), false);
  assert.equal(hireSearchRefetchInterval(old, NOW, NOW - 1_000), POLL_INTERVAL_MS);
  assert.equal(hireSearchRefetchInterval(old, NOW + POLL_WINDOW_MS, NOW - 1_000), false);
});

test("isoToMs reads our UTC timestamps without Date parsing and rejects anything else", () => {
  assert.equal(isoToMs("2026-11-05T12:00:00.000Z"), NOW);
  assert.equal(isoToMs("2026-11-05T12:00:00Z"), NOW);
  assert.equal(isoToMs("2026-11-05"), null);
  assert.equal(isoToMs("garbage"), null);
  assert.equal(isoToMs(null), null);
});

test("trouble shows only after 3 failures in a row, and a success resets the count", () => {
  let count = 0;
  const seen: boolean[] = [];
  for (const event of ["error", "error", "success", "error", "error", "error", "error", "success"] as const) {
    count = nextFailureCount(count, event);
    seen.push(isHavingTrouble(count));
  }
  assert.deepEqual(seen, [false, false, false, false, false, true, true, false]);
  assert.equal(TROUBLE_AFTER_FAILURES, 3);
});

/* ── keys ────────────────────────────────────────────────────────────────── */

test("every query key starts with the user id, so keys differ per user", () => {
  const forUser = (id: string) => [
    queryKeys.profile(id),
    queryKeys.jobs(id),
    queryKeys.hireSearch(id, "j1"),
    queryKeys.match(id, "c1"),
  ];
  const a = forUser("userA");
  const b = forUser("userB");
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i].slice(0, 2), ["user", "userA"]);
    assert.notDeepEqual(a[i], b[i]);
  }
  assert.notDeepEqual(queryKeys.hireSearch("u", "j1"), queryKeys.hireSearch("u", "j2"));
});

/* ── optimistic vote ─────────────────────────────────────────────────────── */

test("withVote changes only the voted candidate of the voted job", () => {
  const candidate = (id: string) => ({ id, jobId: "j1", votes: [] }) as unknown as DBJob["candidates"][number];
  const jobs = [
    { id: "j1", candidates: [candidate("c1"), candidate("c2")] },
    { id: "j2", candidates: [candidate("c1")] },
  ] as unknown as DBJob[];
  const next = withVote(jobs, "u1", { jobId: "j1", candidateId: "c1", type: "YES" });
  assert.equal(next[0].candidates[0].votes.length, 1);
  assert.equal(next[0].candidates[1].votes.length, 0);
  assert.equal(next[1], jobs[1]);
  assert.equal(jobs[0].candidates[0].votes.length, 0, "the original list is not mutated");
});

/* ── Retry-After ─────────────────────────────────────────────────────────── */

test("handle sends Retry-After and details.retryAfterSeconds for a rate limit, and the client shows the wait", async () => {
  console.error = () => undefined;
  const res = await handle(async () => {
    throw new RateLimitedError("Too many requests", undefined, "RATE_LIMITED", 42);
  })();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");
  const body = (await res.clone().json()) as { code: string; details: { retryAfterSeconds: number }; requestId: string };
  assert.equal(body.code, "RATE_LIMITED");
  assert.equal(body.details.retryAfterSeconds, 42);

  globalThis.fetch = (async () => res) as typeof fetch;
  env.NODE_ENV = "production";
  await assert.rejects(
    () => apiFetch("/api/parse-job"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.retryAfterSeconds, 42);
      assert.match(getErrorMessage(err), /42 seconds/);
      return true;
    },
  );
});

test("a rate limit without a wait time has no Retry-After header", async () => {
  console.error = () => undefined;
  const res = await handle(async () => {
    throw new RateLimitedError("Too many requests");
  })();
  assert.equal(res.headers.get("Retry-After"), null);
});

test("checkRateLimit says how long until the next slot frees up", async () => {
  const options = { scope: `test-${Date.now()}`, limit: 1, windowMs: 60_000 };
  const first = await checkRateLimit("ip-1", options);
  assert.deepEqual(first, { limited: false, retryAfterSeconds: 0 });
  const second = await checkRateLimit("ip-1", options);
  assert.equal(second.limited, true);
  assert.ok(second.retryAfterSeconds >= 1 && second.retryAfterSeconds <= 60);
});

/* ── Prisma errors in handle() ───────────────────────────────────────────── */

test("handle maps an unhandled Prisma P2002 to 409 and P2025 to 404", async () => {
  console.error = () => undefined;
  const conflict = await handle(async () => {
    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  })();
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as { code: string }).code, "CONFLICT");

  const missing = await handle(async () => {
    throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
  })();
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { code: string }).code, "NOT_FOUND");
});

/* ── abort, redirect and global handler ──────────────────────────────────── */

test("an aborted request stays an AbortError and is never reported as NETWORK", async () => {
  const controller = new AbortController();
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  const pending = apiFetch("/api/jobs", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (err: unknown) => isAbortError(err) && !(err instanceof ApiError));
});

test("an abort while the body is being read is also not a NETWORK error", async () => {
  const controller = new AbortController();
  globalThis.fetch = (async () => {
    const response = new Response("{}", { status: 200 });
    response.text = async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    };
    return response;
  }) as typeof fetch;
  await assert.rejects(
    () => apiFetch("/api/jobs", { signal: controller.signal }),
    (err: unknown) => isAbortError(err) && !(err instanceof ApiError),
  );
});

test("redirectIfAuthExpired is a no-op outside the browser and ignores other errors", () => {
  assert.equal(redirectIfAuthExpired(new ApiError(401, "UNAUTHORIZED", "x")), false, "no window in this runner");
  assert.equal(redirectIfAuthExpired(new ApiError(500, "INTERNAL", "x")), false);
});

test("the global handler only logs the requestId in development, and never throws", () => {
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  const error = new ApiError(500, "INTERNAL", "x", undefined, "ab12cd34");
  env.NODE_ENV = "production";
  handleGlobalError(error);
  assert.equal(warnings.length, 0);
  env.NODE_ENV = "development";
  handleGlobalError(error);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("ab12cd34"));
  assert.doesNotThrow(() => handleGlobalError(new Error("not an ApiError")));
});
