import "./helpers/testEnv";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApifyError, createApifyClient } from "@/server/clients/apify";

const TOKEN = "apify_api_SECRET_TOKEN_123";

interface Call {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const runBody = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: "run1",
    status: "RUNNING",
    defaultDatasetId: "ds1",
    startedAt: "2026-11-03T10:00:00.000Z",
    finishedAt: null,
    usageTotalUsd: 0.0123,
    ...overrides,
  },
});

const client = (responses: Array<Response | Error>) => {
  const f = fakeFetch(responses);
  return { api: createApifyClient({ token: TOKEN, fetchImpl: f.impl, retryDelayMs: 0 }), calls: f.calls };
};

// Capture everything the client might log.
const logged: string[] = [];
const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
for (const level of ["log", "info", "warn", "error"] as const) {
  console[level] = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
}
afterEach(() => {
  logged.length = 0;
});
process.on("exit", () => Object.assign(console, original));

test("startRun sends the token in a Bearer header, never the URL, with spend and time caps", async () => {
  const { api, calls } = client([json(runBody(), 201)]);
  const run = await api.startRun("b2bsearch~new-hires-finder", { companyDomains: ["stripe.com"] }, {
    maxTotalChargeUsd: 0.5,
    timeoutSecs: 300,
  });
  assert.deepEqual(
    { runId: run.runId, datasetId: run.datasetId, status: run.status },
    { runId: "run1", datasetId: "ds1", status: "RUNNING" },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!calls[0].url.includes(TOKEN));
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/v2/actors/b2bsearch~new-hires-finder/runs");
  assert.equal(url.searchParams.get("maxTotalChargeUsd"), "0.5");
  assert.equal(url.searchParams.get("timeout"), "300");
  assert.deepEqual(JSON.parse(calls[0].body!), { companyDomains: ["stripe.com"] });
});

test("getRun, abortRun and getDatasetItems use the right endpoints", async () => {
  const { api, calls } = client([
    json(runBody({ status: "SUCCEEDED", finishedAt: "2026-11-03T10:01:00.000Z" })),
    json(runBody({ status: "ABORTED" })),
    json([{ a: 1 }, { b: 2 }]),
  ]);
  const run = await api.getRun("run1");
  assert.equal(run.status, "SUCCEEDED");
  assert.equal(run.usageTotalUsd, 0.0123);
  await api.abortRun("run1");
  const items = await api.getDatasetItems("ds1", { limit: 60 });
  assert.equal(items.length, 2);

  assert.equal(new URL(calls[0].url).pathname, "/v2/actor-runs/run1");
  assert.equal(calls[1].method, "POST");
  assert.equal(new URL(calls[1].url).pathname, "/v2/actor-runs/run1/abort");
  const itemsUrl = new URL(calls[2].url);
  assert.equal(itemsUrl.pathname, "/v2/datasets/ds1/items");
  assert.equal(itemsUrl.searchParams.get("limit"), "60");
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
});

test("retries once after a 5xx and then succeeds", async () => {
  const { api, calls } = client([new Response("boom", { status: 503 }), json(runBody())]);
  const run = await api.getRun("run1");
  assert.equal(run.runId, "run1");
  assert.equal(calls.length, 2);
});

test("retries once after a 429", async () => {
  const { api, calls } = client([new Response("slow down", { status: 429 }), json(runBody())]);
  await api.getRun("run1");
  assert.equal(calls.length, 2);
});

test("retries once after a network error and then succeeds", async () => {
  const { api, calls } = client([new TypeError("fetch failed"), json(runBody())]);
  await api.getRun("run1");
  assert.equal(calls.length, 2);
});

test("gives up after the single retry", async () => {
  const { api, calls } = client([new Response("x", { status: 500 }), new Response("x", { status: 502 })]);
  await assert.rejects(() => api.getRun("run1"), (err: unknown) => err instanceof ApifyError && err.httpStatus === 502);
  assert.equal(calls.length, 2);
});

test("startRun is never retried, whatever the failure", async () => {
  const start = (api: ReturnType<typeof client>["api"]) =>
    api.startRun("b2bsearch~new-hires-finder", {}, { maxTotalChargeUsd: 0.5, timeoutSecs: 300 });
  const cases: Array<[string, Response | Error]> = [
    ["503", new Response("x", { status: 503 })],
    ["429", new Response("x", { status: 429 })],
    ["network", new TypeError("fetch failed")],
  ];
  for (const [label, failure] of cases) {
    // A success is queued second: if the client retried, startRun would resolve.
    const { api, calls } = client([failure, json(runBody(), 201)]);
    await assert.rejects(() => start(api), ApifyError, label);
    assert.equal(calls.length, 1, label);
  }
});

test("abortRun and getDatasetItems retry once on 5xx", async () => {
  const abort = client([new Response("x", { status: 502 }), json(runBody({ status: "ABORTED" }))]);
  await abort.api.abortRun("run1");
  assert.equal(abort.calls.length, 2);
  const items = client([new Response("x", { status: 500 }), json([{ a: 1 }])]);
  assert.equal((await items.api.getDatasetItems("ds1", { limit: 5 })).length, 1);
  assert.equal(items.calls.length, 2);
});

test("does not retry 4xx responses", async () => {
  for (const status of [400, 401, 403, 404]) {
    const { api, calls } = client([new Response("nope", { status })]);
    await assert.rejects(() => api.getRun("run1"), (err: unknown) => err instanceof ApifyError && err.httpStatus === status);
    assert.equal(calls.length, 1, `status ${status}`);
  }
});

test("rejects responses with an unexpected shape", async () => {
  await assert.rejects(() => client([json({ data: { id: 5 } })]).api.getRun("run1"), ApifyError);
  await assert.rejects(() => client([json({ nope: true })]).api.getRun("run1"), ApifyError);
  await assert.rejects(() => client([json({ items: [] })]).api.getDatasetItems("ds1", { limit: 5 }), ApifyError);
  await assert.rejects(
    () => client([new Response("<html>", { status: 200 })]).api.getRun("run1"),
    ApifyError,
  );
});

test("rejects ids that could change the request path", async () => {
  const { api, calls } = client([]);
  await assert.rejects(() => api.getRun("../../me"), ApifyError);
  await assert.rejects(() => api.abortRun("run1/abort"), ApifyError);
  await assert.rejects(() => api.getDatasetItems("ds?x=1", { limit: 1 }), ApifyError);
  await assert.rejects(() => api.startRun("a/b", {}, { maxTotalChargeUsd: 1, timeoutSecs: 10 }), ApifyError);
  assert.equal(calls.length, 0);
});

test("neither errors nor logs ever contain the token or response rows", async () => {
  const secretRow = { fullName: "Private Person", linkedinUrl: "https://www.linkedin.com/in/private" };
  const failures = (calls: Array<() => Promise<unknown>>) =>
    Promise.all(
      calls.map((call) =>
        call().then(
          () => "",
          (err: unknown) => `${(err as Error).message} ${(err as Error).stack ?? ""}`,
        ),
      ),
    );
  const errors = await failures([
    () => client([new TypeError(`connect failed for ${TOKEN}`), new TypeError(`again ${TOKEN}`)]).api.getRun("run1"),
    () => client([new Response(JSON.stringify({ error: TOKEN }), { status: 401 })]).api.getRun("run1"),
    () => client([json([secretRow], 200)]).api.getRun("run1"),
  ]);
  assert.equal(errors.length, 3);
  const everything = [...errors, ...logged].join("\n");
  assert.ok(!everything.includes(TOKEN));
  assert.ok(!everything.includes("Private Person"));
  assert.ok(!everything.includes("linkedin.com/in/private"));
});
