import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { prisma } from "@/server/db";

// POST /api/jobs/[id]/vote — vote on a candidate for this job
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { candidateId, type } = await req.json() as {
    candidateId: string;
    type: "YES" | "NO";
  };

  // Check candidate belongs to this job
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, jobId: id },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Upsert vote (toggle if same type)
  const existing = await prisma.vote.findUnique({
    where: { userId_candidateId: { userId: session.user.id, candidateId } },
  });

  if (existing && existing.type === type) {
    // Toggle off
    await prisma.vote.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: "removed" });
  }

  await prisma.vote.upsert({
    where: { userId_candidateId: { userId: session.user.id, candidateId } },
    create: { userId: session.user.id, candidateId, type },
    update: { type },
  });

  return NextResponse.json({ action: "voted", type });
}
