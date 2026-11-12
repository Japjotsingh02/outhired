import { NextRequest, NextResponse } from "next/server";
import { handle, readJsonBody } from "@/server/http";
import { getSessionOrThrow } from "@/server/security/auth";
import { getProfileView, updateProfileView } from "@/server/services/profile.service";
import { profileUpdateSchema } from "@/lib/schemas/profile";

// GET /api/profile — profile plus profileComplete, missing and onboarded
export const GET = handle(async () => {
  const { id } = await getSessionOrThrow();
  return NextResponse.json(await getProfileView(id));
});

// PUT /api/profile — update profile (also onboards the user); same shape as GET
export const PUT = handle(async (req: NextRequest) => {
  const { id } = await getSessionOrThrow();

  // A ZodError here becomes a 400 with the issue list (see handle()).
  const data = profileUpdateSchema.parse(await readJsonBody(req));

  return NextResponse.json(await updateProfileView(id, data));
});
