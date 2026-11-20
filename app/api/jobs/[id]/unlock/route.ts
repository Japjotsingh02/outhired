import { NextRequest, NextResponse } from "next/server";
import { NotFoundError } from "@/server/errors";
import { handle } from "@/server/http";
import { findOwnedSearchJob } from "@/server/repositories/jobs.repo";
import { getSessionOrThrow } from "@/server/security/auth";
import { unlockForUser } from "@/server/services/billing/credits";

type Context = { params: Promise<{ id: string }> };

// POST /api/jobs/[id]/unlock: spends credits to show more of the people already found for this job.
export const POST = handle(async (_req: NextRequest, { params }: Context) => {
  const { id: userId } = await getSessionOrThrow();
  const { id } = await params;
  if (!(await findOwnedSearchJob(userId, id))) throw new NotFoundError("Job not found");
  const result = await unlockForUser(userId, id);
  return NextResponse.json({
    unlockedCount: result.unlockedCount,
    newlyUnlocked: result.newlyUnlocked,
    lockedCount: result.lockedCount,
  });
});
