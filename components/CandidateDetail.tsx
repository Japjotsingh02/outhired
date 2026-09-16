"use client";

import { DBCandidate, DBJob } from "@/types";
import { voteCounts, confidenceData } from "@/lib/helpers";
import {
  CandidateAvatar,
  Badge,
  SkillChip,
  LinkedInLink,
  VoteButton,
  MatchProfileButton,
  ConfidenceBar,
} from "@/components/ui";

interface CandidateDetailProps {
  candidate: DBCandidate;
  job: DBJob;
  userId: string;
  onBack: () => void;
  onVote: (type: "YES" | "NO") => void;
  onMatch: () => void;
}

/** Full-page detail view for a single candidate. */
export function CandidateDetail({
  candidate: c,
  userId,
  onBack,
  onVote,
  onMatch,
}: CandidateDetailProps) {
  const { yes, no, userVote } = voteCounts(c, userId);
  const cd = confidenceData(yes, no);

  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
          fontSize: 13,
          color: "var(--text-secondary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        ← Back to candidates
      </button>

      {/* Main card */}
      <div className="card" style={{ marginBottom: 12 }}>
        {/* Header: avatar + name + badges */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <CandidateAvatar initials={c.initials} size={50} />

          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</span>
              {c.apolloSource && (
                <Badge label="Apollo data" bg="var(--bg-elevated)" color="var(--text-secondary)" />
              )}
              <Badge
                label={`${cd.label} · ${cd.pct}%`}
                bg={cd.bg}
                color={cd.text}
                fontSize={11}
              />
            </div>

            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.title}</p>

            {c.previousRole && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Previously: {c.previousRole}
              </p>
            )}

            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {c.location ?? "Location not listed"}
            </p>

            {c.linkedinUrl && (
              <LinkedInLink url={c.linkedinUrl} label="View LinkedIn profile →" size={12} iconSize={16} />
            )}
          </div>
        </div>

        {/* Headline quote */}
        {c.headline && (
          <div
            style={{
              borderLeft: "2px solid rgba(196,92,62,0.4)",
              paddingLeft: 12,
              marginBottom: 14,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              "{c.headline}"
            </p>
          </div>
        )}

        {/* Skills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {c.skills.map((s) => (
            <SkillChip key={s} skill={s} />
          ))}
        </div>

        {/* Education / Current company */}
        <InfoGrid
          items={[
            { label: "Education", value: c.education ?? "Not listed" },
            { label: "Current company", value: c.currentCompany ?? "Unknown" },
          ]}
        />

        {/* Confidence + vote actions */}
        <div style={{ paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            <span>{yes} of {cd.total} users think this is the hire</span>
            <span>{cd.pct}%</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <ConfidenceBar pct={cd.pct} bar={cd.bar} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <VoteButton
              id="detail-vote-yes"
              active={userVote === "YES"}
              activeStyle={{
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.3)",
                color: "#4ADE80",
              }}
              onClick={() => onVote("YES")}
              label={`Yes, this is them · ${yes}`}
            />
            <VoteButton
              id="detail-vote-no"
              active={userVote === "NO"}
              activeStyle={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#F87171",
              }}
              onClick={() => onVote("NO")}
              label={`Not them · ${no}`}
            />
            <MatchProfileButton
              id="detail-match-btn"
              hasLinkedIn={!!c.linkedinUrl}
              onClick={onMatch}
              size="md"
            />
          </div>
        </div>
      </div>

      {/* LinkedIn reach-out prompt */}
      {c.linkedinUrl && (
        <LinkedInReachOut name={c.name} url={c.linkedinUrl} />
      )}
    </div>
  );
}

/* ── Internal sub-components ─────────────────────────────────────────────── */

function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 14,
      }}
    >
      {items.map((r) => (
        <div
          key={r.label}
          style={{
            padding: "10px 14px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 2,
            border: "1px solid var(--border)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            {r.label}
          </p>
          <p style={{ fontSize: 13, fontWeight: 500 }}>{r.value}</p>
        </div>
      ))}
    </div>
  );
}

function LinkedInReachOut({ name, url }: { name: string; url: string }) {
  const firstName = name.split(" ")[0];
  return (
    <div
      className="card"
      style={{
        background: "rgba(10,102,194,0.05)",
        borderColor: "rgba(10,102,194,0.2)",
        marginBottom: 12,
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "#60A5FA",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        Reach out on LinkedIn
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        Message {firstName} to ask about interview rounds, timeline, and what
        helped them get the offer.
      </p>
      <LinkedInLink url={url} label={`Message ${firstName} →`} size={12} iconSize={16} />
    </div>
  );
}
