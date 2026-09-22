"use client";

import { DBJob } from "@/types";
import { STATUS_STYLE } from "@/constants";
import { voteCounts, confidenceData, sortCandidatesByVotes } from "@/lib/helpers";
import { Badge } from "@/components/ui";

interface DashboardOverviewProps {
  userName: string;
  jobs: DBJob[];
  userId: string;
  onSelectJob: (jobId: string) => void;
  onAddJob: () => void;
  onOpenCandidate: (jobId: string, candidateId: string) => void;
  onCompare: (jobId: string, candidateId: string) => void;
}

export function DashboardOverview({
  userName,
  jobs,
  userId,
  onSelectJob,
  onAddJob,
  onOpenCandidate,
  onCompare,
}: DashboardOverviewProps) {
  const firstName = userName.split(" ")[0] || userName;
  const interviewing = jobs.filter((j) => j.status === "INTERVIEWING").length;
  const rejected = jobs.filter((j) => j.status === "REJECTED").length;
  const active = jobs.filter((j) => j.status === "PENDING" || j.status === "INTERVIEWING").length;

  const featured = findFeaturedHire(jobs, userId);
  const greeting = greetingForNow();

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Dashboard · {greeting}
          </p>
          <h1 className="editorial" style={{ fontSize: 36, lineHeight: 1.1, marginBottom: 8 }}>
            {greeting.split(",")[0]}, {firstName}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Here is the current shape of your search.
          </p>
        </div>
        <button id="dash-add-job" className="btn-primary" onClick={onAddJob}>
          Add application
        </button>
      </div>

      {featured ? (
        <div className="card" style={{ marginBottom: 32, padding: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            Potential hire found
          </p>
          <h2 className="editorial" style={{ fontSize: 32, marginBottom: 8 }}>
            {featured.candidate.name}
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 14 }}>
            {featured.candidate.title} · {featured.job.company}
          </p>
          <Badge
            label={`${featured.cd.pct}% community confidence`}
            bg="var(--accent)"
            color="#f4efe6"
            fontSize={10}
          />
          <div
            style={{
              borderLeft: "2px solid var(--accent)",
              paddingLeft: 12,
              margin: "16px 0 18px",
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {featured.yes} yes votes · {featured.no} no votes. Community-confirmed signal, not a guaranteed outcome.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn-ghost"
              onClick={() => onOpenCandidate(featured.job.id, featured.candidate.id)}
            >
              Inspect signal
            </button>
            {featured.candidate.linkedinUrl && (
              <button className="btn-primary" onClick={() => onCompare(featured.job.id, featured.candidate.id)}>
                Compare my profile
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 32 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Discovery
          </p>
          <h2 className="editorial" style={{ fontSize: 28, marginBottom: 8 }}>
            No hire signal yet
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 480 }}>
            Add a role. We&apos;ll search for people who appear to have landed it, then let the community confirm the signal.
          </p>
        </div>
      )}

      <div className="dashboard-stats" style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        border: "1px solid var(--border)", marginBottom: 32,
      }}>
        <StatCell label="Applications" value={jobs.length} />
        <StatCell label="Interviews" value={interviewing} accent />
        <StatCell label="Rejected" value={rejected} />
        <StatCell label="Active" value={active} positive />
      </div>

      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Your applications
      </p>
      {jobs.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Nothing tracked yet.</p>
      ) : (
        <div className="data-table-wrap" style={{ border: "1px solid var(--border)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Date applied</th>
                <th>Status</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const st = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
                const signal = job.candidates.length > 0 ? "Found" : "Watching";
                return (
                  <tr key={job.id} onClick={() => onSelectJob(job.id)} id={`dash-job-${job.id}`}>
                    <td>{job.company}</td>
                    <td>{job.role}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {formatApplied(job.appliedDate)}
                    </td>
                    <td style={{ color: st.color }}>{st.label}</td>
                    <td style={{ color: job.candidates.length > 0 ? "var(--green)" : "var(--text-muted)" }}>
                      {signal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
  positive,
}: {
  label: string;
  value: number;
  accent?: boolean;
  positive?: boolean;
}) {
  const color = accent ? "var(--accent)" : positive ? "var(--green)" : "var(--text-primary)";
  return (
    <div style={{ padding: "20px 18px", borderRight: "1px solid var(--border)" }}>
      <p className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>
        {label}
      </p>
      <p className="editorial" style={{ fontSize: 36, color, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function findFeaturedHire(jobs: DBJob[], userId: string) {
  let best: {
    job: DBJob;
    candidate: DBJob["candidates"][number];
    yes: number;
    no: number;
    cd: ReturnType<typeof confidenceData>;
  } | null = null;

  for (const job of jobs) {
    const sorted = sortCandidatesByVotes(job.candidates);
    const candidate = sorted[0];
    if (!candidate) continue;
    const { yes, no } = voteCounts(candidate, userId);
    if (yes === 0 && no === 0 && sorted.length === 0) continue;
    const cd = confidenceData(yes, no);
    const score = yes - no + (candidate.linkedinUrl ? 0.5 : 0);
    if (!best || score > best.yes - best.no) {
      best = { job, candidate, yes, no, cd };
    }
  }

  return best;
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatApplied(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
