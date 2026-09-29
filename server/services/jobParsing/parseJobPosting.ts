import "server-only";
import type {
  ExtractionLayer,
  FieldConfidence,
  JobConfidence,
  JobPostingParseResult,
  MandatoryField,
} from "@/types/jobParsing";
import { MANDATORY_FIELDS } from "@/constants/jobParsing";
import { rolesMatch } from "@/server/services/jobParsing/compare/role";
import { companiesMatch } from "@/server/services/jobParsing/compare/company";
import { datesMatch } from "@/server/services/jobParsing/compare/date";
import { extractFromJsonLd } from "@/server/services/jobParsing/extractors/jsonLd";
import { extractFromMeta, getHtmlTitle } from "@/server/services/jobParsing/extractors/meta";
import { extractWithAI } from "@/server/services/jobParsing/extractors/ai";
import { inferSeniority } from "@/server/services/jobParsing/utils/skills";

function fieldsMatch(field: MandatoryField, a: string, b: string): boolean {
  if (field === "role") return rolesMatch(a, b);
  if (field === "company") return companiesMatch(a, b);
  return datesMatch(a, b);
}

/**
 * A mandatory field is verified when JSON-LD has a value and metadata either
 * agrees with it or has nothing. Everything else needs the AI layer.
 */
function isVerified(
  field: MandatoryField,
  jsonLdValue: string | null,
  metaValue: string | null,
): boolean {
  if (!jsonLdValue) return false;
  if (!metaValue) return true;
  return fieldsMatch(field, jsonLdValue, metaValue);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
/**
 * Runs JSON-LD and page-metadata extraction, then verifies the mandatory
 * fields (role, company, datePosted) by comparing the two. If every field is
 * verified the JSON-LD values are used as-is. Otherwise Gemini is called once
 * and its non-null values overwrite the earlier layers.
 */
export async function parseJobPosting(
  html: string,
  url: string,
): Promise<JobPostingParseResult> {
  const jsonLd = extractFromJsonLd(html);
  const meta = extractFromMeta(html, url);

  console.log(jsonLd, meta, 'check1');

  // JSON-LD wording wins; metadata fills what JSON-LD lacks.
  const merged: ExtractionLayer = {
    role: jsonLd.role ?? meta.role,
    team: jsonLd.team ?? meta.team,
    company: jsonLd.company ?? meta.company,
    location: jsonLd.location ?? meta.location,
    datePosted: jsonLd.datePosted ?? meta.datePosted,
    employmentType: jsonLd.employmentType ?? meta.employmentType,
    locationType: jsonLd.locationType ?? meta.locationType,
    skills: jsonLd.skills.length ? jsonLd.skills : meta.skills,
  };

  const confidence = {} as JobConfidence;
  let needsAI = false;
  for (const field of MANDATORY_FIELDS) {
    const verified = isVerified(field, jsonLd[field], meta[field]);
    confidence[field] = verified ? "verified" : "fallback";
    if (!verified) needsAI = true;
  }

  console.log(needsAI, 'check2');

  let failed = false;
  if (needsAI) {
    const outcome = await extractWithAI(url, html);
    if (outcome.ok) {
      // Full takeover: every non-null Gemini value replaces the earlier one.
      const ai = outcome.data;
      for (const field of MANDATORY_FIELDS) {
        if (ai[field]) {
          merged[field] = ai[field];
          confidence[field] = "ai" satisfies FieldConfidence;
        }
      }
      if (ai.team) merged.team = ai.team;
      if (ai.location) merged.location = ai.location;
      if (ai.locationType) merged.locationType = ai.locationType;
      if (ai.skills.length) merged.skills = ai.skills;
    } else {
      failed = true;
    }
  }

  // Seniority from merged role + html title context
  const seniority = inferSeniority(
    `${merged.role ?? ""} ${getHtmlTitle(html) ?? ""}`,
  );

  return {
    role: merged.role,
    team: merged.team,
    company: merged.company,
    location: merged.location,
    datePosted: merged.datePosted,
    employmentType: merged.employmentType,
    locationType: merged.locationType,
    skills: merged.skills,
    seniority,
    confidence,
    failed,
  };
}
