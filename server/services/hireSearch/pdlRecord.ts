import "server-only";
import { z } from "zod";
import type { MatchConfidence } from "@/generated/prisma";
import { parseYearMonth } from "@/lib/postedMonth";
import { monthIndex } from "@/server/services/hireSearch/window";
import type { HireRecord } from "@/server/services/hireSearch/types";

// ─── Dates ───────────────────────────────────────────────────────────────────
// PDL dates are "YYYY", "YYYY-MM" or "YYYY-MM-DD". Parsed with a regex only, never new Date(string).

export interface PdlDate {
  /** "YYYY-MM"; January for a year-only value. */
  month: string;
  precision: "month" | "year";
}

const PDL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parsePdlDate(value: string | undefined | null): PdlDate | null {
  const match = value ? PDL_DATE.exec(value.trim()) : null;
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1970 || year > 2200) return null;
  if (match[2] === undefined) return { month: `${match[1]}-01`, precision: "year" };
  if (!parseYearMonth(`${match[1]}-${match[2]}`)) return null;
  if (match[3] !== undefined && (Number(match[3]) < 1 || Number(match[3]) > 31)) return null;
  return { month: `${match[1]}-${match[2]}`, precision: "month" };
}

// ─── Raw record shape (only what we read; everything else is dropped on parse) ──────────────────

/**
 * A trimmed, non-empty string capped at `max` chars, or undefined for anything else, including a
 * missing key (PDL leaves out fields it has no value for).
 */
const text = (max: number) =>
  z.unknown().optional().transform((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  });

const experienceEntry = z.object({
  company: z
    .object({ id: text(80), name: text(200), website: text(200) })
    .nullish()
    .catch(undefined),
  title: z.object({ name: text(200) }).nullish().catch(undefined),
  start_date: text(10),
  end_date: text(10),
});
type ExperienceEntry = z.infer<typeof experienceEntry>;

const person = z.object({
  id: z.union([z.string().trim().min(1).max(80), z.number()]),
  full_name: z.string().trim().min(1).max(200),
  linkedin_url: text(300),
  job_title: text(200),
  job_title_levels: z.array(z.unknown()).nullish().catch(undefined),
  job_company_id: text(80),
  job_company_name: text(200),
  job_company_website: text(200),
  job_start_date: text(10),
  job_last_verified: text(40),
  location_country: text(60),
  experience: z.array(z.unknown()).nullish().catch(undefined),
});

// ─── Company matching ────────────────────────────────────────────────────────

/** Host of a website value: lowercase, without scheme, "www." or path. */
function hostOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const host = value
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return host || undefined;
}

const nameKey = (value: string | undefined) => value?.toLowerCase().replace(/[^a-z0-9]/g, "") || undefined;

interface Employer {
  id?: string;
  domain: string;
  name?: string;
}

/**
 * Entries that belong to the searched company: by PDL company id first, then website, then name.
 * Records can contain entries merged from another person, so nothing else is trusted.
 */
function entriesAtCompany(entries: ExperienceEntry[], employer: Employer): ExperienceEntry[] {
  const byId = employer.id ? entries.filter((entry) => entry.company?.id === employer.id) : [];
  if (byId.length > 0) return byId;
  const byWebsite = entries.filter((entry) => hostOf(entry.company?.website) === employer.domain);
  if (byWebsite.length > 0) return byWebsite;
  const key = nameKey(employer.name);
  return key ? entries.filter((entry) => nameKey(entry.company?.name) === key) : [];
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export interface MapContext {
  /** Normalised company website the search was for. */
  domain: string;
  sinceMonth: string;
  untilMonth: string;
}

export type MapResult =
  | { kind: "hire"; record: HireRecord }
  /** Joined the company before the window: a role change or promotion, not a new hire. */
  | { kind: "internal" }
  | { kind: "outside" }
  | { kind: "invalid" };

const HIGH_GAP_MONTHS = 3;
const LINKEDIN_URL = /^https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\//i;

function yearOf(month: string): number {
  return Number(month.slice(0, 4));
}

function profileUrlOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  // Only real LinkedIn links are kept: the value ends up in an href.
  return LINKEDIN_URL.test(url) ? url : undefined;
}

/**
 * Turns one raw PDL person into a new hire, an internal move, or nothing. job_start_date is the
 * start of the CURRENT ROLE, so the join date is the earliest start at this company in the history.
 * Only the fields of HireRecord survive; nothing else about the person is read or kept.
 */
export function mapPdlPerson(raw: unknown, context: MapContext): MapResult {
  const parsed = person.safeParse(raw);
  if (!parsed.success) return { kind: "invalid" };
  const p = parsed.data;

  const entries: ExperienceEntry[] = [];
  for (const item of p.experience ?? []) {
    const entry = experienceEntry.safeParse(item);
    if (entry.success) entries.push(entry.data);
  }

  const atCompany = entriesAtCompany(entries, {
    id: p.job_company_id,
    domain: context.domain,
    name: p.job_company_name,
  });

  // Join date: the earliest dated start at this company; failing that, the current role's start.
  let joined: PdlDate | null = null;
  for (const entry of atCompany) {
    const start = parsePdlDate(entry.start_date);
    if (!start) continue;
    const better =
      joined === null ||
      (monthIndex(start.month) ?? Infinity) < (monthIndex(joined.month) ?? Infinity) ||
      (start.month === joined.month && start.precision === "month");
    if (better) joined = start;
  }
  const hasDatedHistory = joined !== null;
  if (!joined) joined = parsePdlDate(p.job_start_date);
  if (!joined) return { kind: "invalid" };

  // Position against the window (year-only values are compared by year).
  const yearOnly = joined.precision === "year";
  const joinedIdx = monthIndex(joined.month);
  const sinceIdx = monthIndex(context.sinceMonth);
  const untilIdx = monthIndex(context.untilMonth);
  if (joinedIdx === null || sinceIdx === null || untilIdx === null) return { kind: "invalid" };
  const before = yearOnly ? yearOf(joined.month) < yearOf(context.sinceMonth) : joinedIdx < sinceIdx;
  const after = yearOnly ? yearOf(joined.month) > yearOf(context.untilMonth) : joinedIdx > untilIdx;
  if (before) return hasDatedHistory ? { kind: "internal" } : { kind: "outside" };
  if (after) return { kind: "outside" };

  // Previous employer: a different company, the latest end not after the join; else the latest start before it.
  const others = entries.filter((entry) => !atCompany.includes(entry) && entry.company?.name);
  let previous: { entry: ExperienceEntry; end: PdlDate | null } | null = null;
  let previousKey = -Infinity;
  for (const entry of others) {
    const end = parsePdlDate(entry.end_date);
    const endIdx = end ? monthIndex(end.month) : null;
    if (end && endIdx !== null && endIdx <= joinedIdx && endIdx > previousKey) {
      previous = { entry, end };
      previousKey = endIdx;
    }
  }
  if (!previous) {
    previousKey = -Infinity;
    for (const entry of others) {
      const start = parsePdlDate(entry.start_date);
      const startIdx = start ? monthIndex(start.month) : null;
      if (startIdx !== null && startIdx < joinedIdx && startIdx > previousKey) {
        previous = { entry, end: null };
        previousKey = startIdx;
      }
    }
  }

  let confidence: MatchConfidence = "MEDIUM";
  if (yearOnly || !hasDatedHistory) {
    confidence = "LOW";
  } else if (previous?.end) {
    const endIdx = monthIndex(previous.end.month);
    if (endIdx !== null && joinedIdx - endIdx >= 0 && joinedIdx - endIdx <= HIGH_GAP_MONTHS) confidence = "HIGH";
  }

  const level = p.job_title_levels?.find((value): value is string => typeof value === "string" && value.length > 0);
  const verified = p.job_last_verified?.match(/^(\d{4}-\d{2}-\d{2})/);

  return {
    kind: "hire",
    record: {
      externalId: String(p.id),
      fullName: p.full_name,
      title: p.job_title ?? "",
      companyName: p.job_company_name,
      companyDomain: hostOf(p.job_company_website) ?? context.domain,
      startedMonth: joined.month,
      startPrecision: joined.precision,
      previousCompany: previous?.entry.company?.name,
      previousTitle: previous?.entry.title?.name,
      previousEndedMonth: previous?.end?.month,
      country: p.location_country,
      profileUrl: profileUrlOf(p.linkedin_url),
      seniorityBucket: level,
      confidence,
      sourceUpdatedAt: verified?.[1],
    },
  };
}

export interface MappedRecords {
  records: HireRecord[];
  skippedInternal: number;
  /** Rows dropped for failing validation. */
  invalid: number;
}

/** Maps every raw person; bad rows are dropped and counted, never thrown. Duplicate ids keep the last. */
export function mapPdlRecords(rawRecords: unknown[], context: MapContext): MappedRecords {
  const byId = new Map<string, HireRecord>();
  let skippedInternal = 0;
  let invalid = 0;
  for (const raw of rawRecords) {
    const result = mapPdlPerson(raw, context);
    if (result.kind === "hire") byId.set(result.record.externalId, result.record);
    else if (result.kind === "internal") skippedInternal++;
    else if (result.kind === "invalid") invalid++;
  }
  return { records: [...byId.values()], skippedInternal, invalid };
}
