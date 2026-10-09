import { NextRequest, NextResponse } from "next/server";
import { handle, readJsonBody } from "@/server/http";
import { NotFoundError } from "@/server/errors";
import { getSessionOrThrow } from "@/server/security/auth";
import { prisma } from "@/server/db";

// POST /api/jobs/[id]/vote — vote on a candidate for this job
export const POST = handle(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const { id: userId } = await getSessionOrThrow();

  const { candidateId, type } = await readJsonBody(req) as {
    candidateId: string;
    type: "YES" | "NO";
  };

  // Check candidate belongs to this job
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, jobId: id },
  });

  if (!candidate) throw new NotFoundError("Candidate not found");

  // Upsert vote (toggle if same type)
  const existing = await prisma.vote.findUnique({
    where: { userId_candidateId: { userId, candidateId } },
  });

  if (existing && existing.type === type) {
    // Toggle off
    await prisma.vote.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: "removed" });
  }

  await prisma.vote.upsert({
    where: { userId_candidateId: { userId, candidateId } },
    create: { userId, candidateId, type },
    update: { type },
  });

  return NextResponse.json({ action: "voted", type });
});
