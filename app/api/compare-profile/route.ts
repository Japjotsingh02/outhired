import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { compareProfiles } from "@/lib/claude";
import { scrapeLinkedInProfile, formatProxycurlForComparison } from "@/lib/proxycurl";
import { prisma } from "@/server/db";
import { isUniqueViolation } from "@/lib/prismaErrors";

// ─── POST /api/compare-profile ────────────────────────────────────────────────
// Compares the logged-in user's profile against a candidate using Claude AI.
// Results are cached in ProfileMatch so repeat calls are free.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { candidateId, jobTitle } = (await req.json()) as {
    candidateId: string;
    jobTitle: string;
  };

  if (!candidateId || !jobTitle) {
    return NextResponse.json(
      { error: "candidateId and jobTitle required" },
      { status: 400 },
    );
  }

  // ── 1. Return cached result if available ────────────────────────────────────
  // One analysis per (user, candidate) pair — enforced by a unique constraint.
  const cached = await prisma.profileMatch.findUnique({
    where: { userId_candidateId: { userId: session.user.id, candidateId } },
  });

  if (cached) return NextResponse.json(cachedMatchResponse(cached));

  // ── 2. Load user + candidate ────────────────────────────────────────────────
  const [user, candidate] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.candidate.findUnique({ where: { id: candidateId } }),
  ]);

  if (!user || !candidate) {
    return NextResponse.json({ error: "User or candidate not found" }, { status: 404 });
  }

  if (!candidate.linkedinUrl) {
    return NextResponse.json(
      { error: "Candidate has no LinkedIn URL" },
      { status: 400 },
    );
  }

  // ── 3. Build profile texts ──────────────────────────────────────────────────
  const userProfileText = await resolveUserProfileText(user);
  const candidateProfileText = await resolveCandidateProfileText(candidate);

  // ── 4. Run Claude comparison ────────────────────────────────────────────────
  const result = await compareProfiles(userProfileText, candidateProfileText, jobTitle);

  // ── 5. Persist result ───────────────────────────────────────────────────────
  try {
    const saved = await prisma.profileMatch.create({
      data: {
        userId: session.user.id,
        candidateId,
        score: result.score,
        summary: result.summary,
        sharedStrengths: result.sharedStrengths,
        gaps: result.gaps,
        advice: result.advice,
      },
    });
    return NextResponse.json({ ...result, id: saved.id, cached: false });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A concurrent request saved this pair first: return that one.
    const existing = await prisma.profileMatch.findUnique({
      where: { userId_candidateId: { userId: session.user.id, candidateId } },
    });
    if (!existing) throw err;
    return NextResponse.json(cachedMatchResponse(existing));
  }
}

function cachedMatchResponse(match: {
  score: number;
  summary: string;
  sharedStrengths: string[];
  gaps: string[];
  advice: string;
}) {
  return {
    score: match.score,
    summary: match.summary,
    sharedStrengths: match.sharedStrengths,
    gaps: match.gaps,
    advice: match.advice,
    cached: true,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

type PrismaUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;
type PrismaCandidate = NonNullable<
  Awaited<ReturnType<typeof prisma.candidate.findUnique>>
>;

/** Builds a text representation of the user, preferring Proxycurl over manual fields. */
async function resolveUserProfileText(user: PrismaUser): Promise<string> {
  if (user.linkedinUrl) {
    const data = await scrapeLinkedInProfile(user.linkedinUrl);
    if (data) return formatProxycurlForComparison(data);
  }

  const lines = [`Name: ${user.name}`];
  if (user.headline) lines.push(`Headline: ${user.headline}`);
  if (user.experienceYrs) lines.push(`Experience: ${user.experienceYrs} years`);
  if (user.skills.length > 0) lines.push(`Skills: ${user.skills.join(", ")}`);
  if (user.resumeText) lines.push(`\nResume/Bio:\n${user.resumeText}`);
  return lines.join("\n");
}

/** Builds a text representation of the candidate, caching Proxycurl data on the way. */
async function resolveCandidateProfileText(candidate: PrismaCandidate): Promise<string> {
  // Use existing cached LinkedIn data if present
  if (candidate.linkedinData) {
    return formatProxycurlForComparison(
      candidate.linkedinData as Parameters<typeof formatProxycurlForComparison>[0],
    );
  }

  // Attempt a fresh Proxycurl scrape and cache the result
  if (candidate.linkedinUrl) {
    const data = await scrapeLinkedInProfile(candidate.linkedinUrl);
    if (data) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { linkedinData: data as object, lastScrapedAt: new Date() },
      });
      return formatProxycurlForComparison(data);
    }
  }

  // Fallback to structured DB fields
  const lines = [`Name: ${candidate.name}`, `Title: ${candidate.title}`];
  if (candidate.skills.length > 0) lines.push(`Skills: ${candidate.skills.join(", ")}`);
  if (candidate.previousRole) lines.push(`Previous: ${candidate.previousRole}`);
  return lines.join("\n");
}
