"use client";

import { useEffect, useRef } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchWithStatus } from "@/lib/apiClient";
import { withVote, type VoteVariables } from "@/lib/helpers";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";
import { toastError } from "@/components/ui/toast";
import type { DBJob, ParsedJob } from "@/types";

export function jobsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.jobs(userId),
    queryFn: ({ signal }) => apiFetch<DBJob[]>("/api/jobs", { signal }),
  });
}

/** The signed-in user's applications. Disabled until the session is authenticated. */
export function useJobs() {
  const { userId, authenticated } = useAuthedUser();
  return useQuery({ ...jobsQueryOptions(userId ?? ""), enabled: authenticated });
}

/**
 * Optimistic vote: the list updates at once, is rolled back with an error toast (and Retry) if the
 * server refuses, and is re-read when the call settles (which also swaps the placeholder vote ids).
 */
export function useVote() {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  const retryRef = useRef<(variables: VoteVariables) => void>(() => undefined);

  const mutation = useMutation({
    mutationFn: ({ jobId, candidateId, type }: VoteVariables) =>
      apiFetch<unknown>(`/api/jobs/${jobId}/vote`, { method: "POST", body: JSON.stringify({ candidateId, type }) }),
    onMutate: async (variables) => {
      if (!userId) return { previous: undefined };
      const key = queryKeys.jobs(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DBJob[]>(key);
      if (previous) queryClient.setQueryData<DBJob[]>(key, withVote(previous, userId, variables));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (userId && context?.previous) queryClient.setQueryData(queryKeys.jobs(userId), context.previous);
      toastError(error, { retry: () => retryRef.current(variables) });
    },
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
    },
  });

  const { mutate } = mutation;
  useEffect(() => {
    retryRef.current = mutate;
  }, [mutate]);

  return mutation;
}

export type ParsedJobResult = Omit<ParsedJob, "url"> & { url: string | null; companyDomain?: string | null };

/** POST /api/parse-job: reads a pasted description or link. Nothing is cached; the review form owns the result. */
export function useParseJob() {
  return useMutation({
    mutationFn: (body: { jobDescription: string } | { url: string }) =>
      apiFetch<ParsedJobResult>("/api/parse-job", { method: "POST", body: JSON.stringify(body) }),
  });
}

/**
 * POST /api/jobs. Resolves with the status too: 200 means the application already existed.
 * On success the job is put at the top of the cached list at once, and the list is re-read.
 */
export function useCreateJob() {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetchWithStatus<DBJob>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ data }) => {
      if (!userId) return;
      queryClient.setQueryData<DBJob[]>(queryKeys.jobs(userId), (current) => [
        data,
        ...(current ?? []).filter((existing) => existing.id !== data.id),
      ]);
    },
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
    },
  });
}
