"use client";

import { useEffect, useState } from "react";
import { hashKey, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import {
  hireSearchRefetchInterval,
  isHavingTrouble,
  nextFailureCount,
  POLL_INTERVAL_MS,
  pollingExpired,
  type HireSearchSummary,
} from "@/lib/queries/hireSearchPolling";
import { queryKeys } from "@/lib/queries/keys";
import { useAuthedUser } from "@/lib/queries/session";
import type { DBJob } from "@/types";

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
    searchStartedAt: summary.searchStartedAt,
    lastSearchedAt: summary.lastSearchedAt,
    nextSearchAllowedAt: summary.nextSearchAllowedAt,
    searchError: summary.searchError,
  };
}

/**
 * Polls GET /api/jobs/[id]/search every 3 s while the search is RUNNING (the job says so, or the
 * last answer did) and the window has not passed. A failed poll never alerts: `trouble` turns on
 * only after 3 failures in a row and clears on the next success. When the search leaves RUNNING the
 * jobs list is re-read so the candidates appear.
 */
export function useHireSearch(job: Pick<DBJob, "id" | "searchStatus">) {
  const queryClient = useQueryClient();
  const { userId, authenticated } = useAuthedUser();
  // Set by "Check again" so polling gets a fresh window.
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [failures, setFailures] = useState(0);

  const query = useQuery({
    ...hireSearchQueryOptions(userId ?? "", job.id),
    enabled: authenticated && job.searchStatus === "RUNNING",
    // Fresh for one poll interval, so starting a search does not read the status twice in a row.
    staleTime: POLL_INTERVAL_MS,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => hireSearchRefetchInterval(q.state.data, Date.now(), checkedAt),
  });

  // Count consecutive failures from the cache's own success / error events. (errorUpdateCount only
  // ever grows, so it cannot tell "3 in a row" from "3 over the whole session".)
  const queryHash = userId ? hashKey(queryKeys.hireSearch(userId, job.id)) : null;
  useEffect(() => {
    if (!queryHash) return;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== queryHash) return;
      if (event.action.type === "success") setFailures((n) => nextFailureCount(n, "success"));
      else if (event.action.type === "error") setFailures((n) => nextFailureCount(n, "error"));
    });
  }, [queryClient, queryHash]);

  const summary = query.data;
  const running = (summary?.searchStatus ?? job.searchStatus) === "RUNNING";

  // RUNNING -> anything else: read the jobs list again so the new candidates show.
  const finishedStatus = summary && summary.searchStatus !== "RUNNING" ? summary.searchStatus : null;
  useEffect(() => {
    if (finishedStatus && userId) void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
  }, [finishedStatus, userId, queryClient]);

  return {
    summary,
    trouble: isHavingTrouble(failures),
    /** Polling stopped at the end of its window while the search still says RUNNING. */
    stalled: running && !!summary && pollingExpired(summary, query.dataUpdatedAt, checkedAt),
    /** The "Check again" button: a fresh window and an immediate read. */
    checkAgain: () => {
      setFailures(0);
      setCheckedAt(Date.now());
      void query.refetch();
    },
  };
}

/** POST /api/jobs/[id]/search. On success the status query holds the answer and the job shows RUNNING, which starts polling. */
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
      // A cache hit finishes at once: read the list again so the candidates appear.
      if (summary.searchStatus !== "RUNNING") void queryClient.invalidateQueries({ queryKey: queryKeys.jobs(userId) });
    },
  });
}
