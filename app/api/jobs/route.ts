import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { prisma } from "@/server/db";
import { seedCandidatesFromApollo, JOB_WITH_CANDIDATES_INCLUDE } from "@/server/services/candidates";
import { CreateJobSchema } from "@/lib/schemas";
import { parseYearMonth, postedMonthToDate } from "@/lib/postedMonth";
import { seniorityFromRole } from "@/server/services/seniority";
import { isUniqueViolation } from "@/lib/prismaErrors";

// ─── GET /api/jobs ────────────────────────────────────────────────────────────
// Returns all tracked jobs (with candidates + votes) for the logged-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    include: JOB_WITH_CANDIDATES_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(jobs);
}

// ─── POST /api/jobs ───────────────────────────────────────────────────────────
// Creates a new tracked job, then fires an Apollo search to seed candidates.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    console.error("[jobs/POST] Invalid JSON body:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsedBody = CreateJobSchema.safeParse(raw);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  const body = parsedBody.data;

  // datePosted is "YYYY-MM-01" (validated); store the 1st of the month at UTC midnight.
  const postedMonth = postedMonthToDate(parseYearMonth(body.datePosted)!);
  const { company, role } = body;
  const userId = session.user.id;

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
      include: JOB_WITH_CANDIDATES_INCLUDE,
    });
    if (!existing) throw err;
    return NextResponse.json(existing, { status: 200 });
  }

  // Apollo search is best-effort — a failure must not block the job creation.
  try {
    await seedCandidatesFromApollo(job.id, company, role, postedMonth);
  } catch (err) {
    console.error("[jobs/POST] Apollo seed failed:", err);
  }

  const jobWithCandidates = await prisma.job.findUnique({
    where: { id: job.id },
    include: JOB_WITH_CANDIDATES_INCLUDE,
  });

  return NextResponse.json(jobWithCandidates, { status: 201 });
}
