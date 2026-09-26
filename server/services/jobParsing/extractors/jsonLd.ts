import "server-only";
import type { ExtractionLayer } from "@/types/jobParsing";
import {
  asRecord,
  errorMessage,
  stringOrArray,
  stringValue,
} from "@/server/services/jobParsing/utils/values";
import { readAttributes, splitRoleAndTeam } from "@/server/services/jobParsing/extractors/meta";
import { emptyLayer } from "@/server/services/jobParsing/utils/layer";
import { toIsoDate } from "@/server/services/jobParsing/utils/dates";
import { extractSkills } from "@/server/services/jobParsing/utils/skills";

// ─── JSON-LD extraction ──────────────────────────────────────────────────────

function walkJsonLd(
  value: unknown,
  results: Record<string, unknown>[],
  seen: Set<object>,
) {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, results, seen);
    return;
  }
  const record = asRecord(value);
  if (!record || seen.has(record)) return;
  seen.add(record);
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (
    types.some(
      (item) => typeof item === "string" && item.toLowerCase() === "jobposting",
    )
  ) {
    results.push(record);
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === "object") walkJsonLd(child, results, seen);
  }
}

function extractJsonLdJobPostings(html: string): Record<string, unknown>[] {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  const postings: Record<string, unknown>[] = [];
  for (const match of scripts) {
    const scriptType = readAttributes(match[1])
      .type?.split(";")[0]
      .trim()
      .toLowerCase();
    if (scriptType !== "application/ld+json") continue;
    try {
      const parsed: unknown = JSON.parse(match[2].trim());
      walkJsonLd(parsed, postings, new Set<object>());
    } catch (err) {
      // Invalid JSON-LD blocks do not prevent the other layers from running.
      console.error("[parseJob] Skipping invalid JSON-LD block:", errorMessage(err));
    }
  }
  return postings;
}

function jsonLdLocation(value: unknown): string | null {
  const locations = Array.isArray(value) ? value : [value];
  for (const item of locations) {
    const address = asRecord(asRecord(item)?.address);
    if (!address) continue;
    const parts = [
      stringValue(address.addressLocality),
      stringValue(address.addressRegion),
      countryName(address.addressCountry),
    ].filter((part): part is string => Boolean(part));
    if (parts.length) return [...new Set(parts)].join(", ");
  }
  return null;
}

function countryName(value: unknown): string | null {
  return stringValue(value) ?? stringValue(asRecord(value)?.name);
}

export function extractFromJsonLd(html: string): ExtractionLayer {
  const jobPostings = extractJsonLdJobPostings(html);
  const structured =
    jobPostings.find(
      (p) =>
        stringValue(p.title) &&
        stringValue(asRecord(p.hiringOrganization)?.name),
    ) ?? jobPostings[0];

  if (!structured) return emptyLayer();

  const organization = asRecord(structured.hiringOrganization);
  const rawRole = stringValue(structured.title);
  const { role, team } = rawRole
    ? splitRoleAndTeam(rawRole)
    : { role: null, team: null };
  const description = stringValue(structured.description) ?? "";

  return {
    role: role || null,
    team,
    company: stringValue(organization?.name),
    location: jsonLdLocation(structured.jobLocation),
    datePosted: toIsoDate(structured.datePosted),
    employmentType: stringOrArray(structured.employmentType),
    locationType: null,
    skills: extractSkills(description),
  };
}
