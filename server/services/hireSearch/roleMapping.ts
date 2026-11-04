import "server-only";
import { LEVEL_NUMERALS, ROLE_ABBREVIATIONS, SENIORITY_WORDS } from "@/constants/jobParsing";

/**
 * Canonical values from PDL's docs (docs.peopledatalabs.com: Job Title Roles, Job Title Sub-Roles,
 * and "Mapping Job Title Class to Roles to Subroles"). A filter may only use values listed here.
 */
export const PDL_ROLES = [
  "advisory", "analyst", "creative", "education", "engineering", "finance", "fulfillment", "health",
  "hospitality", "human_resources", "legal", "manufacturing", "marketing", "operations", "partnerships",
  "product", "professional_service", "public_service", "research", "sales", "sales_engineering",
  "support", "trade", "unemployed",
] as const;

export const PDL_SUB_ROLES = [
  "academic", "account_executive", "account_management", "accounting", "accounting_services", "administrative",
  "advisor", "agriculture", "aides", "architecture", "artist", "board_member", "bookkeeping", "brand",
  "building_and_grounds", "business_analyst", "business_development", "chemical", "compliance", "construction",
  "consulting", "content", "corporate_development", "curation", "customer_success", "customer_support",
  "data_analyst", "data_engineering", "data_science", "dental", "devops", "doctor", "electric", "electrical",
  "emergency_services", "entertainment", "executive", "fashion", "financial", "fitness", "fraud", "graphic_design",
  "growth", "hair_stylist", "hardware", "health_and_safety", "human_resources", "implementation", "industrial",
  "information_technology", "insurance", "investment_banking", "investor", "investor_relations", "journalism",
  "judicial", "legal", "legal_services", "logistics", "machinist", "marketing_design", "marketing_services",
  "mechanic", "mechanical", "military", "network", "nursing", "partnerships", "pharmacy", "planning_and_analysis",
  "plumbing", "political", "primary_and_secondary", "procurement", "product_design", "product_management",
  "professor", "project_management", "protective_service", "qa_engineering", "quality_assurance", "realtor",
  "recruiting", "restaurants", "retail", "revenue_operations", "risk", "sales_development", "scientific",
  "security", "social_service", "software", "solutions_engineer", "strategy", "student", "talent_analytics",
  "therapy", "tour_and_travel", "training", "translation", "transport", "unemployed", "veterinarian", "warehouse",
  "web", "wellness",
] as const;

export type PdlRole = (typeof PDL_ROLES)[number];
export type PdlSubRole = (typeof PDL_SUB_ROLES)[number];

/** How a job's role text becomes a filter on PDL's job title. */
export type RoleFilter =
  | { kind: "canonical"; role: PdlRole; subRoles: PdlSubRole[] }
  | { kind: "phrase"; phrase: string }
  | { kind: "none" };

function own(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

// A single one of these matches far too many unrelated titles to be a useful filter.
const GENERIC_SINGLE_WORDS = new Set([
  "manager", "engineer", "developer", "director", "lead", "analyst", "specialist",
  "associate", "consultant", "officer", "executive", "designer", "scientist",
  "administrator", "coordinator", "representative", "assistant", "architect",
  "head", "president", "partner", "owner", "member", "staff",
]);

const MAX_PHRASE_LENGTH = 64;

/**
 * The role with seniority words and level numerals removed and abbreviations expanded, lowercase:
 * "Sr. SWE II" -> "software engineer". Empty string when nothing is left.
 */
export function coreRoleText(role: string): string {
  const tokens = role
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const isSeniority = (token: string) => {
    if (SENIORITY_WORDS.has(token)) return true;
    const expansion = own(ROLE_ABBREVIATIONS, token);
    return expansion !== undefined && SENIORITY_WORDS.has(expansion);
  };
  const isLevel = (token: string) => /^\d+$/.test(token) || own(LEVEL_NUMERALS, token) !== undefined;

  return tokens
    .filter((token) => !isSeniority(token) && !isLevel(token))
    .map((token) => own(ROLE_ABBREVIATIONS, token) ?? token)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Rule {
  pattern: RegExp;
  role: PdlRole;
  subRoles?: PdlSubRole[];
}

// First match wins, so specific rules come before general ones. Only mappings that are clear from
// PDL's role/sub-role lists are here; anything else falls back to a title phrase.
const RULES: Rule[] = [
  { pattern: /\bdata engineer/, role: "engineering", subRoles: ["data_engineering"] },
  { pattern: /\bdata scientist|\bmachine learning|\bml engineer|\bai engineer/, role: "engineering", subRoles: ["data_science", "software"] },
  { pattern: /\b(software|test) engineer in test\b|\bqa\b|\bquality assurance\b|\btest engineer\b/, role: "engineering", subRoles: ["qa_engineering"] },
  { pattern: /\bdevops\b|\bsite reliability\b|\bsre\b|\bplatform engineer|\binfrastructure engineer|\bcloud engineer/, role: "engineering", subRoles: ["devops"] },
  { pattern: /\bsecurity (engineer|analyst)/, role: "engineering", subRoles: ["security"] },
  { pattern: /\bnetwork engineer/, role: "engineering", subRoles: ["network"] },
  { pattern: /\b(hardware|embedded) engineer/, role: "engineering", subRoles: ["hardware"] },
  { pattern: /\bmechanical engineer/, role: "engineering", subRoles: ["mechanical"] },
  { pattern: /\belectrical engineer/, role: "engineering", subRoles: ["electrical"] },
  {
    pattern: /\b(software|front ?end|frontend|back ?end|backend|full ?stack|fullstack|web|mobile|ios|android|application)\s+(engineer|developer)|\bsoftware\b|\bprogrammer\b/,
    role: "engineering",
    subRoles: ["software", "web"],
  },
  { pattern: /\bproduct (manager|owner|management)\b/, role: "product", subRoles: ["product_management"] },
  { pattern: /\b(product|ux|ui) designer\b/, role: "product", subRoles: ["product_design"] },
  { pattern: /\bgraphic designer\b/, role: "creative", subRoles: ["graphic_design"] },
  { pattern: /\bdata analyst\b/, role: "analyst", subRoles: ["data_analyst"] },
  { pattern: /\bbusiness analyst\b/, role: "analyst", subRoles: ["business_analyst"] },
  { pattern: /\b(sales|solutions) engineer|\bsolutions architect\b/, role: "sales_engineering", subRoles: ["solutions_engineer"] },
  { pattern: /\baccount executive\b/, role: "sales", subRoles: ["account_executive"] },
  { pattern: /\bsales development\b|\bbusiness development representative\b/, role: "sales", subRoles: ["sales_development"] },
  { pattern: /\bsales\b/, role: "sales" },
  { pattern: /\bgrowth\b/, role: "marketing", subRoles: ["growth"] },
  { pattern: /\bmarketing\b/, role: "marketing" },
  { pattern: /\bbusiness development\b|\bpartnerships?\b/, role: "partnerships", subRoles: ["business_development", "partnerships"] },
  { pattern: /\brecruiter\b|\btalent acquisition\b|\bsourcer\b/, role: "human_resources", subRoles: ["recruiting"] },
  { pattern: /\bhuman resources\b|\bhr\b|\bpeople operations\b/, role: "human_resources" },
  { pattern: /\bcustomer success\b/, role: "support", subRoles: ["customer_success"] },
  { pattern: /\bcustomer (support|service)\b/, role: "support", subRoles: ["customer_support"] },
  { pattern: /\b(counsel|attorney|lawyer|paralegal)\b|\blegal\b/, role: "legal" },
  { pattern: /\b(accountant|accounting|controller|financial analyst|finance)\b/, role: "finance" },
  { pattern: /\b(project|program) manager\b/, role: "fulfillment", subRoles: ["project_management"] },
  { pattern: /\boperations\b/, role: "operations" },
];

/**
 * Picks the title filter for a role: PDL's canonical role (and sub-roles) when the mapping is clear,
 * otherwise the core role phrase for a title phrase match, otherwise no role filter at all.
 * Seniority is never part of it: it is ranked locally.
 */
export function buildRoleFilter(role: string): RoleFilter {
  const core = coreRoleText(role);
  if (!core) return { kind: "none" };

  for (const rule of RULES) {
    if (rule.pattern.test(core)) {
      return { kind: "canonical", role: rule.role, subRoles: rule.subRoles ?? [] };
    }
  }

  const single = !core.includes(" ");
  if (core.length < 3 || core.length > MAX_PHRASE_LENGTH || (single && GENERIC_SINGLE_WORDS.has(core))) {
    return { kind: "none" };
  }
  return { kind: "phrase", phrase: core };
}

/** Stable text for a filter; part of the shared cache key. */
export function roleFilterKey(filter: RoleFilter): string {
  switch (filter.kind) {
    case "canonical":
      return `role:${filter.role}/${[...filter.subRoles].sort().join("+")}`;
    case "phrase":
      return `phrase:${filter.phrase}`;
    case "none":
      return "none";
  }
}
