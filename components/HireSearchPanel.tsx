"use client";

import { useState } from "react";
import { normalizeCompanyDomain } from "@/lib/domain";
import { getErrorMessage } from "@/lib/apiClient";
import { formatDay } from "@/lib/hireSearch";
import { useHireSearch, useStartHireSearch } from "@/lib/queries/hireSearch";
import type { DBJob, SearchStatus } from "@/types";

interface HireSearchPanelProps {
  job: DBJob;
  /** The candidate list; shown when the job has candidates. */
  children: React.ReactNode;
}

/** Drives the candidates tab: start a search, poll while it runs, and show each state inline. */
export function HireSearchPanel({ job, children }: HireSearchPanelProps) {
  const search = useHireSearch(job);
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
  const stalled = search.stalled;
  const trouble = search.trouble;

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
      {status === "RUNNING" && (
        <div className="card" role="status" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {!stalled && (
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
          )}
          <p style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
            {stalled
              ? "This is taking longer than usual."
              : trouble
                ? "Having trouble updating. Still trying…"
                : "Looking for people who joined…"}
          </p>
          {stalled && (
            <button className="btn-ghost" type="button" onClick={search.checkAgain}>
              Check again
            </button>
          )}
        </div>
      )}

      {status === "FAILED" && (
        <div className="card" role="alert" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "var(--red)", marginBottom: 10 }}>{searchErrorText ?? getErrorMessage("PROVIDER_FAILED")}</p>
          <button className="btn-ghost" type="button" disabled={busy} onClick={() => startSearch()}>
            {busy ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {status === "NOT_STARTED" && (
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
          {(fieldError || searchErrorText) && (
            <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>
              {fieldError || searchErrorText}
            </p>
          )}
        </form>
      )}

      {status === "DONE" && (
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
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {lastChecked ? `Last checked ${lastChecked}` : "Checked"}
          </p>
          {canSearchAgain && (
            <button className="btn-ghost" type="button" disabled={busy} onClick={() => startSearch()}>
              {busy ? "Starting…" : "Search again"}
            </button>
          )}
          {start.error !== null && (
            <p role="alert" style={{ color: "var(--red)", fontSize: 12, width: "100%" }}>
              {getErrorMessage(start.error)}
            </p>
          )}
        </div>
      )}

      {hasCandidates ? (
        children
      ) : status === "DONE" ? (
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
