import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { UnauthorizedError } from "@/server/errors";

export interface SessionUser {
  id: string;
  email: string;
}

/** Returns the signed-in user from the NextAuth session or throws UnauthorizedError. */
export async function getSessionOrThrow(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new UnauthorizedError();
  return { id: session.user.id, email: session.user.email };
}
