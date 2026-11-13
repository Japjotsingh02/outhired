import "./helpers/testEnv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { companyDomainFromJobUrl, normalizeCompanyDomain } from "@/lib/domain";
import { formatDay, joinedLabel } from "@/lib/hireSearch";
import { hireWindow } from "@/server/services/hireSearch/window";
import { buildTitleKeywords } from "@/server/services/hireSearch/keywords";
import { parseDatasetRows } from "@/server/services/hireSearch/apifyNewHires";
import {
  buildCandidateRows,
  candidateConfidence,
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

// ─── buildTitleKeywords ──────────────────────────────────────────────────────

test("buildTitleKeywords strips seniority and level numerals", () => {
  assert.deepEqual(buildTitleKeywords("Senior Product Manager"), ["product manager"]);
  assert.deepEqual(buildTitleKeywords("Software Engineer II"), ["software engineer"]);
  assert.deepEqual(buildTitleKeywords("Sr. Staff Software Engineer"), ["software engineer"]);
});

test("buildTitleKeywords expands abbreviations and phrases, up to 4", () => {
  const swe = buildTitleKeywords("Senior SWE");
  assert.ok(swe.includes("swe"));
  assert.ok(swe.includes("software engineer"));

  const fe = buildTitleKeywords("Front End Engineer");
  assert.ok(fe.includes("front end engineer"));
  assert.ok(fe.includes("frontend engineer"));

  const long = buildTitleKeywords("Senior Principal Machine Learning Platform Engineer");
  assert.ok(long.length <= 4);
  assert.ok(long.includes("platform engineer"), "last two words");
});

test("buildTitleKeywords never returns a lone generic word", () => {
  assert.deepEqual(buildTitleKeywords("Senior Manager"), []);
  assert.deepEqual(buildTitleKeywords("Engineer"), []);
  assert.deepEqual(buildTitleKeywords("Lead Developer II"), []);
  assert.deepEqual(buildTitleKeywords(""), []);
  assert.deepEqual(buildTitleKeywords("Senior"), []);
  // A specific single word is fine.
  assert.deepEqual(buildTitleKeywords("Senior Recruiter"), ["recruiter"]);
});

test("buildTitleKeywords keeps every keyword within 3-64 chars and unique", () => {
  const keywords = buildTitleKeywords("x ".repeat(80));
  for (const keyword of keywords) assert.ok(keyword.length >= 3 && keyword.length <= 64);
  assert.equal(new Set(keywords).size, keywords.length);
});

// ─── Row parsing ─────────────────────────────────────────────────────────────

const found = (overrides: Record<string, unknown> = {}) => ({
  _status: "found",
  personId: 123,
  fullName: "Ada Lovelace",
  jobTitle: "Product Manager",
  companyName: "Stripe",
  companyDomain: "stripe.com",
  seniority: "manager",
  startedAt: "2026-03",
  previousCompany: "Acme",
  previousTitle: "PM",
  previousEndedAt: "2026-02",
  headline: "PM at Stripe",
  location: "London",
  countryCode: "gb",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  hasWorkEmail: true,
  hasPersonalEmail: false,
  updatedAt: "2026-04-02T10:00:00Z",
  ...overrides,
});

test("parseDatasetRows maps a normal found row", () => {
  const { records, notFound, invalid } = parseDatasetRows([found()]);
  assert.equal(notFound, 0);
  assert.equal(invalid, 0);
  assert.deepEqual(records[0], {
    externalId: "123",
    fullName: "Ada Lovelace",
    title: "Product Manager",
    companyName: "Stripe",
    companyDomain: "stripe.com",
    startedMonth: "2026-03",
    startPrecision: "month",
    previousCompany: "Acme",
    previousTitle: "PM",
    previousEndedMonth: "2026-02",
    headline: "PM at Stripe",
    location: "London",
    countryCode: "GB",
    profileUrl: "https://www.linkedin.com/in/ada",
    seniorityBucket: "manager",
    sourceUpdatedAt: "2026-04-02",
  });
});

test("parseDatasetRows never carries email flags or addresses", () => {
  const { records } = parseDatasetRows([found({ email: "a@b.com", hasWorkEmail: true })]);
  const serialized = JSON.stringify(records);
  assert.ok(!/email/i.test(serialized));
  assert.ok(!serialized.includes("a@b.com"));
});

test("parseDatasetRows handles a year-only start", () => {
  const { records } = parseDatasetRows([found({ startedAt: "2026", previousEndedAt: "2025" })]);
  assert.equal(records[0].startedMonth, "2026-01");
  assert.equal(records[0].startPrecision, "year");
  assert.equal(records[0].previousEndedMonth, "2025-01");
});

test("parseDatasetRows drops note rows and invalid rows, and counts them", () => {
  const rows = [
    { _status: "no_results", _detail: "none" },
    { _status: "outside_window" },
    found({ startedAt: "March 2026" }),
    found({ startedAt: "2026-13" }),
    found({ fullName: "" }),
    found({ personId: undefined }),
    null,
    "garbage",
    found({ personId: "p-9" }),
  ];
  const { records, notFound, invalid, noteStatuses } = parseDatasetRows(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, "p-9");
  assert.equal(invalid, 4);
  assert.equal(notFound, 4);
  assert.deepEqual(noteStatuses, ["no_results", "outside_window"]);
});

test("parseDatasetRows keeps only real LinkedIn URLs", () => {
  const evil = parseDatasetRows([found({ linkedinUrl: "javascript:alert(1)" })]).records[0];
  assert.equal(evil.profileUrl, undefined);
  const other = parseDatasetRows([found({ linkedinUrl: "https://evil.example/linkedin.com/x" })]).records[0];
  assert.equal(other.profileUrl, undefined);
});

test("parseDatasetRows keeps a row whose previous job ended years before the start", () => {
  const { records } = parseDatasetRows([found({ startedAt: "2026-03", previousEndedAt: "2022-01" })]);
  assert.equal(records.length, 1);
  assert.equal(records[0].previousEndedMonth, "2022-01");
});

// ─── Ingestion mapping ───────────────────────────────────────────────────────

const record = (overrides: Partial<HireRecord> = {}): HireRecord => ({
  externalId: "1",
  fullName: "Ada Lovelace",
  title: "Product Manager",
  startedMonth: "2026-03",
  startPrecision: "month",
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

test("candidateConfidence rules", () => {
  const prev = (previousEndedMonth: string | undefined) =>
    record({ previousCompany: "Acme", previousEndedMonth, startedMonth: "2026-06" });
  assert.equal(candidateConfidence(prev("2026-06")), "HIGH"); // same month
  assert.equal(candidateConfidence(prev("2026-03")), "HIGH"); // 3 months before
  assert.equal(candidateConfidence(prev("2026-02")), "MEDIUM"); // 4 months before
  assert.equal(candidateConfidence(prev("2025-06")), "MEDIUM"); // exactly 12 months
  assert.equal(candidateConfidence(prev("2025-05")), "LOW"); // 13 months
  assert.equal(candidateConfidence(prev("2022-01")), "LOW"); // years before
  assert.equal(candidateConfidence(prev(undefined)), "MEDIUM"); // end unknown
  assert.equal(candidateConfidence(record()), "MEDIUM"); // no previous company
  assert.equal(
    candidateConfidence(record({ startedMonth: "2026-01", startPrecision: "year", previousCompany: "Acme", previousEndedMonth: "2025-12" })),
    "LOW",
  );
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
    record({ externalId: "a", startedMonth: "2026-03", previousCompany: "Acme", previousEndedMonth: "2026-02" }),
    record({ externalId: "b", startedMonth: "2025-12" }), // before the window
    record({ externalId: "c", startedMonth: "2026-06" }), // after the window
    record({ externalId: "a", fullName: "Ada L.", startedMonth: "2026-04" }), // duplicate id: last wins
    record({ externalId: "d", fullName: "Grace Hopper", title: "Designer", startedMonth: "2026-01", startPrecision: "year" }),
  ]);
  assert.deepEqual(rows.map((row) => row.externalId).sort(), ["a", "d"]);
  const a = rows.find((row) => row.externalId === "a")!;
  assert.equal(a.name, "Ada L.");
  assert.equal(a.initials, "AL");
  assert.equal(a.startedMonth.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(a.roleMatchScore, 1);
  const d = rows.find((row) => row.externalId === "d")!;
  assert.equal(d.startedYearOnly, true);
  assert.equal(d.confidence, "LOW");
  assert.equal(d.roleMatchScore, 0);
});

test("buildCandidateRows is deterministic, so repeated ingestion writes the same keys", () => {
  const job = { id: "j1", role: "Product Manager", postedMonth: month(2026, 2) };
  const input = [record({ externalId: "a" }), record({ externalId: "b", startedMonth: "2026-04" })];
  assert.deepEqual(buildCandidateRows(job, input), buildCandidateRows(job, input));
});

// ─── Cache key ───────────────────────────────────────────────────────────────

test("hireCacheKey is stable, order-insensitive for keywords, and input-sensitive", () => {
  const key = hireCacheKey("stripe.com", "2026-02", ["product manager", "pm"]);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, hireCacheKey("stripe.com", "2026-02", ["pm", "product manager"]));
  assert.notEqual(key, hireCacheKey("stripe.com", "2026-03", ["pm", "product manager"]));
  assert.notEqual(key, hireCacheKey("example.com", "2026-02", ["pm", "product manager"]));
  assert.notEqual(key, hireCacheKey("stripe.com", "2026-02", ["pm"]));
});

// ─── Client-side formatting ──────────────────────────────────────────────────

test("joinedLabel and formatDay read ISO strings without Date parsing", () => {
  assert.equal(joinedLabel({ startedMonth: "2026-03-01T00:00:00.000Z" }), "Joined Mar 2026");
  assert.equal(joinedLabel({ startedMonth: "2026-01-01T00:00:00.000Z", startedYearOnly: true }), "Joined 2026");
  assert.equal(joinedLabel({ startedMonth: null }), null);
  assert.equal(formatDay("2026-11-03T08:00:00.000Z"), "Nov 3, 2026");
  assert.equal(formatDay(null), null);
});

