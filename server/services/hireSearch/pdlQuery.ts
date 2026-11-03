import "server-only";
import { roleFilterKey, type RoleFilter } from "@/server/services/hireSearch/roleMapping";

export interface PdlQueryInput {
  /** Normalised company website, lowercase. */
  domain: string;
  /** "YYYY-MM" bounds for job_start_date. */
  sinceMonth: string;
  untilMonth: string;
  roleFilter: RoleFilter;
  /** PDL country name (lowercase), or null for no country filter. */
  country: string | null;
}

type Clause = Record<string, unknown>;

/**
 * The Elasticsearch `query` for "people who started at this company in this window". Values are
 * lowercase, as PDL stores them. Seniority is not filtered: it is ranked after the search.
 */
export function buildPdlQuery({ domain, sinceMonth, untilMonth, roleFilter, country }: PdlQueryInput): Clause {
  const must: Clause[] = [
    { term: { job_company_website: domain } },
    { range: { job_start_date: { gte: sinceMonth, lte: untilMonth } } },
  ];

  if (roleFilter.kind === "canonical") {
    must.push({ term: { job_title_role: roleFilter.role } });
    if (roleFilter.subRoles.length === 1) must.push({ term: { job_title_sub_role: roleFilter.subRoles[0] } });
    else if (roleFilter.subRoles.length > 1) must.push({ terms: { job_title_sub_role: roleFilter.subRoles } });
  } else if (roleFilter.kind === "phrase") {
    // match_phrase, not match: a plain match ORs the words, which would return unrelated titles.
    must.push({ match_phrase: { job_title: roleFilter.phrase } });
  }

  if (country) must.push({ term: { location_country: country } });
  return { bool: { must } };
}

/** Text that identifies the role and country filters of a search; part of the shared cache key. */
export function searchFingerprint(roleFilter: RoleFilter, country: string | null): string {
  return `${roleFilterKey(roleFilter)}|country:${country ?? "any"}`;
}
