import { NextRequest, NextResponse } from "next/server";
import { handle, readJsonBody } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { prisma } from "@/server/db";
import { jobWithCandidatesInclude } from "@/server/repositories/jobs.repo";
import { lockedCountFor } from "@/server/services/billing/credits";
import { nextSearchAllowedAt, startHireSearchForJob } from "@/server/services/hireSearch";
import { AppError } from "@/server/errors";
import { CreateJobSchema } from "@/lib/schemas";
import { parseYearMonth, postedMonthToDate } from "@/lib/postedMonth";
import { seniorityFromRole } from "@/server/services/seniority";
import { isUniqueViolation } from "@/lib/prismaErrors";

// Creating a job with a company website also runs the hire search inside this request.
export const maxDuration = 30;

/** Drops the internal total and says how many found people are still locked (never who). */
function withLockedCount<T extends { _count: { candidates: number }; candidates: unknown[] }>(job: T) {
  const { _count, ...rest } = job;
  return { ...rest, lockedCount: lockedCountFor(_count.candidates, job.candidates.length) };
}

// ─── GET /api/jobs ────────────────────────────────────────────────────────────
// Returns all tracked jobs (with candidates + votes) for the logged-in user.
export const GET = handle(async () => {
  const { id: userId } = await getSessionOrThrow();

  const jobs = await prisma.job.findMany({
    where: { userId },
    include: jobWithCandidatesInclude(userId),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    jobs.map((job) => ({
      ...withLockedCount(job),
      nextSearchAllowedAt: nextSearchAllowedAt(job.lastSearchedAt, job.searchStatus),
    })),
  );
});

// ─── POST /api/jobs ───────────────────────────────────────────────────────────
// Creates a new tracked job, then runs a hire search to seed candidates.
export const POST = handle(async (req: NextRequest) => {
  const { id: userId, email } = await getSessionOrThrow();

  // A ZodError here becomes a 400 with the issue list (see handle()).
  const body = CreateJobSchema.parse(await readJsonBody(req));

  // datePosted is "YYYY-MM-01" (validated); store the 1st of the month at UTC midnight.
  const postedMonth = postedMonthToDate(parseYearMonth(body.datePosted)!);
  const { company, role } = body;

  let job;
  try {
    job = await prisma.job.create({
      data: {
        userId,
        company,
        role,
        url: body.sourceUrl,
        team: body.team || null,
        // Never trust a client-supplied seniority: derive it from the role.
        seniority: seniorityFromRole(role),
        location: body.location || null,
        domain: body.domain ?? null,
        skills: body.skills,
        inputMode: body.inputMode,
        postedMonth,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Idempotent: the same application already exists, so return it.
    const existing = await prisma.job.findUnique({
      where: { userId_company_role_postedMonth: { userId, company, role, postedMonth } },
      include: jobWithCandidatesInclude(userId),
    });
    if (!existing) throw err;
    return NextResponse.json(withLockedCount(existing), { status: 200 });
  }

  // Hire discovery is best-effort: the job is already saved, so a search that cannot
  // start (private beta, no token, daily limit) is reported by code, not as a failure.
  let searchStartError: string | null = null;
  if (body.domain) {
    try {
      await startHireSearchForJob({ id: userId, email }, job.id);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      searchStartError = err.code;
    }
  }

  const jobWithCandidates = await prisma.job.findUnique({
    where: { id: job.id },
    include: jobWithCandidatesInclude(userId),
  });

  return NextResponse.json(
    jobWithCandidates && searchStartError
      ? { ...withLockedCount(jobWithCandidates), searchError: searchStartError }
      : jobWithCandidates && withLockedCount(jobWithCandidates),
    { status: 201 },
  );
});
