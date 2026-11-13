import "server-only";
import { Prisma } from "../../generated/prisma";
import { prisma } from "@/server/db";
import type { ProfileUpdate } from "@/lib/schemas/profile";

// Internal row shape. onboardedAt is needed by services but must never reach the
// client (profile.service strips it). Never add passwordHash or linkedinData.
const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  headline: true,
  linkedinUrl: true,
  githubUrl: true,
  portfolioUrl: true,
  resumeText: true,
  skills: true,
  experienceYrs: true,
  onboardedAt: true,
} as const satisfies Prisma.UserSelect;

export type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

export function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT,
  });
}

/**
 * Updates the profile. In the same atomic update it:
 *  - clears the scraped profile (linkedinData) when the LinkedIn URL actually
 *    changes, so it is re-fetched for the new URL;
 *  - sets onboardedAt to now() when it is currently null.
 *
 * The user row is locked (FOR UPDATE) inside one transaction, so concurrent
 * updates are serialised and cannot act on a stale read.
 * Throws Prisma P2025 if the user no longer exists.
 */
export function updateProfile(userId: string, data: ProfileUpdate) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { linkedinUrl: true, onboardedAt: true },
    });
    // A missing user is left to update() below, which throws P2025.
    const clearScrapedProfile =
      data.linkedinUrl !== undefined &&
      current !== null &&
      current.linkedinUrl !== data.linkedinUrl;
    const markOnboardedNow = current !== null && current.onboardedAt === null;

    return tx.user.update({
      where: { id: userId },
      data: {
        ...data,
        ...(clearScrapedProfile && { linkedinData: Prisma.DbNull }),
        ...(markOnboardedNow && { onboardedAt: new Date() }),
      },
      select: PROFILE_SELECT,
    });
  });
}

/**
 * Sets onboardedAt = now() only when it is null (idempotent).
 * Returns how many rows changed: 0 means already onboarded or no such user.
 */
export async function markOnboarded(userId: string): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  return result.count;
}
