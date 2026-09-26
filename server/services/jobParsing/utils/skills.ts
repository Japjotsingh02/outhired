import "server-only";
import { ParsedJob } from "@/types";
import { SKILL_PATTERNS } from "@/constants/jobParsing";

// ─── Inference ────────────────────────────────────────────────────────────────
export function inferSeniority(text: string): ParsedJob["seniority"] {
  const t = text.toLowerCase();
  if (/\bstaff\b|\bprincipal\b/.test(t)) return "staff";
  if (/\bsenior\b|\bsr\.?\b|\blead\b/.test(t)) return "senior";
  if (/\bjunior\b|\bjr\.?\b|\bentry[\s-]level\b|\bnew\s+grad\b/.test(t))
    return "junior";
  if (/\bmid[\s-]level\b|\blevel\s+ii\b/.test(t)) return "mid";
  return "unknown";
}

export function extractSkills(text: string): string[] {
  return Object.entries(SKILL_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
}
