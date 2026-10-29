"use client";

import { SEARCH_STEPS } from "@/constants/searchLog";
import { getErrorMessage } from "@/lib/apiClient";
import { formatDay } from "@/lib/hireSearch";
import { DBJob } from "@/types";

interface SearchLogPanelProps {
  job: DBJob;
}

/** Shows how the hire search worked for this job and where it stands. */
export function SearchLogPanel({ job }: SearchLogPanelProps) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      className="animate-fade-in"
    >
      {/* Pipeline steps */}
      <div className="card">
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          How this search worked
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SEARCH_STEPS.map((s) => (
            <PipelineStep
              key={s.step}
              icon={s.icon}
              step={s.step}
              desc={s.getDesc(job)}
            />
          ))}
        </div>
      </div>

      {/* Search status */}
      <div className="card">
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Search status
        </p>
        <p style={{ fontSize: 13 }}>{STATUS_LABELS[job.searchStatus]}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {formatDay(job.lastSearchedAt) ? `Last checked ${formatDay(job.lastSearchedAt)}` : "Not checked yet"}
          {" · Source: new-hire database"}
        </p>
        {job.searchStatus === "FAILED" && (
          <p style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{getErrorMessage(job.searchError ?? "PROVIDER_FAILED")}</p>
        )}
      </div>
    </div>
  );
}

const STATUS_LABELS = {
  NOT_STARTED: "Not started",
  RUNNING: "Looking for people who joined…",
  DONE: "Done",
  FAILED: "Failed",
} as const;

/* ── Internal sub-components ─────────────────────────────────────────────── */

function PipelineStep({
  icon,
  step,
  desc,
}: {
  icon: string;
  step: string;
  desc: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{step}</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          {desc}
        </p>
      </div>
    </div>
  );
}
