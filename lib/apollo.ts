import { Candidate } from "@/types";
import { APOLLO_BASE, APOLLO_LEGACY_BASE, apolloHeaders, requireApolloKey } from "@/lib/apolloClient";
import { APOLLO_WINDOW_EXTRA_DAYS } from "@/constants/jobParsing";

const DAY_MS = 86_400_000;

export interface HireWindow {
  /** First instant of the posted month (UTC). */
  start: Date;
  /** Last instant of the posted month plus APOLLO_WINDOW_EXTRA_DAYS (UTC). */
  end: Date;
  /** Days from `start` back from now: Apollo's `changed_jobs_within_days` is relative to today. */
  daysBack: number;
}

/**
 * Search window for new hires: start of the posted month to the end of that
 * month plus APOLLO_WINDOW_EXTRA_DAYS. `postedMonth` is Job.postedMonth (UTC).
 */
export function hireWindow(postedMonth: Date, now: Date = new Date()): HireWindow {
  const year = postedMonth.getUTCFullYear();
  const month = postedMonth.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const endOfMonth = Date.UTC(year, month + 1, 1) - 1;
  const end = new Date(endOfMonth + APOLLO_WINDOW_EXTRA_DAYS * DAY_MS);
  const daysBack = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / DAY_MS));
  return { start, end, daysBack };
}

/**
 * True unless the person's current job has a start date outside the window.
 * Apollo does not always return a start date; those people are kept.
 */
export function startedWithinWindow(person: ApolloPerson, window: HireWindow): boolean {
  const current = person.employment_history?.find((entry) => entry.current);
  const match = current?.start_date?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return true;
  const startedAt = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1));
  return startedAt >= window.start.getTime() && startedAt <= window.end.getTime();
}

export function buildTitleVariants(role: string): string[] {
  const variants = new Set<string>([role]);
  const base = role.toLowerCase();

  const expansions: Record<string, string[]> = {
    "software engineer": ["SWE", "Software Engineer", "Software Developer", "Backend Engineer", "Full Stack Engineer", "Fullstack Engineer"],
    "frontend engineer": ["Frontend Engineer", "Frontend Developer", "UI Engineer", "React Developer", "Web Engineer"],
    "fullstack engineer": ["Fullstack Engineer", "Full Stack Engineer", "Full-Stack Engineer", "Software Engineer"],
    "backend engineer": ["Backend Engineer", "Backend Developer", "Software Engineer", "Server-Side Engineer"],
    "data engineer": ["Data Engineer", "Analytics Engineer", "Data Platform Engineer"],
    "ml engineer": ["ML Engineer", "Machine Learning Engineer", "AI Engineer", "Research Engineer"],
    "product manager": ["Product Manager", "PM", "Senior PM", "Group Product Manager"],
    "devops / sre": ["DevOps Engineer", "SRE", "Site Reliability Engineer", "Platform Engineer", "Infrastructure Engineer"],
    "android engineer": ["Android Engineer", "Android Developer", "Mobile Engineer"],
    "ios engineer": ["iOS Engineer", "iOS Developer", "Mobile Engineer"],
  };

  for (const [key, alts] of Object.entries(expansions)) {
    if (base.includes(key)) alts.forEach((a) => variants.add(a));
  }

  return Array.from(variants).slice(0, 10);
}

function titleSimilarity(a: string, b: string): number {
  const stop = new Set(["senior", "junior", "staff", "principal", "lead", "sr", "jr", "ii", "iii", "i", "at", "the", "and", "of", "for"]);
  const tok = (s: string) => new Set(s.toLowerCase().split(/[\s\-\/]+/).filter((w) => w.length > 1 && !stop.has(w)));
  const setA = tok(a);
  const setB = tok(b);
  const inter = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

export function fuzzyFilterByTitle(people: ApolloPerson[], targetRole: string): ApolloPerson[] {
  return people.filter((p) => {
    if (!p.title) return false;
    return titleSimilarity(p.title, targetRole) >= 0.2;
  });
}

export type ApolloPerson = Record<string, unknown> & {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string | null;
  headline?: string | null;
  linkedin_url?: string | null;
  city?: string;
  country?: string;
  organization?: { name?: string };
  employment_history?: Array<{ current?: boolean; title?: string; organization_name?: string; start_date?: string | null }>;
  keywords?: string[];
  education?: Array<{ school_name?: string; degree?: string; graduation_year?: number }>;
};

function displayName(p: ApolloPerson): string {
  if (p.name) return p.name;
  const first = p.first_name ?? "";
  const last = p.last_name ?? p.last_name_obfuscated ?? "";
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function shapePerson(p: ApolloPerson): Candidate {
  const name = displayName(p);
  const history = p.employment_history ?? [];
  const prevJob = history.find((e) => !e.current);

  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    name,
    initials: initialsFromName(name),
    title: p.title ?? "Engineer",
    headline: p.headline ?? null,
    linkedinUrl: p.linkedin_url ?? null,
    location: [p.city, p.country].filter(Boolean).join(", ") || "Unknown",
    currentCompany: p.organization?.name ?? null,
    previousRole: prevJob ? `${prevJob.title} at ${prevJob.organization_name}` : null,
    skills: (p.keywords ?? []).slice(0, 8),
    education: p.education?.[0]
      ? `${p.education[0].school_name}${p.education[0].degree ? " — " + p.education[0].degree : ""}${p.education[0].graduation_year ? ", " + p.education[0].graduation_year : ""}`
      : null,
    apolloSource: true,
    votes: 0,
    novotes: 0,
    userVote: null,
    email: null,
  };
}

export async function searchApolloPeople(
  company: string,
  role: string,
  daysWindow = 90,
  page = 1,
  perPage = 10,
): Promise<{ people: ApolloPerson[]; source: "modern" | "legacy" }> {
  const titles = buildTitleVariants(role);
  const key = requireApolloKey();

  const modernParams = new URLSearchParams();
  titles.forEach((t) => modernParams.append("person_titles[]", t));
  modernParams.append("q_organization_name", company);
  modernParams.append("per_page", String(perPage));
  modernParams.append("page", String(page));

  try {
    const modernRes = await fetch(`${APOLLO_BASE}/mixed_people/api_search?${modernParams}`, {
      method: "POST",
      headers: apolloHeaders(key),
    });

    if (modernRes.ok) {
      const data = await modernRes.json();
      const people = (data.people ?? []) as ApolloPerson[];
      if (people.length > 0) return { people, source: "modern" };
    }
  } catch {
    // fall through to legacy search
  }

  const legacyRes = await fetch(`${APOLLO_LEGACY_BASE}/people/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify({
      api_key: key,
      q_organization_name: company,
      person_titles: titles,
      changed_jobs_within_days: daysWindow,
      page,
      per_page: perPage,
    }),
  });

  if (!legacyRes.ok) {
    const err = await legacyRes.text();
    throw new Error(`Apollo search failed (${legacyRes.status}): ${err.slice(0, 200)}`);
  }

  const legacyData = await legacyRes.json();
  return { people: (legacyData.people ?? []) as ApolloPerson[], source: "legacy" };
}

export async function enrichApolloPeople(ids: string[]): Promise<Map<string, ApolloPerson>> {
  const enriched = new Map<string, ApolloPerson>();
  if (ids.length === 0) return enriched;

  const res = await fetch(
    `${APOLLO_BASE}/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false`,
    {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify({ details: ids.slice(0, 10).map((id) => ({ id })) }),
    },
  );

  if (!res.ok) return enriched;

  const data = await res.json();
  for (const match of data.matches ?? []) {
    const person = match?.person as ApolloPerson | undefined;
    if (person?.id) enriched.set(person.id, person);
  }

  return enriched;
}
