import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { getUsage } from "@/server/services/billing/credits";

// GET /api/me/usage: the signed-in user's plan and what they have used.
export const GET = handle(async () => {
  const { id: userId } = await getSessionOrThrow();
  return NextResponse.json(await getUsage(userId));
});
