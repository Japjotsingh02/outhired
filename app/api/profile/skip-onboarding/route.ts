import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { skipOnboarding } from "@/server/services/profile.service";

// POST /api/profile/skip-onboarding — marks the user onboarded (idempotent)
export const POST = handle(async () => {
  const { id } = await getSessionOrThrow();
  return NextResponse.json(await skipOnboarding(id));
});
