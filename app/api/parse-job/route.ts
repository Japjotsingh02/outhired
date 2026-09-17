import { NextRequest, NextResponse } from "next/server";
import {
  extractSkills,
  extractWithAI,
  inferSeniority,
  normalizeJobInput,
  parseJobPosting,
} from "@/server/services/jobParsing";
import { isRateLimited } from "@/server/security/rateLimit";
import { isSafeUrl, fetchHtmlSafely, getClientIp } from "@/server/security/ssrf";
import {
  getFreshCachedJob,
  cacheParsedJob,
  emptyParsedJob,
} from "@/server/repositories/parsedJob.repo";

// Accepts either a job URL or raw job-description text and returns structured
// job data (role, company, skills, etc.).  Parsed URLs are cached for 7 days.
export async function POST(req: NextRequest) {
  // ── Rate limiting ───────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch (err) {
    console.error("[parse-job] Rate limiter unavailable:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Rate limiter unavailable" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await req.json();
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch (err) {
    // Invalid JSON → treat as an empty body.
    console.error("[parse-job] Invalid JSON body:", err instanceof Error ? err.message : err);
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
  if (!(await isSafeUrl(url))) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const cached = await getFreshCachedJob(url);
  if (cached !== null) return NextResponse.json(cached);

  let html = "";
  let finalUrl = url;
  try {
    const page = await fetchHtmlSafely(url);
    if (page.invalidRedirect) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    html = page.html;
    finalUrl = page.finalUrl;
  } catch (err) {
    // Network failure — parse with empty HTML (the AI layer can still fetch the page).
    console.error("[parse-job] Page fetch failed:", err instanceof Error ? err.message : err);
  }

  let data: Awaited<ReturnType<typeof parseJobPosting>> | ReturnType<typeof emptyParsedJob>;
  try {
    data = await parseJobPosting(html, finalUrl);
  } catch (err) {
    console.error("[parse-job] Parsing crashed:", err instanceof Error ? err.message : err);
    data = emptyParsedJob(url);
  }

  // A failed parse (AI needed and unavailable) must never be cached.
  if (!data.failed) await cacheParsedJob(url, data as Awaited<ReturnType<typeof parseJobPosting>>);
  return NextResponse.json(data);
}

/* ── Path A handler ───────────────────────────────────────────────────────── */

async function handleDescriptionMode(description: string) {
  if (description.length > 30_000) {
    return NextResponse.json(
      { error: "Job description must be 30,000 characters or fewer." },
      { status: 413 },
    );
  }

  const outcome = await extractWithAI("", description);
  const ai = outcome.ok ? outcome.data : null;

  // No regex fallbacks: anything Gemini cannot find stays null and the
  // confirmation screen collects it from the user.
  const role = ai?.role ?? null;
  const company = ai?.company ?? null;
  const datePosted = ai?.datePosted ?? null;
  const skills = [...new Set([...extractSkills(description), ...(ai?.skills ?? [])])];

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
