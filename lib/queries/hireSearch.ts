"use client";

import { useEffect } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";
import type { DBJob, SearchStatus } from "@/types";

/** What GET/POST /api/jobs/[id]/search returns (dates are ISO strings). */
export interface HireSearchSummary {
  searchStatus: SearchStatus;
  lastSearchedAt: string | null;
  nextSearchAllowedAt: string | null;
  candidateCount: number;
  searchError: string | null;
  searchTotalMatches: number | null;
  searchSkippedInternal: number | null;
}

export function hireSearchQueryOptions(userId: string, jobId: string) {
  return queryOptions({
    queryKey: queryKeys.hireSearch(userId, jobId),
    queryFn: ({ signal }) => apiFetch<HireSearchSummary>(`/api/jobs/${jobId}/search`, { signal }),
  });
}

/** Copies a search summary onto the job in the cached jobs list. */
function patchJob(job: DBJob, summary: HireSearchSummary): DBJob {
  return {
    ...job,
    searchStatus: summary.searchStatus,
    lastSearchedAt: summary.lastSearchedAt,
    nextSearchAllowedAt: summary.nextSearchAllowedAt,
    searchError: summary.searchError,
    searchTotalMatches: summary.searchTotalMatches,
    searchSkippedInternal: summary.searchSkippedInternal,
  };
}

/**
 * One read of the search state, only while the job says RUNNING (a search running in another tab,
 * or one whose request died). There is no polling: "Check again" reads it once more. When the state
 * leaves RUNNING the jobs list is re-read so the candidates appear.
 */
export function useHireSearchStatus(job: Pick<DBJob, "id" | "searchStatus">) {
  const queryClient = useQueryClient();
  const { userId, authenticated } = useAuthedUser();

  const query = useQuery({
    ...hireSearchQueryOptions(userId ?? "", job.id),
    enabled: authenticated && job.searchStatus === "RUNNING",
    retry: 0,
    refetchOnWindowFocus: false,
  });

  const summary = query.data;
  const finishedStatus = summary && summary.searchStatus !== "RUNNING" ? summary.searchStatus : null;
  useEffect(() => {
    if (finishedStatus && userId) void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
  }, [finishedStatus, userId, queryClient]);

  return {
    summary,
    checking: query.isFetching,
    checkAgain: () => void query.refetch(),
  };
}

/**
 * POST /api/jobs/[id]/search. The request runs the whole search, so the mutation's pending state is
 * the loading state. On success the status and the job in the list take the answer, and the list is
 * re-read so the new candidates show.
 */
export function useStartHireSearch(jobId: string) {
  const queryClient = useQueryClient();
  const { userId } = useAuthedUser();
  return useMutation({
    mutationFn: (companyWebsite?: string) =>
      apiFetch<HireSearchSummary>(`/api/jobs/${jobId}/search`, {
        method: "POST",
        body: JSON.stringify(companyWebsite ? { companyWebsite } : {}),
      }),
    onSuccess: (summary) => {
      if (!userId) return;
      queryClient.setQueryData(queryKeys.hireSearch(userId, jobId), summary);
      queryClient.setQueryData<DBJob[]>(queryKeys.jobs(userId), (jobs) =>
        jobs?.map((job) => (job.id === jobId ? patchJob(job, summary) : job)),
      );
    },
    // Success or failure, the job's state and candidates may have changed on the server.
    onSettled: () => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.usage(userId) });
    },
  });
}
