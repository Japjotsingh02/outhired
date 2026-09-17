import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { prisma } from "@/server/db";

// GET /api/profile — fetch current user's profile
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      linkedinUrl: true,
      resumeText: true,
      skills: true,
      experienceYrs: true,
      headline: true,
    },
  });

  return NextResponse.json(user);
}

// PUT /api/profile — update profile
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { linkedinUrl, resumeText, skills, experienceYrs, headline, name } = body as {
    linkedinUrl?: string;
    resumeText?: string;
    skills?: string[];
    experienceYrs?: number;
    headline?: string;
    name?: string;
  };

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name && { name }),
      ...(linkedinUrl !== undefined && { linkedinUrl }),
      ...(resumeText !== undefined && { resumeText }),
      ...(skills !== undefined && { skills }),
      ...(experienceYrs !== undefined && { experienceYrs }),
      ...(headline !== undefined && { headline }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      linkedinUrl: true,
      resumeText: true,
      skills: true,
      experienceYrs: true,
      headline: true,
    },
  });

  return NextResponse.json(updated);
}
