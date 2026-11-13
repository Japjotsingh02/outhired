"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";
import type { ProfileMatchResult } from "@/types";

export interface CompareVariables {
  candidateId: string;
  jobTitle: string;
}

/** POST /api/compare-profile. A success is kept under the match key (the server caches it too). */
export function useCompareProfile() {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  return useMutation({
    mutationFn: (variables: CompareVariables) =>
      apiFetch<ProfileMatchResult>("/api/compare-profile", { method: "POST", body: JSON.stringify(variables) }),
    onSuccess: (result, { candidateId }) => {
      if (userId) queryClient.setQueryData(queryKeys.match(userId, candidateId), result);
    },
  });
}
