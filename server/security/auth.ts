import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { UnauthorizedError } from "@/server/errors";

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user id, or null for a visitor. For public pages that only change a button or two. */
export async function getOptionalUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/** Returns the signed-in user from the NextAuth session or throws UnauthorizedError. */
export async function getSessionOrThrow(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new UnauthorizedError();
  return { id: session.user.id, email: session.user.email };
}
