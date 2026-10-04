"use client";

import { DBCandidate, DBJob, UserProfile } from "@/types";
import { SkillChip, SectionLabel } from "@/components/ui";

interface GapAnalysisProps {
  job: DBJob;
  top: DBCandidate;
  profile: UserProfile;
}

/** Three-column skill comparison + experience row between the user and the top candidate. */
export function GapAnalysis({ top, profile }: GapAnalysisProps) {
  const mySkills = profile.skills ?? [];
  const shared = mySkills.filter((s) => top.skills.includes(s));
  const theirUnique = top.skills.filter((s) => !mySkills.includes(s));
  const myUnique = mySkills.filter((s) => !top.skills.includes(s));

  const skillColumns = [
    {
      label: "Shared skills",
      items: shared,
      style: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", color: "#4ADE80" },
    },
    {
      label: "They had",
      items: theirUnique,
      style: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", color: "#F87171" },
    },
    {
      label: "You have",
      items: myUnique,
      style: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", color: "#93C5FD" },
    },
  ];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      className="animate-fade-in"
    >
      {/* You vs Top candidate overview */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "#D98B73",
            }}
          >
            {top.initials}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>You vs. {top.name}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{top.title}</p>
          </div>
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 8,
          }}
        >
          {["Signal", "You", "Hired"].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Experience row */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ComparisonRow
            label="Experience"
            you={`${profile.experienceYrs ?? "?"} yrs`}
            them="~4 yrs"
            isGap={true}
          />
        </div>
      </div>

      {/* Skill columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {skillColumns.map((col) => (
          <div key={col.label} className="card">
            <SectionLabel>{col.label}</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {col.items.length > 0 ? (
                col.items.map((s) => (
                  <SkillChip
                    key={s}
                    skill={s}
                    bg={col.style.bg}
                    border={col.style.border}
                    color={col.style.color}
                  />
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>None</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tip card */}
      <div
        className="card"
        style={{ borderColor: "rgba(196,92,62,0.2)", background: "rgba(196,92,62,0.04)" }}
      >
        <p
          style={{
            fontSize: 11,
            color: "#D98B73",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Tip
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Use the{" "}
          <strong style={{ color: "var(--text-primary)" }}>Match my profile</strong>{" "}
          button on the Candidates tab to get an AI-powered comparison against this specific hire.
        </p>
      </div>
    </div>
  );
}

/* ── Internal sub-components ─────────────────────────────────────────────── */

function ComparisonRow({
  label,
  you,
  them,
  isGap,
}: {
  label: string;
  you: string;
  them: string;
  isGap: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        background: isGap ? "rgba(239,68,68,0.05)" : "rgba(34,197,94,0.05)",
        border: `1px solid ${isGap ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)"}`,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, color: isGap ? "#F87171" : "#4ADE80" }}>{you}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{them}</span>
    </div>
  );
}
