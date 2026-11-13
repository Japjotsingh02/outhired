import { z } from "zod";

/** Parses `value` as a URL and returns it only when it is https/http and passes `check`. */
function isUrl(value: string, protocols: string[], check: (url: URL) => boolean): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && check(url);
  } catch {
    return false;
  }
}

const hostIs = (url: URL, host: string) =>
  url.hostname === host || url.hostname === `www.${host}`;

// linkedin.com, www.linkedin.com, or a regional host such as uk.linkedin.com / in.linkedin.com.
const LINKEDIN_HOST = /^(?:www\.|[a-z]{2,3}\.)?linkedin\.com$/;

/**
 * Returns the canonical form "https://www.linkedin.com/in/<slug>" for any
 * https LinkedIn profile URL (regional host, query string, hash or trailing
 * slash included), or null when the value is not a LinkedIn profile URL.
 */
export function normalizeLinkedinUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !LINKEDIN_HOST.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/in\/([^/]+)\/?$/);
  return match ? `https://www.linkedin.com/in/${match[1]}` : null;
}

const linkedinUrl = z
  .string()
  .trim()
  .max(300)
  .transform((value, ctx) => {
    const normalized = normalizeLinkedinUrl(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a LinkedIn profile URL like https://linkedin.com/in/yourname",
      });
      return z.NEVER;
    }
    return normalized;
  });

const githubUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) =>
      isUrl(value, ["https:"], (url) => hostIs(url, "github.com") && /^\/[A-Za-z0-9-]+\/?$/.test(url.pathname)),
    "Enter a GitHub profile URL like https://github.com/yourname",
  );

const portfolioUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => isUrl(value, ["http:", "https:"], () => true),
    "Enter a full http(s) URL for your portfolio",
  );

/** Fields that accept null; an empty (or whitespace-only) string means "clear it". */
const NULLABLE_FIELDS = [
  "headline",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "resumeText",
  "experienceYrs",
] as const;

function emptyStringsToNull(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const result: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const field of NULLABLE_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value.trim() === "") result[field] = null;
  }
  return result;
}

/** Body of PUT /api/profile. Every field is optional; unknown keys are rejected. */
export const profileUpdateSchema = z.preprocess(
  emptyStringsToNull,
  z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      headline: z.string().trim().max(200).nullable().optional(),
      linkedinUrl: linkedinUrl.nullable().optional(),
      githubUrl: githubUrl.nullable().optional(),
      portfolioUrl: portfolioUrl.nullable().optional(),
      resumeText: z.string().max(30000).nullable().optional(),
      skills: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
      experienceYrs: z.number().min(0).max(60).nullable().optional(),
    })
    .strict(),
);
export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
