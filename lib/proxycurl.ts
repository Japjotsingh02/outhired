// Proxycurl LinkedIn scraping utility
// Caches results in-memory for 1 hour to avoid repeat charges
import { PROXYCURL_CACHE_TTL_MS } from "@/constants";

interface ProxycurlProfile {
  full_name?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  location?: string;
  experiences?: Array<{
    company?: string;
    title?: string;
    description?: string;
    starts_at?: { year?: number; month?: number };
    ends_at?: { year?: number; month?: number } | null;
  }>;
  education?: Array<{
    school?: string;
    degree_name?: string;
    field_of_study?: string;
    starts_at?: { year?: number };
    ends_at?: { year?: number } | null;
  }>;
  skills?: Array<{ name: string }>;
  accomplishment_projects?: Array<{ title?: string; description?: string }>;
}

// Simple in-memory cache: url -> { data, expiresAt }
const cache = new Map<string, { data: ProxycurlProfile; expiresAt: number }>();

export async function scrapeLinkedInProfile(
  linkedinUrl: string,
): Promise<ProxycurlProfile | null> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    console.warn("[Proxycurl] PROXYCURL_API_KEY not set — returning null");
    return null;
  }

  // Check cache
  const cached = cache.get(linkedinUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = new URL("https://nubela.co/proxycurl/api/v2/linkedin");
  url.searchParams.set("url", linkedinUrl);
  url.searchParams.set("skills", "include");
  url.searchParams.set("use_cache", "if-present");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Proxycurl] Error ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const data = (await res.json()) as ProxycurlProfile;

  // Store in cache
  cache.set(linkedinUrl, { data, expiresAt: Date.now() + PROXYCURL_CACHE_TTL_MS });

  return data;
}

export function formatProxycurlForComparison(profile: ProxycurlProfile): string {
  const lines: string[] = [];

  if (profile.full_name) lines.push(`Name: ${profile.full_name}`);
  if (profile.headline) lines.push(`Headline: ${profile.headline}`);
  if (profile.summary) lines.push(`\nSummary:\n${profile.summary}`);

  if (profile.experiences && profile.experiences.length > 0) {
    lines.push("\nExperience:");
    profile.experiences.slice(0, 5).forEach((exp) => {
      const start = exp.starts_at?.year ?? "?";
      const end = exp.ends_at?.year ?? "Present";
      lines.push(`  - ${exp.title ?? "Unknown role"} at ${exp.company ?? "Unknown"} (${start}–${end})`);
      if (exp.description) lines.push(`    ${exp.description.slice(0, 150)}...`);
    });
  }

  if (profile.education && profile.education.length > 0) {
    lines.push("\nEducation:");
    profile.education.slice(0, 3).forEach((edu) => {
      lines.push(`  - ${edu.degree_name ?? ""} ${edu.field_of_study ?? ""} at ${edu.school ?? "Unknown"}`);
    });
  }

  if (profile.skills && profile.skills.length > 0) {
    lines.push(`\nSkills: ${profile.skills.slice(0, 20).map((s) => s.name).join(", ")}`);
  }

  return lines.join("\n");
}
