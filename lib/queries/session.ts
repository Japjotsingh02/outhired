"use client";

import { useSession } from "next-auth/react";

/** The signed-in user. Queries are enabled only when `authenticated`, and their keys include `userId`. */
export function useAuthedUser(): { userId: string; authenticated: true } | { userId: null; authenticated: false } {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  if (status === "authenticated" && userId) return { userId, authenticated: true };
  return { userId: null, authenticated: false };
}
