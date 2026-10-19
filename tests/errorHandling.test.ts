import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ApiError,
  apiFetch,
  apiFetchWithStatus,
  fieldErrorsFromApiError,
  getErrorMessage,
  isAuthExpired,
} from "@/lib/apiClient";
import { applyVote } from "@/lib/helpers";
import { handle } from "@/server/http";
import { BadRequestError, NotFoundError, RateLimitedError } from "@/server/errors";

const env = process.env as Record<string, string | undefined>;
const realNodeEnv = env.NODE_ENV;
const realFetch = globalThis.fetch;
const realConsoleError = console.error;

afterEach(() => {
  env.NODE_ENV = realNodeEnv;
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

function stubFetch(response: Response | Error) {
  globalThis.fetch = (async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/* ── getErrorMessage ─────────────────────────────────────────────────────── */

test("getErrorMessage maps every known code to a message that says what to do", () => {
  const codes: Array<[string, RegExp]> = [
    ["UNAUTHORIZED", /sign in again/i],
    ["FORBIDDEN", /access/i],
    ["FEATURE_RESTRICTED", /private beta/i],
    ["PROFILE_INCOMPLETE", /profile/i],
    ["RATE_LIMITED", /wait/i],
    ["NOT_FOUND", /couldn't find/i],
    ["VALIDATION", /fixing/i],
    ["BAD_REQUEST", /fixing/i],
    ["PROVIDER_FAILED", /try again/i],
    ["UPSTREAM_ERROR", /try again/i],
    ["TIMEOUT", /too long/i],
    ["LIMIT_REACHED", /limit/i],
    ["DOMAIN_NOT_FOUND", /website/i],
    ["SEARCH_TOO_SOON", /later/i],
    ["NETWORK", /connection/i],
  ];
  env.NODE_ENV = "production";
  for (const [code, pattern] of codes) {
    assert.match(getErrorMessage(code), pattern, code);
    assert.match(getErrorMessage(new ApiError(500, code, "technical text")), pattern, code);
  }
});

test("getErrorMessage falls back for unknown codes and non-API errors", () => {
  env.NODE_ENV = "production";
  assert.match(getErrorMessage("WHATEVER"), /something went wrong/i);
  assert.match(getErrorMessage(new Error("boom")), /something went wrong/i);
  assert.match(getErrorMessage(null), /something went wrong/i);
});

test("getErrorMessage puts the wait time in a rate-limit message", () => {
  env.NODE_ENV = "production";
  assert.match(getErrorMessage(new ApiError(429, "RATE_LIMITED", "x", undefined, undefined, 30)), /30 seconds/);
  assert.match(getErrorMessage(new ApiError(429, "RATE_LIMITED", "x", undefined, undefined, 300)), /5 minutes/);
  assert.match(getErrorMessage(new ApiError(429, "RATE_LIMITED", "x")), /a minute/);
});

test("getErrorMessage adds the technical message and requestId in development only", () => {
  const err = new ApiError(502, "UPSTREAM_ERROR", "Apify returned HTTP 500", undefined, "ab12cd34");
  env.NODE_ENV = "development";
  const dev = getErrorMessage(err);
  assert.ok(dev.includes("Apify returned HTTP 500"));
  assert.ok(dev.includes("ab12cd34"));
  env.NODE_ENV = "production";
  const prod = getErrorMessage(err);
  assert.ok(!prod.includes("Apify"));
  assert.ok(!prod.includes("ab12cd34"));
});

/* ── apiFetch ────────────────────────────────────────────────────────────── */

test("apiFetch returns parsed JSON on success and the status via apiFetchWithStatus", async () => {
  stubFetch(json({ id: "j1" }, 201));
  assert.deepEqual(await apiFetch("/api/jobs"), { id: "j1" });
  stubFetch(json({ id: "j1" }, 200));
  assert.deepEqual(await apiFetchWithStatus("/api/jobs"), { status: 200, data: { id: "j1" } });
});

test("apiFetch turns a JSON error body into an ApiError with code, details and requestId", async () => {
  stubFetch(
    json(
      { error: "Invalid request", code: "VALIDATION", details: { issues: [{ path: "role", message: "Required" }] }, requestId: "ab12cd34" },
      400,
    ),
  );
  await assert.rejects(
    () => apiFetch("/api/jobs"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "VALIDATION");
      assert.equal(err.requestId, "ab12cd34");
      assert.deepEqual(fieldErrorsFromApiError(err), { role: "Required" });
      return true;
    },
  );
});

test("apiFetch handles an HTML error body by choosing the code from the status", async () => {
  const cases: Array<[number, string]> = [
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_ERROR"],
    [504, "TIMEOUT"],
  ];
  for (const [status, code] of cases) {
    stubFetch(new Response("<html><body>Bad gateway</body></html>", { status, headers: { "Content-Type": "text/html" } }));
    await assert.rejects(
      () => apiFetch("/api/jobs"),
      (err: unknown) => err instanceof ApiError && err.status === status && err.code === code && !err.message.includes("<html"),
      String(status),
    );
  }
});

test("apiFetch reports a network failure as code NETWORK", async () => {
  stubFetch(new TypeError("fetch failed"));
  await assert.rejects(
    () => apiFetch("/api/jobs"),
    (err: unknown) => err instanceof ApiError && err.code === "NETWORK" && err.status === 0,
  );
});

test("apiFetch rejects a success body that is not JSON, and accepts an empty one", async () => {
  stubFetch(new Response("<html>oops</html>", { status: 200 }));
  await assert.rejects(() => apiFetch("/api/jobs"), (err: unknown) => err instanceof ApiError && err.code === "BAD_RESPONSE");
  stubFetch(new Response(null, { status: 204 }));
  assert.equal(await apiFetch("/api/jobs"), undefined);
});

test("apiFetch reads Retry-After for rate limits and flags expired sessions", async () => {
  stubFetch(json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, { "Retry-After": "42" }));
  await assert.rejects(
    () => apiFetch("/api/jobs"),
    (err: unknown) => err instanceof ApiError && err.retryAfterSeconds === 42,
  );
  assert.equal(isAuthExpired(new ApiError(401, "UNAUTHORIZED", "x")), true);
  assert.equal(isAuthExpired(new ApiError(403, "FORBIDDEN", "x")), false);
});

test("apiFetch sends a JSON content type when there is a body", async () => {
  let seen: Headers | undefined;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return json({});
  }) as typeof fetch;
  await apiFetch("/api/jobs", { method: "POST", body: "{}" });
  assert.equal(seen?.get("Content-Type"), "application/json");
});

/* ── applyVote (optimistic votes) ────────────────────────────────────────── */

test("applyVote adds, switches and toggles off a vote like the server does", () => {
  const vote = (userId: string, type: "YES" | "NO") => ({ id: `${userId}${type}`, userId, candidateId: "c1", type });
  const others = [vote("u2", "NO")];
  const added = applyVote(others, "u1", "c1", "YES");
  assert.deepEqual(added.map((v) => [v.userId, v.type]), [["u2", "NO"], ["u1", "YES"]]);
  const switched = applyVote(added, "u1", "c1", "NO");
  assert.deepEqual(switched.filter((v) => v.userId === "u1").map((v) => v.type), ["NO"]);
  const removed = applyVote(added, "u1", "c1", "YES");
  assert.deepEqual(removed, others);
});

/* ── handle(): the server envelope ───────────────────────────────────────── */

async function failure(fn: () => Promise<Response>) {
  console.error = () => undefined;
  const res = await handle(fn)();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("handle returns { error, code, details?, requestId } for an AppError", async () => {
  const { status, body } = await failure(async () => {
    throw new NotFoundError("Job not found", { id: "j1" });
  });
  assert.equal(status, 404);
  assert.equal(body.error, "Job not found");
  assert.equal(body.code, "NOT_FOUND");
  assert.deepEqual(body.details, { id: "j1" });
  assert.match(String(body.requestId), /^[0-9a-f]{8}$/);
});

test("handle returns VALIDATION with details.issues for a ZodError", async () => {
  const { status, body } = await failure(async () => {
    z.object({ role: z.string() }).parse({});
    return new Response();
  });
  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION");
  const issues = (body.details as { issues: Array<{ path: string }> }).issues;
  assert.equal(issues[0].path, "role");
  assert.ok(Array.isArray(body.issues));
  assert.match(String(body.requestId), /^[0-9a-f]{8}$/);
});

test("handle hides everything about an unexpected error, and logs it with the same requestId", async () => {
  const logged: string[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  const res = await handle(async () => {
    throw new Error("password=hunter2 at /srv/app/secret.ts");
  })();
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(res.status, 500);
  assert.equal(body.code, "INTERNAL");
  assert.deepEqual(Object.keys(body).sort(), ["code", "error", "requestId"]);
  assert.ok(!JSON.stringify(body).includes("hunter2"));
  assert.ok(logged.some((line) => line.includes(String(body.requestId))));
});

test("handle keeps the code of rate-limit and bad-request errors", async () => {
  const limited = await failure(async () => {
    throw new RateLimitedError("Daily search limit reached", undefined, "LIMIT_REACHED");
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "LIMIT_REACHED");
  const bad = await failure(async () => {
    throw new BadRequestError("Invalid URL");
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "BAD_REQUEST");
});
