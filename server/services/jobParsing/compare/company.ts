import "server-only";
import { wordsOf } from "@/server/services/jobParsing/compare/role";

const LEGAL_SUFFIXES = new Set(["inc", "ltd", "llc", "corp", "pvt", "limited"]);

/** Strict: lowercase, strip punctuation, strip only trailing legal suffixes. */
export function normalizeCompany(name: string): string {
  const tokens = wordsOf(name.toLowerCase());
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function companiesMatch(a: string, b: string): boolean {
  return normalizeCompany(a) === normalizeCompany(b);
}
