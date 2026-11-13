import "server-only";
import {
  getProfile,
  markOnboarded,
  updateProfile,
  type ProfileRow,
} from "@/server/repositories/users.repo";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { getProfileMissing, isProfileComplete } from "@/lib/profile";
import type { ProfileUpdate } from "@/lib/schemas/profile";
import { isRecordNotFound } from "@/lib/prismaErrors";

const SESSION_INVALID = "Your session is no longer valid. Please sign in again.";

/** What the API returns: profile fields plus derived flags. No onboardedAt, no secrets. */
export function toProfileView(row: ProfileRow) {
  // Destructured away on purpose: the timestamp itself is never exposed.
  const { onboardedAt, ...fields } = row;
  return {
    ...fields,
    profileComplete: isProfileComplete(row),
    missing: getProfileMissing(row),
    onboarded: onboardedAt !== null,
  };
}

export type ProfileView = ReturnType<typeof toProfileView>;

export async function getProfileView(userId: string): Promise<ProfileView> {
  const row = await getProfile(userId);
  if (!row) throw new NotFoundError("Profile not found");
  return toProfileView(row);
}

/** Saves the profile; saving also onboards the user (see updateProfile). */
export async function updateProfileView(
  userId: string,
  data: ProfileUpdate,
): Promise<ProfileView> {
  try {
    return toProfileView(await updateProfile(userId, data));
  } catch (err) {
    // P2025: the session is valid but the user row is gone.
    if (isRecordNotFound(err)) throw new UnauthorizedError(SESSION_INVALID);
    throw err;
  }
}

/** Idempotent: marks the user onboarded without requiring a profile. */
export async function skipOnboarding(userId: string): Promise<{ onboarded: true }> {
  const changed = await markOnboarded(userId);
  if (changed === 0 && !(await getProfile(userId))) {
    throw new UnauthorizedError(SESSION_INVALID);
  }
  return { onboarded: true };
}

/**
 * Guard for compare / gap analysis, the only features that need a complete
 * profile. Call it before any scraping, queueing or Claude call.
 * `load` is injectable so the rule can be tested without a database.
 */
export async function requireCompleteProfile(
  userId: string,
  load: (id: string) => Promise<ProfileRow | null> = getProfile,
): Promise<void> {
  const row = await load(userId);
  if (!row) throw new UnauthorizedError(SESSION_INVALID);

  const missing = getProfileMissing(row);
  if (missing.length > 0) {
    throw new ForbiddenError(
      "Complete your profile to compare",
      { missing },
      "PROFILE_INCOMPLETE",
    );
  }
}

/**
 * Where to send a user right after login or signup: /profile exactly once
 * (until onboardedAt is set), the dashboard afterwards.
 */
export async function getPostLoginPath(userId: string): Promise<string> {
  const row = await getProfile(userId);
  if (!row) return "/login";
  return row.onboardedAt === null ? "/profile" : "/";
}
