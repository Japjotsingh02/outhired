import { test } from "node:test";
import assert from "node:assert/strict";
import { companiesMatch } from "@/server/services/jobParsing/compare/company";
import { datesMatch } from "@/server/services/jobParsing/compare/date";
import { normalizeRole, rolesMatch } from "@/server/services/jobParsing/compare/role";
import { extractCompanyFromTitle } from "@/server/services/jobParsing/extractors/meta";

const sorted = (set: Set<string>) => [...set].sort();

test('"VP" and "Vice President" normalize to the same token sets (no loop)', () => {
  for (const [a, b] of [
    ["VP", "Vice President"],
    ["VP of Product", "Vice President, Product"],
    ["SVP", "Senior Vice President"],
    ["EVP Sales", "Executive Vice President Sales"],
  ]) {
    const left = normalizeRole(a);
    const right = normalizeRole(b);
    assert.deepEqual(sorted(left.words), sorted(right.words), `${a} vs ${b} words`);
    assert.deepEqual(sorted(left.seniority), sorted(right.seniority), `${a} vs ${b} seniority`);
    assert.ok(rolesMatch(a, b), `${a} should match ${b}`);
  }
  assert.deepEqual(sorted(normalizeRole("VP").words), ["vp"]);
  assert.deepEqual(sorted(normalizeRole("Vice President").words), ["vp"]);
});

test("abbreviation expansions agree with phrase rules", () => {
  assert.ok(rolesMatch("MLE", "ML Engineer"));
  assert.ok(rolesMatch("MLE", "Machine Learning Engineer"));
  assert.ok(rolesMatch("CSM", "Customer Success Manager"));
  assert.ok(rolesMatch("TPM", "Technical Program Manager"));
});

test("role matching is lenient about wording", () => {
  assert.ok(rolesMatch("Sr. PM", "Senior Product Manager"));
  assert.ok(rolesMatch("SDE II", "Software Engineer 2"));
  assert.ok(rolesMatch("Front-End Engineer", "Frontend Engineer"));
  assert.ok(rolesMatch("Full Stack Developer", "Fullstack Developer"));
  assert.ok(rolesMatch("Engineer, Software", "Software Engineer"));
  assert.ok(rolesMatch("Software Engineer & Architect", "Software Engineer and Architect"));
});

test("seniority: one empty side is compatible, two different sides are not", () => {
  assert.ok(rolesMatch("Software Engineer", "Senior Software Engineer"));
  assert.ok(!rolesMatch("Senior Software Engineer", "Staff Software Engineer"));
  assert.ok(!rolesMatch("Senior Software Engineer", "Junior Software Engineer"));
});

test("different roles do not match", () => {
  assert.ok(!rolesMatch("Data Scientist", "Data Engineer"));
  assert.ok(!rolesMatch("Software Engineer 2", "Software Engineer 3"));
});

test("object prototype keys are not treated as abbreviations", () => {
  assert.deepEqual(sorted(normalizeRole("constructor engineer").words), ["constructor", "engineer"]);
});

test("company comparison strips only legal suffixes", () => {
  assert.ok(companiesMatch("Stripe, Inc.", "Stripe"));
  assert.ok(companiesMatch("Acme Pvt. Ltd.", "acme"));
  assert.ok(companiesMatch("Foo Corp", "Foo Limited"));
  assert.ok(!companiesMatch("Amazon", "Amazon Web Services"));
  assert.ok(!companiesMatch("Stripe Payments", "Stripe"));
});

test("dates compare by year-month only", () => {
  assert.ok(datesMatch("2026-03-01", "2026-03-30"));
  assert.ok(!datesMatch("2026-03-01", "2026-04-01"));
});

test("extractCompanyFromTitle", () => {
  assert.equal(extractCompanyFromTitle("Stripe hiring Senior PM in Bengaluru | LinkedIn"), "Stripe");
  assert.equal(extractCompanyFromTitle("Stripe is hiring a Senior PM"), "Stripe");
  assert.equal(extractCompanyFromTitle("Senior PM at Stripe in Bengaluru | LinkedIn"), "Stripe");
  assert.equal(extractCompanyFromTitle("Senior PM - Stripe - Bengaluru | Indeed"), "Stripe");
  assert.equal(extractCompanyFromTitle("Join Acme Labs as a Designer"), "Acme Labs");
  assert.equal(extractCompanyFromTitle("Engineer at Bank of America | Glassdoor"), "Bank of America");
  assert.equal(extractCompanyFromTitle("Full-Stack Engineer | Jobs"), null);
  assert.equal(extractCompanyFromTitle("Senior Engineer - Payments | Jobs"), null);
  assert.equal(extractCompanyFromTitle(""), null);
});
