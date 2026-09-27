"use client";

import { APOLLO_API_KEY_HINT, APOLLO_STEPS } from "@/constants/apolloLog";
import { DBJob } from "@/types";

interface ApolloLogPanelProps {
  job: DBJob;
}

/** Shows how the Apollo search pipeline worked for this job. */
export function ApolloLogPanel({ job }: ApolloLogPanelProps) {
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
          {APOLLO_STEPS.map((s) => (
            <PipelineStep
              key={s.step}
              icon={s.icon}
              step={s.step}
              desc={s.getDesc(job)}
            />
          ))}
        </div>
      </div>

      {/* API key hint */}
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
          Set Apollo API key
        </p>
        <code style={{ fontSize: 12, color: "#60A5FA", fontFamily: "monospace" }}>
          {APOLLO_API_KEY_HINT}
        </code>
      </div>
    </div>
  );
}

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
