import "./helpers/testEnv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPdlPerson, mapPdlRecords, parsePdlDate } from "@/server/services/hireSearch/pdlRecord";

// Every person below is invented. The company is "Northwind Traders" (northwind.example).
const CONTEXT = { domain: "northwind.example", sinceMonth: "2026-06", untilMonth: "2026-09" };
const COMPANY = { id: "co-northwind", name: "Northwind Traders", website: "northwind.example" };
const OTHER = (n: number) => ({ id: `co-other-${n}`, name: `Other Corp ${n}`, website: `other${n}.example` });

const person = (overrides: Record<string, unknown> = {}) => ({
  id: "pdl-1",
  full_name: "Ada Quill",
  linkedin_url: "linkedin.com/in/ada-quill-example",
  job_title: "product manager",
  job_title_levels: ["senior"],
  job_company_id: COMPANY.id,
  job_company_name: COMPANY.name,
  job_company_website: COMPANY.website,
  job_start_date: "2026-07",
  job_last_verified: "2026-09-14T10:00:00Z",
  location_country: "canada",
  experience: [
    { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07", end_date: null, is_primary: true },
    { company: OTHER(1), title: { name: "associate product manager" }, start_date: "2023-01", end_date: "2026-06", is_primary: false },
  ],
  // Fields we must never keep:
  emails: [{ address: "ada@example.test" }],
  phone_numbers: ["+15550100"],
  birth_year: 1990,
  sex: "female",
  skills: ["secret skill"],
  education: [{ school: { name: "Example U" } }],
  profiles: [{ network: "twitter", url: "https://twitter.com/ada" }],
  street_address: "1 Example Street",
  ...overrides,
});

const hire = (raw: unknown) => {
  const result = mapPdlPerson(raw, CONTEXT);
  assert.equal(result.kind, "hire", JSON.stringify(result));
  return result.kind === "hire" ? result.record : (undefined as never);
};

// ─── dates ───────────────────────────────────────────────────────────────────

test("parsePdlDate reads YYYY, YYYY-MM and YYYY-MM-DD, and nothing else", () => {
  assert.deepEqual(parsePdlDate("2026"), { month: "2026-01", precision: "year" });
  assert.deepEqual(parsePdlDate("2026-07"), { month: "2026-07", precision: "month" });
  assert.deepEqual(parsePdlDate("2026-07-15"), { month: "2026-07", precision: "month" });
  for (const bad of ["", "July 2026", "2026-13", "2026-00", "2026-07-32", "1900", "2026/07", null, undefined]) {
    assert.equal(parsePdlDate(bad as string), null, String(bad));
  }
});

// ─── a new hire ──────────────────────────────────────────────────────────────

test("an external new hire becomes a record with the previous employer and HIGH confidence", () => {
  assert.deepEqual(hire(person()), {
    externalId: "pdl-1",
    fullName: "Ada Quill",
    title: "product manager",
    companyName: "Northwind Traders",
    companyDomain: "northwind.example",
    startedMonth: "2026-07",
    startPrecision: "month",
    previousCompany: "Other Corp 1",
    previousTitle: "associate product manager",
    previousEndedMonth: "2026-06",
    country: "canada",
    profileUrl: "https://linkedin.com/in/ada-quill-example",
    seniorityBucket: "senior",
    confidence: "HIGH",
    sourceUpdatedAt: "2026-09-14",
  });
});

test("nothing personal beyond the kept fields survives", () => {
  const text = JSON.stringify(hire(person()));
  for (const secret of ["ada@example.test", "+15550100", "1990", "female", "secret skill", "Example U", "twitter", "Example Street"]) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.deepEqual(
    Object.keys(hire(person())).sort(),
    [
      "companyDomain", "companyName", "confidence", "country", "externalId", "fullName", "previousCompany",
      "previousEndedMonth", "previousTitle", "profileUrl", "seniorityBucket", "sourceUpdatedAt", "startPrecision",
      "startedMonth", "title",
    ],
  );
});

// ─── internal moves ──────────────────────────────────────────────────────────

test("an internal promotion is dropped and counted: the join date is the earliest start at the company", () => {
  const promoted = person({
    job_start_date: "2026-07",
    experience: [
      { company: COMPANY, title: { name: "director of product" }, start_date: "2026-07", end_date: null },
      { company: COMPANY, title: { name: "product manager" }, start_date: "2019-03", end_date: "2026-06" },
      { company: OTHER(2), title: { name: "analyst" }, start_date: "2015", end_date: "2019-02" },
    ],
  });
  assert.deepEqual(mapPdlPerson(promoted, CONTEXT), { kind: "internal" });
  const mapped = mapPdlRecords([promoted, person({ id: "pdl-2" })], CONTEXT);
  assert.equal(mapped.records.length, 1);
  assert.equal(mapped.skippedInternal, 1);
  assert.equal(mapped.invalid, 0);
});

test("the earliest company start wins even when entries are out of order", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "later role" }, start_date: "2026-08", end_date: null },
        { company: COMPANY, title: { name: "first role" }, start_date: "2026-06", end_date: "2026-07" },
      ],
    }),
  );
  assert.equal(record.startedMonth, "2026-06");
});

// ─── date precision ──────────────────────────────────────────────────────────

test("a year-only start inside the window's years is kept with LOW confidence", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026", end_date: null },
        { company: OTHER(1), title: { name: "pm" }, start_date: "2022", end_date: "2025" },
      ],
    }),
  );
  assert.equal(record.startedMonth, "2026-01");
  assert.equal(record.startPrecision, "year");
  assert.equal(record.confidence, "LOW");
});

test("a year-only start in an earlier year is an internal move, in a later year is outside", () => {
  const yearOnly = (year: string) =>
    person({ experience: [{ company: COMPANY, title: { name: "x" }, start_date: year, end_date: null }] });
  assert.deepEqual(mapPdlPerson(yearOnly("2025"), CONTEXT), { kind: "internal" });
  assert.deepEqual(mapPdlPerson(yearOnly("2027"), CONTEXT), { kind: "outside" });
});

test("YYYY-MM-DD dates are reduced to the month", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07-21", end_date: null },
        { company: OTHER(1), title: { name: "pm" }, start_date: "2024-01-08", end_date: "2026-06-30" },
      ],
    }),
  );
  assert.equal(record.startedMonth, "2026-07");
  assert.equal(record.previousEndedMonth, "2026-06");
  assert.equal(record.confidence, "HIGH");
});

test("the window edges are inclusive", () => {
  const at = (month: string) =>
    mapPdlPerson(person({ experience: [{ company: COMPANY, title: { name: "x" }, start_date: month, end_date: null }] }), CONTEXT).kind;
  assert.equal(at("2026-06"), "hire");
  assert.equal(at("2026-09"), "hire");
  assert.equal(at("2026-05"), "internal");
  assert.equal(at("2026-10"), "outside");
});

// ─── missing or messy history ────────────────────────────────────────────────

test("no experience entries: kept using job_start_date with LOW confidence and no previous employer", () => {
  const record = hire(person({ experience: undefined, job_start_date: "2026-08" }));
  assert.equal(record.startedMonth, "2026-08");
  assert.equal(record.confidence, "LOW");
  assert.equal(record.previousCompany, undefined);
  const empty = hire(person({ experience: [], job_start_date: "2026-08" }));
  assert.equal(empty.confidence, "LOW");
});

test("no usable date anywhere makes the record invalid", () => {
  assert.deepEqual(mapPdlPerson(person({ experience: [], job_start_date: null }), CONTEXT), { kind: "invalid" });
  assert.deepEqual(mapPdlPerson(person({ experience: [], job_start_date: "last summer" }), CONTEXT), { kind: "invalid" });
});

test("entries merged from another person's history are not used", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07", end_date: null },
        { company: OTHER(1), title: { name: "associate product manager" }, start_date: "2023-01", end_date: "2026-06" },
        // Belongs to nobody we can relate to the search: another company, long ago. Never shown, never counted.
        { company: OTHER(9), title: { name: "ship captain" }, start_date: "1999", end_date: "2003" },
        { company: { id: "co-northwind-lookalike", name: "Northwind Trading Post", website: "northwindtradingpost.example" }, title: { name: "clerk" }, start_date: "2001", end_date: "2002" },
      ],
    }),
  );
  assert.equal(record.startedMonth, "2026-07", "lookalike company entries do not move the join date");
  assert.equal(record.previousCompany, "Other Corp 1");
});

test("company entries are found by id, then by website, then by name", () => {
  const entry = (company: Record<string, unknown>) => [
    { company, title: { name: "product manager" }, start_date: "2026-07", end_date: null },
    { company: OTHER(1), title: { name: "pm" }, start_date: "2020-01", end_date: "2026-06" },
  ];
  // No id match: the website matches.
  const byWebsite = hire(person({ job_company_id: "unknown-id", experience: entry({ id: "x", name: "N.", website: "https://www.northwind.example/about" }) }));
  assert.equal(byWebsite.startedMonth, "2026-07");
  // No id or website: the normalised name matches.
  const byName = hire(person({ job_company_id: "unknown-id", experience: entry({ id: "x", name: "NORTHWIND  traders!", website: "unrelated.example" }) }));
  assert.equal(byName.startedMonth, "2026-07");
});

// ─── previous employer and confidence ────────────────────────────────────────

test("the previous employer is the other company that ended latest, not after the join", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07", end_date: null },
        { company: OTHER(1), title: { name: "older job" }, start_date: "2018-01", end_date: "2021-12" },
        { company: OTHER(2), title: { name: "most recent job" }, start_date: "2022-01", end_date: "2026-05" },
        { company: OTHER(3), title: { name: "ends after the join" }, start_date: "2026-01", end_date: "2026-12" },
      ],
    }),
  );
  assert.equal(record.previousCompany, "Other Corp 2");
  assert.equal(record.previousTitle, "most recent job");
  assert.equal(record.previousEndedMonth, "2026-05");
});

test("with no dated end, the latest start before the join is the previous employer, with no end month", () => {
  const record = hire(
    person({
      experience: [
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07", end_date: null },
        { company: OTHER(1), title: { name: "a" }, start_date: "2019-01", end_date: null },
        { company: OTHER(2), title: { name: "b" }, start_date: "2023-03", end_date: null },
      ],
    }),
  );
  assert.equal(record.previousCompany, "Other Corp 2");
  assert.equal(record.previousEndedMonth, undefined);
  assert.equal(record.confidence, "MEDIUM");
});

test("confidence: HIGH within 3 months of the previous job's end, MEDIUM later, MEDIUM with no previous employer", () => {
  const withEnd = (end: string) =>
    hire(
      person({
        experience: [
          { company: COMPANY, title: { name: "x" }, start_date: "2026-07", end_date: null },
          { company: OTHER(1), title: { name: "y" }, start_date: "2020-01", end_date: end },
        ],
      }),
    ).confidence;
  assert.equal(withEnd("2026-07"), "HIGH", "same month");
  assert.equal(withEnd("2026-04"), "HIGH", "3 months before");
  assert.equal(withEnd("2026-03"), "MEDIUM", "4 months before");
  assert.equal(withEnd("2023-01"), "MEDIUM", "years before");

  const first = hire(person({ experience: [{ company: COMPANY, title: { name: "x" }, start_date: "2026-07", end_date: null }] }));
  assert.equal(first.confidence, "MEDIUM", "first job: history exists, no previous employer");
});

// ─── field handling ──────────────────────────────────────────────────────────

test("profile URLs: https is added, and only LinkedIn links are kept", () => {
  assert.equal(hire(person({ linkedin_url: "www.linkedin.com/in/x-example" })).profileUrl, "https://www.linkedin.com/in/x-example");
  assert.equal(hire(person({ linkedin_url: "https://linkedin.com/in/x-example" })).profileUrl, "https://linkedin.com/in/x-example");
  assert.equal(hire(person({ linkedin_url: "javascript:alert(1)" })).profileUrl, undefined);
  assert.equal(hire(person({ linkedin_url: "evil.example/linkedin.com/in/x" })).profileUrl, undefined);
  assert.equal(hire(person({ linkedin_url: null })).profileUrl, undefined);
});

test("the seniority bucket is the first job_title_levels value, or none", () => {
  assert.equal(hire(person({ job_title_levels: ["manager", "senior"] })).seniorityBucket, "manager");
  assert.equal(hire(person({ job_title_levels: [] })).seniorityBucket, undefined);
  assert.equal(hire(person({ job_title_levels: null })).seniorityBucket, undefined);
});

test("rows without an id or a name are invalid and counted; duplicates keep one", () => {
  const rows = [
    person({ id: undefined }),
    person({ full_name: "" }),
    null,
    "garbage",
    person({ id: "dup" }),
    person({ id: "dup", full_name: "Ada Quill the Second" }),
    person({ id: 77 }),
  ];
  const mapped = mapPdlRecords(rows, CONTEXT);
  assert.equal(mapped.invalid, 4);
  assert.deepEqual(mapped.records.map((r) => r.externalId).sort(), ["77", "dup"]);
  assert.equal(mapped.records.find((r) => r.externalId === "dup")!.fullName, "Ada Quill the Second");
});

test("a malformed experience entry is skipped without losing the record", () => {
  const record = hire(
    person({
      experience: [
        "garbage",
        null,
        { company: "not an object", start_date: 7 },
        { company: COMPANY, title: { name: "product manager" }, start_date: "2026-07", end_date: null },
      ],
    }),
  );
  assert.equal(record.startedMonth, "2026-07");
});

test("a sparse record, with keys missing entirely rather than null, still maps", () => {
  const record = hire({
    id: "pdl-sparse",
    full_name: "Bo Thistle",
    job_start_date: "2026-08",
    experience: [{ company: { id: "co-northwind" }, start_date: "2026-08" }],
    job_company_id: "co-northwind",
  });
  assert.equal(record.externalId, "pdl-sparse");
  assert.equal(record.startedMonth, "2026-08");
  assert.equal(record.title, "");
  assert.equal(record.profileUrl, undefined);
  assert.equal(record.country, undefined);
  assert.equal(record.companyDomain, "northwind.example", "falls back to the searched domain");
});
