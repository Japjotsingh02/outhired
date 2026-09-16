"use client";

import { DBCandidate, DBJob } from "@/types";
import { voteCounts, confidenceData } from "@/lib/helpers";
import {
  CandidateAvatar,
  Badge,
  SkillChip,
  ConfidenceRow,
  LinkedInLink,
  VoteButton,
  MatchProfileButton,
} from "@/components/ui";

interface CandidateListProps {
  candidates: DBCandidate[];
  job: DBJob;
  userId: string;
  onVote: (candidateId: string, type: "YES" | "NO") => void;
  onOpen: (candidateId: string) => void;
  onMatch: (candidate: DBCandidate) => void;
}

/** Renders a scrollable list of candidate cards or an empty state. */
export function CandidateList({
  candidates,
  job,
  userId,
  onVote,
  onOpen,
  onMatch,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return <EmptyCandidates company={job.company} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {candidates.map((candidate, i) => (
        <CandidateCard
          key={candidate.id}
          candidate={candidate}
          userId={userId}
          index={i}
          onVote={onVote}
          onOpen={onOpen}
          onMatch={onMatch}
        />
      ))}
    </div>
  );
}

/* ── Internal sub-components ─────────────────────────────────────────────── */

function EmptyCandidates({ company }: { company: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 20px",
        border: "1px dashed var(--border)",
        borderRadius: 2,
      }}
    >
      <p style={{ fontSize: 36, marginBottom: 12 }}>🔍</p>
      <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
        No candidates found yet
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        We searched Apollo for people at {company} who match this role.
        <br />
        Results appear here when Apollo returns matches.
      </p>
    </div>
  );
}

function CandidateCard({
  candidate: c,
  userId,
  index,
  onVote,
  onOpen,
  onMatch,
}: {
  candidate: DBCandidate;
  userId: string;
  index: number;
  onVote: (id: string, type: "YES" | "NO") => void;
  onOpen: (id: string) => void;
  onMatch: (c: DBCandidate) => void;
}) {
  const { yes, no, userVote } = voteCounts(c, userId);
  const cd = confidenceData(yes, no);
  const isTop = index === 0 && yes > 2;

  return (
    <div
      className="card card-hover animate-fade-in"
      style={{
        borderColor: isTop ? "rgba(34,197,94,0.2)" : "var(--border)",
        animationDelay: `${index * 0.05}s`,
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <CandidateAvatar initials={c.initials} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + badges */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 3,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
            {isTop && (
              <Badge
                label="Top match"
                bg="rgba(34,197,94,0.1)"
                color="#4ADE80"
              />
            )}
            {c.apolloSource && (
              <Badge
                label="Apollo data"
                bg="var(--bg-elevated)"
                color="var(--text-secondary)"
              />
            )}
          </div>

          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>
            {c.title} {c.previousRole ? `· ${c.previousRole}` : ""}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {c.location ?? "Location not listed"}
          </p>
          {c.linkedinUrl && (
            <LinkedInLink url={c.linkedinUrl} label="View on LinkedIn →" size={11} iconSize={14} />
          )}
        </div>

        <Badge label={cd.label} bg={cd.bg} color={cd.text} fontSize={11} />
      </div>

      {/* Confidence bar */}
      <ConfidenceRow
        yes={yes}
        total={cd.total}
        pct={cd.pct}
        bar={cd.bar}
        label={cd.label}
      />

      {/* Skills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
        {c.skills.slice(0, 5).map((s) => (
          <SkillChip key={s} skill={s} />
        ))}
        {c.skills.length > 5 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "3px 0" }}>
            +{c.skills.length - 5}
          </span>
        )}
      </div>

      {/* Actions */}
      <div
        className="candidate-actions"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* Vote buttons */}
        <div style={{ display: "flex", gap: 6 }}>
          <VoteButton
            id={`vote-yes-${c.id}`}
            active={userVote === "YES"}
            activeStyle={{
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.3)",
              color: "#4ADE80",
            }}
            onClick={() => onVote(c.id, "YES")}
            label={`Yes · ${yes}`}
          />
          <VoteButton
            id={`vote-no-${c.id}`}
            active={userVote === "NO"}
            activeStyle={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#F87171",
            }}
            onClick={() => onVote(c.id, "NO")}
            label={`No · ${no}`}
          />
        </div>

        {/* View + match */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            id={`open-candidate-${c.id}`}
            onClick={() => onOpen(c.id)}
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Full profile →
          </button>
          <MatchProfileButton
            id={`match-profile-${c.id}`}
            hasLinkedIn={!!c.linkedinUrl}
            onClick={() => onMatch(c)}
          />
        </div>
      </div>
    </div>
  );
}
