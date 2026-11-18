import "./helpers/testEnv";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PdlError, createPdlClient, getPdlClient } from "@/server/clients/pdl";
import { createPdlNewHiresSource } from "@/server/services/hireSearch/pdlNewHires";

const KEY = "pdl_SECRET_KEY_123";

const realError = console.error;
const realInfo = console.info;
const realKey = process.env.PDL_API_KEY;

let logs: string[] = [];
const capture = () => {
  logs = [];
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  console.info = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
};

afterEach(() => {
  console.error = realError;
  console.info = realInfo;
  if (realKey === undefined) delete process.env.PDL_API_KEY;
  else process.env.PDL_API_KEY = realKey;
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function clientWith(respond: (call: { url: string; init: RequestInit }) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { client: createPdlClient({ apiKey: KEY, fetchImpl }), calls };
}

const QUERY = { bool: { must: [{ term: { job_company_website: "northwind.example" } }] } };

// ─── request ─────────────────────────────────────────────────────────────────

test("sends one POST to the person search URL with the key in X-Api-Key and the query and size as JSON", async () => {
  capture();
  const { client, calls } = clientWith(() => json({ status: 200, data: [{ id: "p1" }], total: 5 }));
  const result = await client.searchPeople({ query: QUERY, size: 3 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.peopledatalabs.com/v5/person/search");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Api-Key"], KEY);
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { query: QUERY, size: 3 });
  assert.ok(calls[0].init.signal, "has a timeout signal");
  assert.deepEqual(result, { total: 5, records: [{ id: "p1" }] });
});

test("data_include is sent only when asked for", async () => {
  capture();
  const { client, calls } = clientWith(() => json({ status: 200, data: [], total: 0 }));
  await client.searchPeople({ query: QUERY, size: 1, dataInclude: ["id", "full_name"] });
  assert.equal(JSON.parse(String(calls[0].init.body)).data_include, "id,full_name");
});

// ─── status mapping ──────────────────────────────────────────────────────────

test("zero matches (404 not_found) is an empty result, not an error", async () => {
  capture();
  const { client } = clientWith(() => json({ status: 404, error: { type: "not_found", message: "No records were found" } }, 404));
  assert.deepEqual(await client.searchPeople({ query: QUERY, size: 5 }), { total: 0, records: [] });
});

test("zero matches (200 with total 0) is an empty result too", async () => {
  capture();
  const { client } = clientWith(() => json({ status: 200, data: [], total: 0 }));
  assert.deepEqual(await client.searchPeople({ query: QUERY, size: 5 }), { total: 0, records: [] });
});

test("402 is LIMIT_REACHED", async () => {
  capture();
  const { client } = clientWith(() => json({ status: 402, error: { type: "payment_required", message: "limit" } }, 402));
  await assert.rejects(
    () => client.searchPeople({ query: QUERY, size: 5 }),
    (err: { code?: string; status?: number }) => err.code === "LIMIT_REACHED" && err.status === 429,
  );
});

test("429 is RATE_LIMITED with Retry-After when PDL sends one, and without when it does not", async () => {
  capture();
  const withHeader = clientWith(() => json({ status: 429 }, 429, { "Retry-After": "17" }));
  await assert.rejects(
    () => withHeader.client.searchPeople({ query: QUERY, size: 5 }),
    (err: { code?: string; retryAfterSeconds?: number }) => err.code === "RATE_LIMITED" && err.retryAfterSeconds === 17,
  );
  const without = clientWith(() => json({ status: 429 }, 429));
  await assert.rejects(
    () => without.client.searchPeople({ query: QUERY, size: 5 }),
    (err: { code?: string; retryAfterSeconds?: number }) => err.code === "RATE_LIMITED" && err.retryAfterSeconds === undefined,
  );
});

test("401 logs that the key was rejected and fails as a provider error, without the key", async () => {
  capture();
  const { client } = clientWith(() => json({ status: 401, error: { type: "authentication_error", message: "bad key" } }, 401));
  await assert.rejects(
    () => client.searchPeople({ query: QUERY, size: 5 }),
    (err: unknown) => err instanceof PdlError && err.httpStatus === 401 && err.status === 502,
  );
  assert.ok(logs.some((line) => line.includes("PDL key rejected")));
  assert.ok(!logs.join("\n").includes(KEY));
});

test("400 logs PDL's own message about the query and fails as a provider error", async () => {
  capture();
  const { client } = clientWith(() =>
    json({ status: 400, error: { type: "invalid_request_error", message: "Unknown field in query: job_title_xyz" } }, 400),
  );
  await assert.rejects(
    () => client.searchPeople({ query: QUERY, size: 5 }),
    (err: unknown) => err instanceof PdlError && err.httpStatus === 400,
  );
  assert.ok(logs.some((line) => line.includes("Unknown field in query: job_title_xyz")));
});

test("5xx, a network failure and a bad body are provider errors", async () => {
  capture();
  const server = clientWith(() => json({ status: 500 }, 500));
  await assert.rejects(() => server.client.searchPeople({ query: QUERY, size: 5 }), (err: unknown) => err instanceof PdlError && err.httpStatus === 500);

  const down = createPdlClient({
    apiKey: KEY,
    fetchImpl: (async () => {
      throw new TypeError("connect ECONNREFUSED with secret detail");
    }) as typeof fetch,
  });
  await assert.rejects(() => down.searchPeople({ query: QUERY, size: 5 }), (err: unknown) => err instanceof PdlError && !/secret detail/.test(err.message));

  const html = clientWith(() => new Response("<html>oops</html>", { status: 200 }));
  await assert.rejects(() => html.client.searchPeople({ query: QUERY, size: 5 }), PdlError);

  const wrongShape = clientWith(() => json({ status: 200, data: "nope", total: "many" }));
  await assert.rejects(() => wrongShape.client.searchPeople({ query: QUERY, size: 5 }), PdlError);
});

// ─── no retry, no leaks ──────────────────────────────────────────────────────

test("a failed search is never retried (a retry could bill twice)", async () => {
  capture();
  for (const status of [429, 500, 502, 503]) {
    const { client, calls } = clientWith(() => json({ status }, status));
    await assert.rejects(() => client.searchPeople({ query: QUERY, size: 5 }));
    assert.equal(calls.length, 1, `HTTP ${status}`);
  }
  const lost = { calls: 0 };
  const dropped = createPdlClient({
    apiKey: KEY,
    fetchImpl: (async () => {
      lost.calls++;
      throw new TypeError("socket hang up");
    }) as typeof fetch,
  });
  await assert.rejects(() => dropped.searchPeople({ query: QUERY, size: 5 }));
  assert.equal(lost.calls, 1);
});

test("nothing personal or secret is logged, only status, total and counts", async () => {
  capture();
  const record = { id: "p1", full_name: "Ada Quill", linkedin_url: "linkedin.com/in/ada-quill-example", emails: [{ address: "ada@example.test" }] };
  const { client } = clientWith(() => json({ status: 200, data: [record], total: 42 }));
  await client.searchPeople({ query: QUERY, size: 1 });

  const source = createPdlNewHiresSource(() => client);
  await source.search({
    domain: "northwind.example",
    sinceMonth: "2026-06",
    untilMonth: "2026-09",
    role: "Product Manager",
    location: null,
    size: 1,
  });

  const text = logs.join("\n");
  assert.ok(text.includes("total=42"));
  for (const secret of ["Ada Quill", "ada-quill", "ada@example.test", KEY, "X-Api-Key", "northwind.example"]) {
    assert.ok(!text.includes(secret), secret);
  }
});

// ─── missing key ─────────────────────────────────────────────────────────────

test("a missing PDL_API_KEY is a 503 with a clear log, raised on use and never at import", () => {
  capture();
  delete process.env.PDL_API_KEY;
  assert.throws(
    () => getPdlClient(),
    (err: { status?: number; code?: string }) => err.status === 503 && err.code === "SERVICE_UNAVAILABLE",
  );
  assert.ok(logs.some((line) => line.includes("PDL_API_KEY is not set")));
});

// ─── source ──────────────────────────────────────────────────────────────────

const SEARCH = {
  domain: "northwind.example",
  sinceMonth: "2026-06",
  untilMonth: "2026-09",
  role: "Senior Product Manager",
  size: 3,
};

const NEW_HIRE = (id: string) => ({
  id,
  full_name: `Invented Person ${id}`,
  job_title: "product manager",
  job_company_id: "co-northwind",
  job_company_name: "Northwind Traders",
  job_company_website: "northwind.example",
  job_start_date: "2026-07",
  experience: [{ company: { id: "co-northwind", name: "Northwind Traders" }, start_date: "2026-07", end_date: null }],
});

test("source: a search with a country that finds nobody is repeated once without the country", async () => {
  capture();
  const bodies: Array<{ query: { bool: { must: unknown[] } } }> = [];
  const { client } = clientWith(({ init }) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const hasCountry = JSON.stringify(body.query).includes("location_country");
    return hasCountry ? json({ status: 404, error: { type: "not_found" } }, 404) : json({ status: 200, data: [NEW_HIRE("a")], total: 1 });
  });
  const outcome = await createPdlNewHiresSource(() => client).search({ ...SEARCH, location: "Toronto, Canada" });

  assert.equal(bodies.length, 2);
  assert.ok(JSON.stringify(bodies[0].query).includes('"location_country":"canada"'));
  assert.ok(!JSON.stringify(bodies[1].query).includes("location_country"));
  assert.equal(outcome.records.length, 1);
  assert.equal(outcome.creditsUsed, 1);
  assert.equal(outcome.total, 1);
});

test("source: a country search with matches is not repeated, and credits are the records returned", async () => {
  capture();
  const { client, calls } = clientWith(() => json({ status: 200, data: [NEW_HIRE("a"), NEW_HIRE("b"), { nonsense: true }], total: 60 }));
  const outcome = await createPdlNewHiresSource(() => client).search({ ...SEARCH, location: "Toronto, Canada" });
  assert.equal(calls.length, 1);
  assert.equal(outcome.total, 60);
  assert.equal(outcome.records.length, 2, "the invalid row is dropped");
  assert.equal(outcome.creditsUsed, 3, "but it was still billed");
});

test("source: no country in the location means one search with no country filter", async () => {
  capture();
  const { client, calls } = clientWith(() => json({ status: 404 }, 404));
  const outcome = await createPdlNewHiresSource(() => client).search({ ...SEARCH, location: "Remote" });
  assert.equal(calls.length, 1);
  assert.deepEqual(outcome, { records: [], total: 0, skippedInternal: 0, creditsUsed: 0 });
});

test("source: an error from the client reaches the caller and is not retried", async () => {
  capture();
  const { client, calls } = clientWith(() => json({ status: 500 }, 500));
  await assert.rejects(() => createPdlNewHiresSource(() => client).search({ ...SEARCH, location: "Toronto, Canada" }), PdlError);
  assert.equal(calls.length, 1);
});

test("source: the fingerprint covers the role filter and the country", () => {
  const source = createPdlNewHiresSource(() => {
    throw new Error("not used");
  });
  const a = source.fingerprint({ ...SEARCH, location: null });
  assert.notEqual(a, source.fingerprint({ ...SEARCH, location: "Toronto, Canada" }));
  assert.notEqual(a, source.fingerprint({ ...SEARCH, role: "Data Engineer", location: null }));
  assert.equal(a, source.fingerprint({ ...SEARCH, role: "Sr. Product Manager II", location: null }));
});
