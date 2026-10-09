import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errorMessage";
import { companyDomainFromJobUrl } from "@/lib/domain";
import {
  extractSkills,
  extractWithAI,
  inferSeniority,
  normalizeJobInput,
  parseJobPosting,
} from "@/server/services/jobParsing";
import { handle } from "@/server/http";
import {
  AppError,
  BadRequestError,
  RateLimitedError,
  ServiceUnavailableError,
} from "@/server/errors";
import { checkRateLimit } from "@/server/security/rateLimit";import {
  isSafeUrl,
  fetchHtmlSafely,
  getClientIp,
} from "@/server/security/ssrf";
import {
  getFreshCachedJob,
  cacheParsedJob,
  emptyParsedJob,
} from "@/server/repositories/parsedJob.repo";

// Accepts either a job URL or raw job-description text and returns structured
// job data (role, company, skills, etc.).  Parsed URLs are cached for 7 days.
export const POST = handle(async (req: NextRequest) => {
  // ── Rate limiting ───────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  let limit: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    limit = await checkRateLimit(ip);
  } catch (err) {
    console.error(
      "[parse-job] Rate limiter unavailable:",
      errorMessage(err),
    );
    throw new ServiceUnavailableError("Rate limiter unavailable");
  }
  if (limit.limited) {
    throw new RateLimitedError("Too many requests", undefined, "RATE_LIMITED", limit.retryAfterSeconds);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await req.json();
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch (err) {
    // Invalid JSON → treat as an empty body.
    console.error(
      "[parse-job] Invalid JSON body:",
      errorMessage(err),
    );
  }

  // ── Path A: free-text job description ──────────────────────────────────────
  const description =
    typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
  if (description) {
    return handleDescriptionMode(description);
  }

  // ── Path B: job URL ─────────────────────────────────────────────────────────
  const rawUrl =
    typeof body.url === "string"
      ? body.url
      : typeof body.jobId === "string"
        ? body.jobId
        : "";

  if (!rawUrl.trim()) return NextResponse.json(emptyParsedJob(""));

  const url = normalizeJobInput(rawUrl);
  if (!(await isSafeUrl(url))) throw new BadRequestError("Invalid URL");

  console.log(url, 'check1');

  const cached = await getFreshCachedJob(url);
  if (cached !== null) return NextResponse.json(withCompanyDomain(cached, url));

  let html = "";
  let finalUrl = url;
  let invalidRedirect = false;
  try {
    const page = await fetchHtmlSafely(url);
    invalidRedirect = page.invalidRedirect === true;
    html = page.html;
    finalUrl = page.finalUrl;
  } catch (err) {
    // Network failure — parse with empty HTML (the AI layer can still fetch the page).
    console.error(
      "[parse-job] Page fetch failed:",
      errorMessage(err),
    );
  }
  if (invalidRedirect) throw new BadRequestError("Invalid URL");

  let data:
    | Awaited<ReturnType<typeof parseJobPosting>>
    | ReturnType<typeof emptyParsedJob>;
  try {
    data = await parseJobPosting(html, finalUrl);
  } catch (err) {
    console.error(
      "[parse-job] Parsing crashed:",
      errorMessage(err),
    );
    data = emptyParsedJob(url);
  }

  // A failed parse (AI needed and unavailable) must never be cached.
  if (!data.failed)
    await cacheParsedJob(
      url,
      data as Awaited<ReturnType<typeof parseJobPosting>>,
    );
  return NextResponse.json(withCompanyDomain(data, finalUrl));
});

/** Adds the company website domain derived from the page URL; it is never cached with the parse. */
function withCompanyDomain<T>(data: T, pageUrl: string) {
  return { ...data, companyDomain: companyDomainFromJobUrl(pageUrl) };
}

/* ── Path A handler ───────────────────────────────────────────────────────── */

async function handleDescriptionMode(description: string) {
  if (description.length > 30_000) {
    throw new AppError(413, "TOO_LARGE", "Job description must be 30,000 characters or fewer.");
  }

  const outcome = await extractWithAI("", description);
  const ai = outcome.ok ? outcome.data : null;

  // No regex fallbacks: anything Gemini cannot find stays null and the
  // confirmation screen collects it from the user.
  const role = ai?.role ?? null;
  const company = ai?.company ?? null;
  const datePosted = ai?.datePosted ?? null;
  const skills = [
    ...new Set([...extractSkills(description), ...(ai?.skills ?? [])]),
  ];

  return NextResponse.json({
    company,
    role,
    location: ai?.location ?? null,
    datePosted,
    employmentType: null,
    skills,
    confidence: {
      role: role ? "ai" : "fallback",
      company: company ? "ai" : "fallback",
      datePosted: datePosted ? "ai" : "fallback",
    },
    failed: !outcome.ok,
    team: ai?.team ?? null,
    seniority: inferSeniority(`${role ?? ""} ${description}`),
  });
}
