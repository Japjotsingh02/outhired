import "./helpers/testEnv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { companyDomainFromJobUrl, normalizeCompanyDomain } from "@/lib/domain";
import { formatDay, joinedLabel } from "@/lib/hireSearch";
import { hireWindow } from "@/server/services/hireSearch/window";
import {
  buildCandidateRows,
  roleMatchScore,
  startsWithinWindow,
} from "@/server/services/hireSearch/ingest";
import { hireCacheKey } from "@/server/services/hireSearch";
import type { HireRecord } from "@/server/services/hireSearch/types";

// ─── lib/domain ──────────────────────────────────────────────────────────────

test("normalizeCompanyDomain accepts URLs, www forms and bare domains", () => {
  const cases: Array<[string, string]> = [
    ["stripe.com", "stripe.com"],
    ["https://www.Stripe.com/about?x=1#top", "stripe.com"],
    ["WWW.stripe.com", "stripe.com"],
    ["http://stripe.com:8080/jobs", "stripe.com"],
    ["  stripe.com/careers  ", "stripe.com"],
    ["https://careers.stripe.com", "careers.stripe.com"],
    ["stripe.co.uk", "stripe.co.uk"],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeCompanyDomain(input), expected, input);
});

test("normalizeCompanyDomain rejects junk, IPs, localhost, single labels and job boards", () => {
  const rejected = [
    "",
    "   ",
    "localhost",
    "http://localhost:3000",
    "192.168.1.1",
    "http://10.0.0.1/path",
    "[::1]",
    "stripe",
    "not a domain",
    "mailto:a@b.com",
    "ftp://stripe.com",
    "https://www.linkedin.com/jobs/view/123",
    "indeed.com",
    "jobs.lever.co",
    "boards.greenhouse.io",
    "acme.myworkdayjobs.com",
    "-bad-.com",
    "stripe.123",
  ];
  for (const input of rejected) assert.equal(normalizeCompanyDomain(input), null, input);
});

test("companyDomainFromJobUrl strips hiring subdomains and rejects job boards", () => {
  assert.equal(companyDomainFromJobUrl("https://careers.stripe.com/jobs/1"), "stripe.com");
  assert.equal(companyDomainFromJobUrl("https://stripe.com/jobs/1"), "stripe.com");
  assert.equal(companyDomainFromJobUrl("https://www.linkedin.com/jobs/view/1"), null);
  assert.equal(companyDomainFromJobUrl("https://jobs.lever.co/stripe/abc"), null);
  assert.equal(companyDomainFromJobUrl(""), null);
});

// ─── hireWindow ──────────────────────────────────────────────────────────────

const month = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));

test("hireWindow: posted month through the month 90 days after it ends", () => {
  // Feb 2026 ends 28 Feb; +90 days = 29 May.
  assert.deepEqual(hireWindow(month(2026, 2)), { sinceMonth: "2026-02", untilMonth: "2026-05" });
  // 31-day month: Jan ends 31 Jan; +90 days = 1 May.
  assert.deepEqual(hireWindow(month(2026, 1)), { sinceMonth: "2026-01", untilMonth: "2026-05" });
  // 30-day month: Apr ends 30 Apr; +90 days = 29 Jul.
  assert.deepEqual(hireWindow(month(2026, 4)), { sinceMonth: "2026-04", untilMonth: "2026-07" });
});

test("hireWindow rolls over the year", () => {
  assert.deepEqual(hireWindow(month(2026, 11)), { sinceMonth: "2026-11", untilMonth: "2027-02" });
  assert.deepEqual(hireWindow(month(2026, 12)), { sinceMonth: "2026-12", untilMonth: "2027-03" });
});

test("hireWindow handles a leap-year February", () => {
  // Feb 2028 ends 29 Feb; +90 days = 29 May.
  assert.deepEqual(hireWindow(month(2028, 2)), { sinceMonth: "2028-02", untilMonth: "2028-05" });
});

// ─── Ingestion mapping ───────────────────────────────────────────────────────

const record = (overrides: Partial<HireRecord> = {}): HireRecord => ({
  externalId: "1",
  fullName: "Ada Lovelace",
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
  confidence: "MEDIUM",
  ...overrides,
});

const WINDOW = { sinceMonth: "2026-02", untilMonth: "2026-05" };

test("startsWithinWindow includes both edges and excludes just outside", () => {
  assert.equal(startsWithinWindow(record({ startedMonth: "2026-02" }), WINDOW), true);
  assert.equal(startsWithinWindow(record({ startedMonth: "2026-05" }), WINDOW), true);
  assert.equal(startsWithinWindow(record({ startedMonth: "2026-01" }), WINDOW), false);
  assert.equal(startsWithinWindow(record({ startedMonth: "2026-06" }), WINDOW), false);
});

test("startsWithinWindow keeps year-only rows by year", () => {
  const yearOnly = (year: string) => record({ startedMonth: `${year}-01`, startPrecision: "year" });
  assert.equal(startsWithinWindow(yearOnly("2026"), WINDOW), true);
  assert.equal(startsWithinWindow(yearOnly("2025"), WINDOW), false);
  assert.equal(startsWithinWindow(yearOnly("2027"), WINDOW), false);
  // A window crossing the new year accepts both years.
  const crossing = { sinceMonth: "2026-11", untilMonth: "2027-02" };
  assert.equal(startsWithinWindow(yearOnly("2026"), crossing), true);
  assert.equal(startsWithinWindow(yearOnly("2027"), crossing), true);
});

test("roleMatchScore is the share of job words found in the title", () => {
  assert.equal(roleMatchScore("Senior Product Manager", "Product Manager"), 1);
  assert.equal(roleMatchScore("Senior Product Manager", "Group Product Lead"), 0.5);
  assert.equal(roleMatchScore("Senior Product Manager", "Software Engineer"), 0);
  assert.equal(roleMatchScore("Senior", "Software Engineer"), null);
});

test("buildCandidateRows filters the window, scores, grades and de-duplicates", () => {
  const job = { id: "j1", role: "Senior Product Manager", postedMonth: month(2026, 2) };
  const rows = buildCandidateRows(job, [
    record({ externalId: "a", startedMonth: "2026-03", previousCompany: "Acme", previousEndedMonth: "2026-02", confidence: "HIGH" }),
    record({ externalId: "b", startedMonth: "2025-12" }), // before the window
    record({ externalId: "c", startedMonth: "2026-06" }), // after the window
    record({ externalId: "a", fullName: "Ada L.", startedMonth: "2026-04", confidence: "HIGH" }), // duplicate id: last wins
    record({ externalId: "d", fullName: "Grace Hopper", title: "Designer", startedMonth: "2026-01", startPrecision: "year", confidence: "LOW", country: "canada" }),
  ]);
  assert.deepEqual(rows.map((row) => row.externalId).sort(), ["a", "d"]);
  const a = rows.find((row) => row.externalId === "a")!;
  assert.equal(a.name, "Ada L.");
  assert.equal(a.initials, "AL");
  assert.equal(a.startedMonth.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(a.roleMatchScore, 1);
  assert.equal(a.confidence, "HIGH");
  assert.equal(a.headline, null, "no headline is stored");
  const d = rows.find((row) => row.externalId === "d")!;
  assert.equal(d.startedYearOnly, true);
  assert.equal(d.confidence, "LOW");
  assert.equal(d.roleMatchScore, 0);
  assert.equal(d.location, "canada", "the country name goes in location");
  assert.equal(d.countryCode, null);
});

test("buildCandidateRows is deterministic, so repeated ingestion writes the same keys", () => {
  const job = { id: "j1", role: "Product Manager", postedMonth: month(2026, 2) };
  const input = [record({ externalId: "a" }), record({ externalId: "b", startedMonth: "2026-04" })];
  assert.deepEqual(buildCandidateRows(job, input), buildCandidateRows(job, input));
});

// ─── Cache key ───────────────────────────────────────────────────────────────

test("hireCacheKey is stable and changes with every input", () => {
  const input = { source: "PDL", domain: "stripe.com", sinceMonth: "2026-02", untilMonth: "2026-05", fingerprint: "role:product/product_management|country:any" };
  const key = hireCacheKey(input);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, hireCacheKey({ ...input }));
  for (const change of [
    { source: "OTHER" },
    { domain: "example.com" },
    { sinceMonth: "2026-03" },
    { untilMonth: "2026-06" },
    { fingerprint: "role:product/product_management|country:india" },
    { fingerprint: "role:engineering/software+web|country:any" },
  ]) {
    assert.notEqual(key, hireCacheKey({ ...input, ...change }), JSON.stringify(change));
  }
});

// ─── Client-side formatting ──────────────────────────────────────────────────

test("joinedLabel and formatDay read ISO strings without Date parsing", () => {
  assert.equal(joinedLabel({ startedMonth: "2026-03-01T00:00:00.000Z" }), "Joined Mar 2026");
  assert.equal(joinedLabel({ startedMonth: "2026-01-01T00:00:00.000Z", startedYearOnly: true }), "Joined 2026");
  assert.equal(joinedLabel({ startedMonth: null }), null);
  assert.equal(formatDay("2026-11-03T08:00:00.000Z"), "Nov 3, 2026");
  assert.equal(formatDay(null), null);
});

