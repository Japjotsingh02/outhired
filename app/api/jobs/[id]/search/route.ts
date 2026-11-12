import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handle, readOptionalJsonBody } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { refreshHireSearch, startHireSearchForJob } from "@/server/services/hireSearch";

type Context = { params: Promise<{ id: string }> };

// An empty body is allowed: the job's saved domain is used.
const startBodySchema = z.object({ companyWebsite: z.string().trim().max(300).optional() }).strict();

// POST /api/jobs/[id]/search: starts (or reuses) a "who joined" search; returns at once.
export const POST = handle(async (req: NextRequest, { params }: Context) => {
  const user = await getSessionOrThrow();
  const { id } = await params;

  const body = startBodySchema.parse(await readOptionalJsonBody(req));

  const summary = await startHireSearchForJob(user, id, { domain: body.companyWebsite });
  return NextResponse.json(summary);
});

// GET /api/jobs/[id]/search: checks a running search and ingests the results once.
export const GET = handle(async (_req: NextRequest, { params }: Context) => {
  const { id: userId } = await getSessionOrThrow();
  const { id } = await params;
  return NextResponse.json(await refreshHireSearch(userId, id));
});
