import "server-only";
import {
  LEVEL_NUMERALS,
  ROLE_ABBREVIATIONS,
  ROLE_PHRASES,
  SENIORITY_WORDS,
} from "@/constants/jobParsing";

const MAX_KEYWORDS = 4;
const MIN_LENGTH = 3;
const MAX_LENGTH = 64;
const FILLER = new Set(["the", "of", "and", "for", "a", "an", "in", "at", "to"]);

// A single one of these matches far too many unrelated titles to be a useful filter.
const GENERIC_SINGLE_WORDS = new Set([
  "manager", "engineer", "developer", "director", "lead", "analyst", "specialist",
  "associate", "consultant", "officer", "executive", "designer", "scientist",
  "administrator", "coordinator", "representative", "assistant", "architect",
  "head", "president", "partner", "owner", "member", "staff",
]);

function own(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function isLevelToken(token: string): boolean {
  return /^\d+$/.test(token) || own(LEVEL_NUMERALS, token) !== undefined;
}

/**
 * Title keywords for the provider's jobTitles filter: the core phrase with
 * seniority words and level numerals removed, an abbreviation-expanded form,
 * a phrase-normalised form, and the last two words. Up to 4, 3-64 chars each,
 * never a lone generic word. Returns [] when nothing usable remains.
 */
export function buildTitleKeywords(role: string): string[] {
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

  const core = tokens.filter((token) => !isSeniority(token) && !isLevelToken(token));
  if (core.length === 0) return [];

  const coreText = core.join(" ");
  const expanded = core.map((token) => own(ROLE_ABBREVIATIONS, token) ?? token).join(" ");
  let phrased = expanded;
  for (const [phrase, replacement] of Object.entries(ROLE_PHRASES)) {
    phrased = phrased.split(phrase).join(replacement);
  }

  const candidates = [coreText, expanded, phrased];
  const words = coreText.split(" ");
  if (words.length >= 3) {
    const lastTwo = words.slice(-2);
    if (!lastTwo.some((word) => FILLER.has(word))) candidates.push(lastTwo.join(" "));
  }

  const result: string[] = [];
  for (const raw of candidates) {
    const keyword = raw.replace(/\s+/g, " ").trim();
    if (keyword.length < MIN_LENGTH || keyword.length > MAX_LENGTH) continue;
    if (!keyword.includes(" ") && GENERIC_SINGLE_WORDS.has(keyword)) continue;
    if (!result.includes(keyword)) result.push(keyword);
    if (result.length === MAX_KEYWORDS) break;
  }
  return result;
}
