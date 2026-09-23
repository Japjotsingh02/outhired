import { DBCandidate, DBVote } from "@/types";

/** Derive initials from a full name. */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Aggregate vote counts for a candidate. */
export function voteCounts(candidate: DBCandidate, userId: string) {
  const yes = candidate.votes.filter((v: DBVote) => v.type === "YES").length;
  const no = candidate.votes.filter((v: DBVote) => v.type === "NO").length;
  const userVote = candidate.votes.find((v: DBVote) => v.userId === userId);
  return { yes, no, userVote: userVote?.type ?? null };
}

/** Compute confidence label + colour tokens from yes/no vote counts. */
export function confidenceData(yes: number, no: number) {
  const total = yes + no;
  const pct = total > 0 ? Math.round((yes / total) * 100) : 0;

  if (pct >= 70)
    return {
      pct,
      total,
      label: "High confidence",
      bg: "var(--green-soft)",
      text: "var(--green)",
      bar: "var(--green)",
    };

  if (pct >= 40)
    return {
      pct,
      total,
      label: "Likely match",
      bg: "var(--yellow-soft)",
      text: "var(--yellow)",
      bar: "var(--yellow)",
    };

  if (total > 0)
    return {
      pct,
      total,
      label: "Unconfirmed",
      bg: "var(--accent-soft)",
      text: "var(--text-secondary)",
      bar: "var(--accent)",
    };

  return {
    pct: 0,
    total: 0,
    label: "No votes yet",
    bg: "var(--bg-elevated)",
    text: "var(--text-muted)",
    bar: "var(--border-strong)",
  };
}

/** Sort candidates by net yes-minus-no score, descending. */
export function sortCandidatesByVotes(candidates: DBCandidate[]): DBCandidate[] {
  return [...candidates].sort((a, b) => {
    const score = (c: DBCandidate) =>
      c.votes.filter((v) => v.type === "YES").length -
      c.votes.filter((v) => v.type === "NO").length;
    return score(b) - score(a);
  });
}
