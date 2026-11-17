"use client";

import { useState } from "react";
import { normalizeCompanyDomain } from "@/lib/domain";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { UsageNote } from "@/components/UsageNote";
import { getErrorMessage, isApiError } from "@/lib/apiClient";
import { isUpgradeCode } from "@/lib/plans";
import { formatDay } from "@/lib/hireSearch";
import { useHireSearchStatus, useStartHireSearch } from "@/lib/queries/hireSearch";
import type { DBJob, SearchStatus } from "@/types";

interface HireSearchPanelProps {
  job: DBJob;
  /** The candidate list; shown when the job has candidates. */
  children: React.ReactNode;
}

/** Drives the candidates tab: start a search (the request runs it), and show each state inline. */
export function HireSearchPanel({ job, children }: HireSearchPanelProps) {
  const search = useHireSearchStatus(job);
  const start = useStartHireSearch(job.id);
  const [website, setWebsite] = useState(job.domain ?? "");
  const [fieldError, setFieldError] = useState("");

  // The latest answer from the search API wins over the job in the list until the list is re-read.
  const summary = search.summary;
  const status: SearchStatus = summary?.searchStatus ?? job.searchStatus;
  const lastSearchedAt = summary ? summary.lastSearchedAt : (job.lastSearchedAt ?? null);
  const nextAllowedAt = summary ? summary.nextSearchAllowedAt : (job.nextSearchAllowedAt ?? null);
  // A failed start/retry (an ApiError) is shown in the panel until the next attempt.
  const searchError: unknown = start.error ?? (summary ? summary.searchError : (job.searchError ?? null));
  const searchErrorText = searchError === null ? null : getErrorMessage(searchError);
  const hasCandidates = job.candidates.length > 0;
  const busy = start.isPending;
  const errorCode = isApiError(searchError) ? searchError.code : typeof searchError === "string" ? searchError : null;
  const hitPlanLimit = isUpgradeCode(errorCode);
  const totalMatches = summary ? summary.searchTotalMatches : (job.searchTotalMatches ?? null);
  const skippedInternal = summary ? summary.searchSkippedInternal : (job.searchSkippedInternal ?? null);
  const shown = job.candidates.length;

  function startSearch(companyWebsite?: string) {
    start.mutate(companyWebsite);
  }

  function submitWebsite(event: React.FormEvent) {
    event.preventDefault();
    const domain = normalizeCompanyDomain(website);
    if (!domain) {
      setFieldError("Enter a website like stripe.com");
      return;
    }
    setFieldError("");
    startSearch(domain);
  }

  const lastChecked = formatDay(lastSearchedAt);
  const canSearchAgain = nextAllowedAt === null;

  return (
    <div className="animate-fade-in">
      {(busy || status === "RUNNING") && (
        <div className="card" role="status" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div
            className="animate-spin-slow"
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid rgba(196,92,62,0.3)",
              borderTopColor: "#C45C3E",
              flexShrink: 0,
            }}
          />
          <p style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
            {busy ? "Looking for people who joined…" : "A search is already in progress."}
          </p>
          {!busy && (
            <button className="btn-ghost" type="button" disabled={search.checking} onClick={search.checkAgain}>
              {search.checking ? "Checking…" : "Check again"}
            </button>
          )}
        </div>
      )}

      {status === "FAILED" && !busy && (
        hitPlanLimit ? (
          <div style={{ marginBottom: 16 }}>
            <InlineAlert action={{ label: "Upgrade to Pro", href: "/pricing" }}>{searchErrorText}</InlineAlert>
          </div>
        ) : (
          <div className="card" role="alert" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--red)", marginBottom: 10 }}>{searchErrorText ?? getErrorMessage("PROVIDER_FAILED")}</p>
            <button className="btn-ghost" type="button" disabled={busy} onClick={() => startSearch()}>
              {busy ? "Retrying…" : "Retry"}
            </button>
            <UsageNote feature="hireSearch" />
          </div>
        )
      )}

      {status === "NOT_STARTED" && !busy && (
        <form className="card" onSubmit={submitWebsite} noValidate style={{ marginBottom: 16 }}>
          <label className="field-label" htmlFor="hire-website">Company website</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="hire-website"
              className="input"
              placeholder="stripe.com"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Starting…" : "Find hires"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Used to find people who joined. Example: stripe.com
          </p>
          {!hasCandidates && <UsageNote feature="hireSearch" />}
          {fieldError && (
            <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>
              {fieldError}
            </p>
          )}
          {!fieldError && searchErrorText && (
            hitPlanLimit ? (
              <div style={{ marginTop: 10 }}>
                <InlineAlert action={{ label: "Upgrade to Pro", href: "/pricing" }}>{searchErrorText}</InlineAlert>
              </div>
            ) : (
              <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>
                {searchErrorText}
              </p>
            )
          )}
        </form>
      )}

      {status === "DONE" && !busy && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {lastChecked ? `Last checked ${lastChecked}` : "Checked"}
              {totalMatches !== null && totalMatches > shown ? ` · Showing ${shown} of ${totalMatches} matches` : ""}
            </p>
            {skippedInternal !== null && skippedInternal > 0 && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {skippedInternal} internal role {skippedInternal === 1 ? "change" : "changes"} hidden
              </p>
            )}
          </div>
          {canSearchAgain && (
            <button className="btn-ghost" type="button" disabled={busy} onClick={() => startSearch()}>
              {busy ? "Starting…" : "Search again"}
            </button>
          )}
          {start.error !== null &&
            (hitPlanLimit ? (
              <div style={{ width: "100%" }}>
                <InlineAlert action={{ label: "Upgrade to Pro", href: "/pricing" }}>{getErrorMessage(start.error)}</InlineAlert>
              </div>
            ) : (
              <p role="alert" style={{ color: "var(--red)", fontSize: 12, width: "100%" }}>
                {getErrorMessage(start.error)}
              </p>
            ))}
        </div>
      )}

      {hasCandidates ? (
        children
      ) : status === "DONE" && !busy ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            border: "1px dashed var(--border)",
            borderRadius: 2,
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No hires found yet</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Recent months are often missing from our data, so check again later.
          </p>
        </div>
      ) : null}
    </div>
  );
}
