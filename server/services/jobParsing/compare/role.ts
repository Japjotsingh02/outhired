import "server-only";
import {
  LEVEL_NUMERALS,
  ROLE_ABBREVIATIONS,
  ROLE_FILLER_WORDS,
  ROLE_PHRASES,
  SENIORITY_WORDS,
} from "@/constants/jobParsing";

// ─── Comparison ──────────────────────────────────────────────────────────────
const ASCII_PUNCTUATION = /[!-\/:-@\[-`{-~]+/g;

function lookup(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

export function wordsOf(text: string): string[] {
  return text.replace(ASCII_PUNCTUATION, " ").split(/\s+/).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest phrases first so "front-end" is tried before shorter overlaps.
const PHRASE_RULES = Object.entries(ROLE_PHRASES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, replacement]) => ({
    pattern: new RegExp(
      /^[a-z]/.test(phrase) ? `\\b${escapeRegExp(phrase)}\\b` : escapeRegExp(phrase),
      "g",
    ),
    replacement: ` ${replacement} `,
  }));

function applyRolePhrases(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PHRASE_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Canonical form of a role title: a set of seniority words and a set of the
 * remaining words.
 *
 * Phrases are applied once to the whole string, then every token is expanded
 * once via ROLE_ABBREVIATIONS. Each expansion is itself passed through the
 * phrase rules (but never re-expanded), so the pipeline is single-pass and
 * cannot loop: "VP" and "Vice President" both end up as the token "vp".
 */
export function normalizeRole(role: string): { seniority: Set<string>; words: Set<string> } {
  const tokens: string[] = [];
  for (const token of wordsOf(applyRolePhrases(role.toLowerCase()))) {
    const expansion = lookup(ROLE_ABBREVIATIONS, token);
    if (expansion) tokens.push(...wordsOf(applyRolePhrases(expansion)));
    else tokens.push(token);
  }

  const seniority = new Set<string>();
  const words = new Set<string>();
  for (const raw of tokens) {
    const token = lookup(LEVEL_NUMERALS, raw) ?? raw;
    if (ROLE_FILLER_WORDS.has(token)) continue;
    (SENIORITY_WORDS.has(token) ? seniority : words).add(token);
  }
  return { seniority, words };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

/** Team is not compared: callers pass roles already split from their team. */
export function rolesMatch(a: string, b: string): boolean {
  const left = normalizeRole(a);
  const right = normalizeRole(b);
  const seniorityCompatible =
    left.seniority.size === 0 ||
    right.seniority.size === 0 ||
    sameSet(left.seniority, right.seniority);
  return seniorityCompatible && sameSet(left.words, right.words);
}
