import "server-only";
import { JOB_BOARD_DOMAINS } from "@/constants/jobParsing";

// ─── URL utilities ────────────────────────────────────────────────────────────
/** Accept a full URL, bare domain path, or numeric LinkedIn job ID. */
export function normalizeJobInput(input: string): string {
  const trimmed = input.trim();
  if (/^\d{8,}$/.test(trimmed)) {
    return `https://www.linkedin.com/jobs/view/${trimmed}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isJobBoard(domain: string): boolean {
  return JOB_BOARD_DOMAINS.some(
    (boardDomain) => domain === boardDomain || domain.endsWith(`.${boardDomain}`),
  );
}
