import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { BadRequestError, ConflictError } from "@/server/errors";
import { handle, readJsonBody } from "@/server/http";
import bcrypt from "bcryptjs";

export const POST = handle(async (req: NextRequest) => {
  const body = await readJsonBody(req);
  const { email, password, name } = (body ?? {}) as {
    email: string;
    password: string;
    name: string;
  };

  if (!email || !password || !name) {
    throw new BadRequestError("email, password, and name are required");
  }

  if (password.length < 8) {
    throw new BadRequestError("Password must be at least 8 characters", {
      issues: [{ path: "password", message: "Password must be at least 8 characters" }],
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    throw new ConflictError("An account with this email already exists", {
      issues: [{ path: "email", message: "An account with this email already exists" }],
    }, "EMAIL_TAKEN");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
});
