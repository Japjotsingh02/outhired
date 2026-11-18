"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import type { UsageSummary } from "@/lib/plans";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";

export function usageQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.usage(userId),
    queryFn: ({ signal }) => apiFetch<UsageSummary>("/api/me/usage", { signal }),
  });
}

/** The user's plan and usage. A search or Compare invalidates it. */
export function useUsage() {
  const { userId, authenticated } = useAuthedUser();
  return useQuery({ ...usageQueryOptions(userId ?? ""), enabled: authenticated });
}
