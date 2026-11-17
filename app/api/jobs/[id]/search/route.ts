import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handle, readOptionalJsonBody } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { refreshHireSearch, startHireSearchForJob } from "@/server/services/hireSearch";

type Context = { params: Promise<{ id: string }> };

// The search runs inside the request: one provider call, then the result is saved.
export const maxDuration = 30;

// An empty body is allowed: the job's saved domain is used.
const startBodySchema = z.object({ companyWebsite: z.string().trim().max(300).optional() }).strict();

// POST /api/jobs/[id]/search: runs (or reuses) a "who joined" search and returns the final state.
export const POST = handle(async (req: NextRequest, { params }: Context) => {
  const user = await getSessionOrThrow();
  const { id } = await params;

  const body = startBodySchema.parse(await readOptionalJsonBody(req));

  const summary = await startHireSearchForJob(user, id, { domain: body.companyWebsite });
  return NextResponse.json(summary);
});

// GET /api/jobs/[id]/search: the current state of the job's search.
export const GET = handle(async (_req: NextRequest, { params }: Context) => {
  const { id: userId } = await getSessionOrThrow();
  const { id } = await params;
  return NextResponse.json(await refreshHireSearch(userId, id));
});
