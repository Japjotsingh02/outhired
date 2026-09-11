import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { extractWithAI, parseJobPosting } from "@/server/services/jobParsing";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
let geminiCalls = 0;
let allCalls = 0;
let geminiResponses: Array<() => Response> = [];

function geminiJson(fields: Record<string, unknown>): Response {
  const body = { candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] };
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  geminiCalls = 0;
  allCalls = 0;
  geminiResponses = [];
  console.error = () => {};
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    allCalls++;
    const target = String(input);
    if (target.includes("r.jina.ai")) return new Response("# Posting markdown", { status: 200 });
    if (target.includes("generativelanguage.googleapis.com")) {
      const next = geminiResponses[Math.min(geminiCalls, geminiResponses.length - 1)];
      geminiCalls++;
      return next();
    }
    throw new Error(`unexpected fetch ${target}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

function page(opts: {
  jsonLd?: Record<string, unknown>;
  ogTitle?: string;
  siteName?: string;
  published?: string;
}): string {
  const parts = ["<html><head>"];
  if (opts.jsonLd) {
    parts.push(`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", ...opts.jsonLd })}</script>`);
  }
  if (opts.ogTitle) parts.push(`<meta property="og:title" content="${opts.ogTitle}">`);
  if (opts.siteName) parts.push(`<meta property="og:site_name" content="${opts.siteName}">`);
  if (opts.published) parts.push(`<meta property="article:published_time" content="${opts.published}">`);
  parts.push("</head><body></body></html>");
  return parts.join("");
}

const JSON_LD = {
  title: "Senior Product Manager",
  hiringOrganization: { name: "Stripe, Inc." },
  datePosted: "2026-03-12",
};

test("all three verified -> AI skipped, JSON-LD wording wins", async () => {
  const html = page({
    jsonLd: JSON_LD,
    ogTitle: "Sr PM - Payments | Stripe",
    siteName: "Stripe",
    published: "2026-03-30",
  });
  const result = await parseJobPosting(html, "https://careers.stripe.com/jobs/1");
  assert.equal(allCalls, 0);
  assert.equal(result.role, "Senior Product Manager");
  assert.equal(result.company, "Stripe, Inc.");
  assert.equal(result.datePosted, "2026-03-01");
  assert.deepEqual(result.confidence, { role: "verified", company: "verified", datePosted: "verified" });
  assert.equal(result.failed, false);
});

test("JSON-LD value with nothing in meta is verified", async () => {
  // Only JSON-LD: the domain fallback supplies a meta company ("Stripe") that matches.
  const result = await parseJobPosting(page({ jsonLd: JSON_LD }), "https://careers.stripe.com/jobs/1");
  assert.equal(allCalls, 0);
  assert.deepEqual(result.confidence, { role: "verified", company: "verified", datePosted: "verified" });
});

test("disagreement -> one Gemini call; non-null AI values overwrite", async () => {
  geminiResponses = [() => geminiJson({ company: "Stripe", team: "Payments", skills: ["Python"] })];
  const html = page({ jsonLd: JSON_LD, siteName: "Stripe Payments", published: "2026-03-30" });
  const result = await parseJobPosting(html, "https://careers.stripe.com/jobs/1");
  assert.equal(geminiCalls, 1);
  assert.equal(result.company, "Stripe");
  assert.equal(result.confidence.company, "ai");
  // Gemini returned null for role and date: previous values kept, still verified.
  assert.equal(result.role, "Senior Product Manager");
  assert.equal(result.confidence.role, "verified");
  assert.equal(result.confidence.datePosted, "verified");
  assert.equal(result.team, "Payments");
  assert.deepEqual(result.skills, ["Python"]);
  assert.equal(result.failed, false);
});

test("Gemini null for a field that needed AI -> fallback to earlier layer", async () => {
  geminiResponses = [() => geminiJson({ role: null, company: null })];
  const html = page({ jsonLd: JSON_LD, siteName: "Stripe Payments" });
  const result = await parseJobPosting(html, "https://careers.stripe.com/jobs/1");
  assert.equal(result.company, "Stripe, Inc.");
  assert.equal(result.confidence.company, "fallback");
  assert.equal(result.failed, false);
});

test("no JSON-LD -> AI needed; AI date is parsed to YYYY-MM-01", async () => {
  geminiResponses = [() => geminiJson({ role: "Engineer", company: "Acme", datePosted: "March 12, 2026" })];
  const result = await parseJobPosting(page({ siteName: "Acme" }), "https://acme.com/careers/1");
  assert.equal(geminiCalls, 1);
  assert.equal(result.datePosted, "2026-03-01");
  assert.deepEqual(result.confidence, { role: "ai", company: "ai", datePosted: "ai" });
});

test("Gemini failure -> failed: true and earlier layers kept", async () => {
  geminiResponses = [() => new Response("bad request", { status: 400 })];
  const html = page({ jsonLd: JSON_LD, siteName: "Stripe Payments" });
  const result = await parseJobPosting(html, "https://careers.stripe.com/jobs/1");
  assert.equal(geminiCalls, 1, "400 must not be retried");
  assert.equal(result.failed, true);
  assert.equal(result.company, "Stripe, Inc.");
  assert.equal(result.confidence.company, "fallback");
  assert.equal(result.role, "Senior Product Manager");
});

test("job boards: meta company comes from the title, never og:site_name", async () => {
  geminiResponses = [() => new Response("nope", { status: 403 })];
  const html = page({
    ogTitle: "Stripe hiring Senior PM in Bengaluru | LinkedIn",
    siteName: "LinkedIn",
  });
  const result = await parseJobPosting(html, "https://www.linkedin.com/jobs/view/123456789");
  assert.equal(result.failed, true);
  assert.equal(result.company, "Stripe");
});

test("job boards: unparseable title -> no meta company", async () => {
  geminiResponses = [() => new Response("nope", { status: 403 })];
  const html = page({ ogTitle: "Jobs | LinkedIn", siteName: "LinkedIn" });
  const result = await parseJobPosting(html, "https://www.linkedin.com/jobs/view/123456789");
  assert.equal(result.company, null);
});

test("retry: 500 then success -> two Gemini calls", async () => {
  geminiResponses = [
    () => new Response("boom", { status: 500 }),
    () => geminiJson({ role: "Engineer", company: "Acme" }),
  ];
  const outcome = await extractWithAI("", "<p>Engineer at Acme</p>");
  assert.equal(geminiCalls, 2);
  assert.ok(outcome.ok);
  assert.equal(outcome.ok && outcome.data.company, "Acme");
});

test("retry: invalid JSON twice -> exactly two calls, then failure", async () => {
  const bad = () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), { status: 200 });
  geminiResponses = [bad, bad];
  const outcome = await extractWithAI("", "<p>Engineer at Acme</p>");
  assert.equal(geminiCalls, 2);
  assert.equal(outcome.ok, false);
});

test("no retry on 401/403", async () => {
  geminiResponses = [() => new Response("denied", { status: 401 })];
  const outcome = await extractWithAI("", "<p>Engineer at Acme</p>");
  assert.equal(geminiCalls, 1);
  assert.equal(outcome.ok, false);
});

test("the API key is sent in a header, never the URL", async () => {
  let seenUrl = "";
  let seenHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenHeaders = init?.headers;
    return geminiJson({ role: "Engineer" });
  }) as typeof fetch;
  await extractWithAI("", "<p>Engineer</p>");
  assert.ok(!seenUrl.includes("test-key"));
  assert.ok(seenUrl.includes("gemini-2.0-flash"));
  assert.equal((seenHeaders as Record<string, string>)["x-goog-api-key"], "test-key");
});

test("missing GEMINI_API_KEY fails without calling the network", async () => {
  delete process.env.GEMINI_API_KEY;
  const outcome = await extractWithAI("", "<p>Engineer</p>");
  assert.equal(outcome.ok, false);
  assert.equal(allCalls, 0);
});
