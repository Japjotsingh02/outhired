"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";
import type { UserProfile } from "@/types";

export function profileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.profile(userId),
    queryFn: ({ signal }) => apiFetch<UserProfile>("/api/profile", { signal }),
  });
}

/** The signed-in user's profile. Disabled until the session is authenticated. */
export function useProfile() {
  const { userId, authenticated } = useAuthedUser();
  return useQuery({ ...profileQueryOptions(userId ?? ""), enabled: authenticated });
}

/** PUT /api/profile. On success the profile query holds the saved profile. */
export function useSaveProfile() {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<UserProfile>("/api/profile", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (saved) => {
      if (!userId) return;
      queryClient.setQueryData(queryKeys.profile(userId), saved);
      // Earlier comparisons were made against the old profile (and profileComplete may have changed).
      queryClient.removeQueries({ queryKey: queryKeys.matches(userId) });
    },
  });
}

/** POST /api/profile/skip-onboarding. Failure is the caller's toast. */
export function useSkipOnboarding() {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  return useMutation({
    mutationFn: () => apiFetch<unknown>("/api/profile/skip-onboarding", { method: "POST" }),
    onSuccess: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });
}
