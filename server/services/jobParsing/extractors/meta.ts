import "server-only";
import type { ExtractionLayer } from "@/types/jobParsing";
import { decodeHtmlEntities, stripHtml } from "@/server/services/jobParsing/utils/html";
import { extractDomain, isJobBoard } from "@/server/services/jobParsing/utils/domain";
import { findPostedDate, toIsoDate } from "@/server/services/jobParsing/utils/dates";
import { emptyLayer } from "@/server/services/jobParsing/utils/layer";

// Strips site name suffix from page titles.
// Only splits on pipe — universally used as title/site separator.
// Dash handling removed — splitRoleAndTeam handles that separately.
function cleanTitle(value: string): string {
  const title = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (!title) return "";
  const pipe = title.lastIndexOf("|");
  return pipe > 0 ? title.slice(0, pipe).trim() : title;
}

// ─── Company extraction ──────────────────────────────────────────────────────
// A company name is a run of capitalised words (optionally joined by "of",
// "and", ...). Matching stops at the first lowercase word, so " in ", " at "
// and trailing lowercase words are never captured.
const NAME_WORD = "[A-Z0-9][\\w&.'’-]*";

const COMPANY_NAME = `${NAME_WORD}(?:\\s+(?:(?:of|and|for|the|de)\\s+)?${NAME_WORD})*`;

const HIRING_PATTERN = new RegExp(`^(${COMPANY_NAME})\\s+(?:is\\s+)?[Hh]iring\\b`);

const JOIN_PATTERN = new RegExp(`^[Jj]oin\\s+(${COMPANY_NAME})\\s+as\\b`);

const AT_PATTERN = new RegExp(`(?:\\b[Aa]t\\s+|@\\s*)(${COMPANY_NAME})`);

const SEPARATOR_PATTERN = new RegExp(
  `(?:\\s[-–—]\\s+|\\|\\s*)(${COMPANY_NAME})(?=\\s*(?:[-–—|·,]|$))`,
);

const NOT_A_COMPANY =
  /^(remote|hybrid|onsite|payments|growth|platform|data|mobile|engineering)$/i;

export function extractCompanyFromTitle(title: string): string | null {
  if (!title) return null;

  const withoutSuffix = title.includes("|")
    ? title.split("|").slice(0, -1).join("|").trim()
    : title;

  const hiring = withoutSuffix.match(HIRING_PATTERN);
  if (hiring?.[1]) return hiring[1].trim();

  const join = withoutSuffix.match(JOIN_PATTERN);
  if (join?.[1]) return join[1].trim();

  const at = withoutSuffix.match(AT_PATTERN);
  if (at?.[1]) return at[1].trim();

  const separator = withoutSuffix.match(SEPARATOR_PATTERN);
  if (separator?.[1]) {
    const candidate = separator[1].trim();
    if (!NOT_A_COMPANY.test(candidate)) return candidate;
  }

  return null;
}

function companyForDomain(domain: string): string | null {
  if (isJobBoard(domain)) return null;
  const slug = brandLabel(domain)?.replace(/-/g, " ").trim();
  return slug ? slug.replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
}

const GENERIC_SUBDOMAINS = new Set([
  "www", "careers", "career", "jobs", "job", "apply", "boards", "hire", "hiring",
  "work", "talent", "join", "recruiting", "recruit", "team", "people", "en",
]);

const SECOND_LEVEL_TLDS = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

/** Brand label of a hostname: "careers.stripe.com" -> "stripe", "acme.co.uk" -> "acme". */
function brandLabel(domain: string): string | null {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? null;
  // Drop the TLD (and a second-level TLD like co.uk), leaving brand + subdomains.
  const tldLength =
    parts.length >= 3 && parts[parts.length - 1].length === 2 &&
    SECOND_LEVEL_TLDS.has(parts[parts.length - 2])
      ? 2
      : 1;
  const labels = parts.slice(0, parts.length - tldLength);
  // The brand is the right-most label; subdomains like "careers" sit to its left.
  const brand = labels[labels.length - 1];
  if (brand && !GENERIC_SUBDOMAINS.has(brand)) return brand;
  return labels.find((label) => !GENERIC_SUBDOMAINS.has(label)) ?? null;
}

export function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const matcher = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(matcher)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

// ─── HTML readers ────────────────────────────────────────────────────────────
function getMetaContent(
  html: string,
  key: "name" | "property",
  expected: string,
): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = readAttributes(tag);
    if (
      attributes[key]?.toLowerCase() === expected.toLowerCase() &&
      attributes.content
    ) {
      return decodeHtmlEntities(attributes.content).trim() || null;
    }
  }
  return null;
}

export function getHtmlTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? decodeHtmlEntities(stripHtml(match[1])).trim() || null : null;
}

function getFirstH1(html: string): string | null {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
  return match ? decodeHtmlEntities(stripHtml(match[1])).trim() || null : null;
}

function getTimeDatetime(html: string): string | null {
  const match = html.match(
    /<time\b[^>]*\bdatetime\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/i,
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

// ─── Location utilities ──────────────────────────────────────────────────────
function findLocationNearLabel(text: string): string | null {
  const match = text.match(/\blocation\s*:\s*([^.;|]{2,100})/i);
  if (!match) return null;
  return match[1].trim();
}

// ─── Role utilities ──────────────────────────────────────────────────────────
// Splits "Senior PM — Payments" into role: "Senior PM", team: "Payments"
// If no separator found, returns full title as role and null as team
export function splitRoleAndTeam(title: string): {
  role: string;
  team: string | null;
} {
  if (!title.trim()) return { role: "", team: null };

  // Split on common role/team separators
  const match = title.match(
    /^(.+?)(?:\s*[—–]\s*|\s+-\s+|\s+\/\s+)(.+)$/,
  );
  if (!match) return { role: title.trim(), team: null };

  const role = match[1].trim();
  const rest = match[2].trim();

  // Only treat rest as team if it doesn't look like a location or work type
  const isNotTeam =
    rest.length === 0 ||
    rest.length > 50 ||
    /^(remote|hybrid|onsite|on-site|on site)$/i.test(rest);

  return {
    role,
    team: isNotTeam ? null : rest,
  };
}

export function extractFromMeta(html: string, url: string): ExtractionLayer {
  const ogTitle = getMetaContent(html, "property", "og:title");
  const htmlTitle = getHtmlTitle(html);
  const firstH1 = getFirstH1(html);
  const pageDomain = extractDomain(url);

  // Role — try og:title, <title>, <h1> in order
  let role: string | null = null;
  let team: string | null = null;
  for (const candidate of [ogTitle, htmlTitle, firstH1]) {
    const cleaned = candidate ? cleanTitle(candidate) : "";
    if (cleaned) {
      const split = splitRoleAndTeam(cleaned);
      role = split.role || null;
      team = split.team;
      break;
    }
  }

  // Company — on job boards og:site_name is the board itself ("LinkedIn"), so
  // the company comes only from a title pattern. Elsewhere og:site_name is
  // trusted, then the title pattern, then the domain.
  const titleCompany =
    extractCompanyFromTitle(ogTitle ?? "") ??
    extractCompanyFromTitle(htmlTitle ?? "");
  const company = isJobBoard(pageDomain)
    ? titleCompany
    : (getMetaContent(html, "property", "og:site_name") ??
      titleCompany ??
      companyForDomain(pageDomain));

  // Location — try meta tag then text near "Location:" label
  const bodyText = stripHtml(html);
  const location =
    getMetaContent(html, "name", "location") ?? findLocationNearLabel(bodyText);

  // Date — try article:published_time, <time datetime>, "posted X days ago"
  const datePosted =
    toIsoDate(getMetaContent(html, "property", "article:published_time")) ??
    toIsoDate(getTimeDatetime(html)) ??
    findPostedDate(bodyText);

  return {
    ...emptyLayer(),
    role,
    team,
    company,
    location,
    datePosted,
  };
}
