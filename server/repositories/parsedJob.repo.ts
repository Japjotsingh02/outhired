import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db";
import { parseJobPosting } from "@/server/services/jobParsing";
import { JOB_PARSE_CACHE_MAX_AGE_MS } from "@/constants";
import { errorMessage } from "@/lib/errorMessage";

// Development-only switch: skips reading and writing the parse cache.
const cacheDisabled = () =>
  process.env.PARSE_CACHE_DISABLED === "true" && process.env.NODE_ENV !== "production";

let warnedCacheDisabled = false;

/** True when the cache is switched off; warns once per process the first time. */
function skipCache(): boolean {
  console.log(cacheDisabled(), 'check2');
  if (!cacheDisabled()) return false;
  if (!warnedCacheDisabled) {
    warnedCacheDisabled = true;
    console.warn("[parsedJob.repo] Parse cache disabled via PARSE_CACHE_DISABLED");
  }
  return true;
}

/**
 * Returns cached parsed-job data if it exists and is fresh,
 * otherwise returns null.
 */
export async function getFreshCachedJob(url: string): Promise<unknown | null> {
  if (skipCache()) return null;
  try {
    const row = await prisma.parsedJob.findUnique({ where: { url } });
    if (!row) return null;
    const age = Date.now() - row.parsedAt.getTime();
    return age >= 0 && age < JOB_PARSE_CACHE_MAX_AGE_MS ? row.data : null;
  } catch (err) {
    // Cache problems must not block parsing.
    console.error("[jobCache] Cache read failed:", errorMessage(err));
    return null;
  }
}

/** Writes or refreshes a parsed-job cache entry. Errors are logged, not thrown. */
export async function cacheParsedJob(
  url: string,
  data: Awaited<ReturnType<typeof parseJobPosting>>,
) {
  if (skipCache()) return;
  try {
    const json = data as unknown as Prisma.InputJsonValue;
    await prisma.parsedJob.upsert({
      where: { url },
      create: { url, data: json },
      update: { data: json, parsedAt: new Date() },
    });
  } catch (err) {
    console.error("[jobCache] Cache write failed:", errorMessage(err));
  }
}

/** Returns the empty shape used when parsing completely fails. */
export function emptyParsedJob(url: string) {
  return {
    url,
    company: null,
    role: null,
    location: null,
    datePosted: null,
    employmentType: null,
    skills: [] as string[],
    confidence: {
      role: "fallback" as const,
      company: "fallback" as const,
      datePosted: "fallback" as const,
    },
    failed: true,
    domain: "",
    team: null,
    seniority: "unknown" as const,
  };
}
