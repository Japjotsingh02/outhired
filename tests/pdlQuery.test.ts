import "./helpers/testEnv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { countryFromLocation } from "@/server/services/hireSearch/country";
import { buildPdlQuery, searchFingerprint } from "@/server/services/hireSearch/pdlQuery";
import {
  PDL_ROLES,
  PDL_SUB_ROLES,
  buildRoleFilter,
  coreRoleText,
  roleFilterKey,
} from "@/server/services/hireSearch/roleMapping";

// ─── core role text ──────────────────────────────────────────────────────────

test("coreRoleText strips seniority and level numerals and expands abbreviations", () => {
  assert.equal(coreRoleText("Senior Product Manager"), "product manager");
  assert.equal(coreRoleText("Software Engineer II"), "software engineer");
  assert.equal(coreRoleText("Sr. Staff SWE"), "software engineer");
  assert.equal(coreRoleText("Lead Developer III"), "developer");
  assert.equal(coreRoleText("Senior"), "");
  assert.equal(coreRoleText(""), "");
});

// ─── role filter ─────────────────────────────────────────────────────────────

test("software, frontend, backend and full stack titles map to engineering with the software and web sub-roles", () => {
  for (const title of [
    "Senior Software Engineer",
    "Frontend Developer",
    "Front-End Engineer",
    "Backend Engineer II",
    "Full Stack Developer",
    "Sr. SWE",
    "Mobile Engineer",
  ]) {
    assert.deepEqual(
      buildRoleFilter(title),
      { kind: "canonical", role: "engineering", subRoles: ["software", "web"] },
      title,
    );
  }
});

test("specific engineering roles map to their own sub-role, before the general software rule", () => {
  const sub = (title: string) => {
    const filter = buildRoleFilter(title);
    return filter.kind === "canonical" ? `${filter.role}/${filter.subRoles.join("+")}` : filter.kind;
  };
  assert.equal(sub("Data Engineer"), "engineering/data_engineering");
  assert.equal(sub("Senior Data Scientist"), "engineering/data_science+software");
  assert.equal(sub("DevOps Engineer"), "engineering/devops");
  assert.equal(sub("Site Reliability Engineer"), "engineering/devops");
  assert.equal(sub("QA Engineer"), "engineering/qa_engineering");
  assert.equal(sub("SDET"), "engineering/qa_engineering", "SDET expands to software engineer in test");
  assert.equal(sub("Security Engineer"), "engineering/security");
});

test("other families map to PDL roles", () => {
  const role = (title: string) => {
    const filter = buildRoleFilter(title);
    return filter.kind === "canonical" ? `${filter.role}/${filter.subRoles.join("+")}` : filter.kind;
  };
  assert.equal(role("Senior Product Manager"), "product/product_management");
  assert.equal(role("Product Designer"), "product/product_design");
  assert.equal(role("Account Executive"), "sales/account_executive");
  assert.equal(role("Sales Development Representative"), "sales/sales_development");
  assert.equal(role("Solutions Engineer"), "sales_engineering/solutions_engineer");
  assert.equal(role("Technical Recruiter"), "human_resources/recruiting");
  assert.equal(role("Customer Success Manager"), "support/customer_success");
  assert.equal(role("Growth Marketing Manager"), "marketing/growth");
  assert.equal(role("Marketing Manager"), "marketing/");
  assert.equal(role("Data Analyst"), "analyst/data_analyst");
});

test("every role and sub-role we can emit is one of PDL's canonical values", () => {
  const titles = [
    "Software Engineer", "Data Engineer", "Data Scientist", "DevOps Engineer", "QA Engineer", "Security Engineer",
    "Network Engineer", "Hardware Engineer", "Mechanical Engineer", "Electrical Engineer", "Product Manager",
    "Product Designer", "Graphic Designer", "Data Analyst", "Business Analyst", "Solutions Engineer",
    "Account Executive", "Sales Development Representative", "Sales Manager", "Growth Manager", "Marketing Manager",
    "Partnerships Manager", "Recruiter", "HR Manager", "Customer Success Manager", "Customer Support Specialist",
    "Legal Counsel", "Accountant", "Project Manager", "Operations Manager",
  ];
  const roles = new Set<string>(PDL_ROLES);
  const subRoles = new Set<string>(PDL_SUB_ROLES);
  for (const title of titles) {
    const filter = buildRoleFilter(title);
    assert.equal(filter.kind, "canonical", title);
    if (filter.kind !== "canonical") continue;
    assert.ok(roles.has(filter.role), `${title}: role ${filter.role}`);
    for (const sub of filter.subRoles) assert.ok(subRoles.has(sub), `${title}: sub-role ${sub}`);
  }
  assert.equal(PDL_ROLES.length, 24);
});

test("an unmapped role falls back to a title phrase, and seniority is never part of it", () => {
  assert.deepEqual(buildRoleFilter("Senior Staff Brewmaster"), { kind: "phrase", phrase: "brewmaster" });
  assert.deepEqual(buildRoleFilter("Principal Lighthouse Keeper II"), { kind: "phrase", phrase: "lighthouse keeper" });
});

test("a role with nothing specific gets no role filter at all", () => {
  assert.deepEqual(buildRoleFilter("Senior Manager"), { kind: "none" });
  assert.deepEqual(buildRoleFilter("Engineer"), { kind: "none" });
  assert.deepEqual(buildRoleFilter("Lead Developer II"), { kind: "none" });
  assert.deepEqual(buildRoleFilter("Senior"), { kind: "none" });
  assert.deepEqual(buildRoleFilter(""), { kind: "none" });
  assert.deepEqual(buildRoleFilter("x ".repeat(80)), { kind: "none" }, "an absurdly long phrase is not used");
});

test("roleFilterKey is stable and tells filters apart", () => {
  const keys = ["Software Engineer", "Data Engineer", "Brewmaster", "Senior Manager"].map((t) => roleFilterKey(buildRoleFilter(t)));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(roleFilterKey(buildRoleFilter("Software Engineer")), roleFilterKey(buildRoleFilter("Sr. SWE II")));
});

// ─── country ─────────────────────────────────────────────────────────────────

test("countryFromLocation names a country only when the location clearly does", () => {
  assert.equal(countryFromLocation("Bengaluru, Karnataka, India"), "india");
  assert.equal(countryFromLocation("Remote - United States"), "united states");
  assert.equal(countryFromLocation("London, UK"), "united kingdom");
  assert.equal(countryFromLocation("Sydney, Australia"), "australia");
  assert.equal(countryFromLocation("Dubai, UAE"), "united arab emirates");
});

test("countryFromLocation gives nothing for a city alone, nothing, or two countries", () => {
  assert.equal(countryFromLocation("Austin, TX"), null, "'us' inside 'austin' is not a country");
  assert.equal(countryFromLocation("Campus Road"), null);
  assert.equal(countryFromLocation("Paris"), null);
  assert.equal(countryFromLocation("Remote"), null);
  assert.equal(countryFromLocation("India or Canada"), null);
  assert.equal(countryFromLocation(""), null);
  assert.equal(countryFromLocation(null), null);
});

// ─── query ───────────────────────────────────────────────────────────────────

const base = { domain: "mouser.com", sinceMonth: "2026-06", untilMonth: "2026-09" };

test("the query has the domain and the start window, lowercase, as an Elasticsearch bool", () => {
  const query = buildPdlQuery({ ...base, roleFilter: { kind: "none" }, country: null });
  assert.deepEqual(query, {
    bool: {
      must: [
        { term: { job_company_website: "mouser.com" } },
        { range: { job_start_date: { gte: "2026-06", lte: "2026-09" } } },
      ],
    },
  });
});

test("a canonical role adds job_title_role, and sub-roles as term or terms", () => {
  const single = buildPdlQuery({
    ...base,
    roleFilter: { kind: "canonical", role: "product", subRoles: ["product_management"] },
    country: null,
  });
  assert.deepEqual((single.bool as { must: unknown[] }).must.slice(2), [
    { term: { job_title_role: "product" } },
    { term: { job_title_sub_role: "product_management" } },
  ]);

  const several = buildPdlQuery({ ...base, roleFilter: buildRoleFilter("Software Engineer"), country: null });
  assert.deepEqual((several.bool as { must: unknown[] }).must.slice(2), [
    { term: { job_title_role: "engineering" } },
    { terms: { job_title_sub_role: ["software", "web"] } },
  ]);

  const roleOnly = buildPdlQuery({ ...base, roleFilter: buildRoleFilter("Marketing Manager"), country: null });
  assert.deepEqual((roleOnly.bool as { must: unknown[] }).must.slice(2), [{ term: { job_title_role: "marketing" } }]);
});

test("a phrase role uses match_phrase on job_title, and a country adds location_country", () => {
  const query = buildPdlQuery({ ...base, roleFilter: { kind: "phrase", phrase: "brewmaster" }, country: "india" });
  assert.deepEqual((query.bool as { must: unknown[] }).must.slice(2), [
    { match_phrase: { job_title: "brewmaster" } },
    { term: { location_country: "india" } },
  ]);
});

test("the query never filters on seniority", () => {
  const text = JSON.stringify(buildPdlQuery({ ...base, roleFilter: buildRoleFilter("Senior Software Engineer"), country: null }));
  assert.ok(!/senior|levels|staff|principal/i.test(text));
});

test("only query types PDL allows are used", () => {
  const allowed = new Set(["bool", "must", "term", "terms", "range", "match_phrase", "match", "exists"]);
  const query = buildPdlQuery({ ...base, roleFilter: { kind: "phrase", phrase: "brewmaster" }, country: "india" });
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        walk(child);
      }
    }
  };
  walk(query);
  for (const key of ["bool", "must", "term", "range", "match_phrase"]) assert.ok(keys.has(key), key);
  for (const key of keys) {
    // Field names and range bounds are leaves; only structural keys are checked.
    if (["job_company_website", "job_start_date", "gte", "lte", "job_title_role", "job_title_sub_role", "job_title", "location_country"].includes(key)) continue;
    assert.ok(allowed.has(key), key);
  }
});

test("the search fingerprint changes with the role filter and the country", () => {
  const a = searchFingerprint(buildRoleFilter("Software Engineer"), null);
  assert.notEqual(a, searchFingerprint(buildRoleFilter("Data Engineer"), null));
  assert.notEqual(a, searchFingerprint(buildRoleFilter("Software Engineer"), "india"));
  assert.equal(a, searchFingerprint(buildRoleFilter("Sr. SWE"), null));
});
