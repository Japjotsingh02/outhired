"use client";

import { DBJob } from "@/types";
import { STATUS_STYLE } from "@/constants";

export type WorkspaceView = "dashboard" | "applications";

interface SidebarProps {
  jobs: DBJob[];
  jobsLoading: boolean;
  activeJobId: string | null;
  view: WorkspaceView;
  onSelectDashboard: () => void;
  onSelectApplications: () => void;
  onSelectJob: (jobId: string) => void;
  onAddJob: () => void;
  onOpenProfile: () => void;
}

export function Sidebar({
  jobs,
  jobsLoading,
  activeJobId,
  view,
  onSelectDashboard,
  onSelectApplications,
  onSelectJob,
  onAddJob,
  onOpenProfile,
}: SidebarProps) {
  return (
    <aside
      className="workspace-sidebar"
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "28px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <p className="eyebrow" style={{ marginBottom: 16, padding: "0 8px" }}>
        Workspace
      </p>

      <NavItem
        label="Dashboard"
        active={view === "dashboard" && !activeJobId}
        onClick={onSelectDashboard}
      />
      <NavItem
        label="Applications"
        active={view === "applications" && !activeJobId}
        onClick={onSelectApplications}
      />
      <NavItem label="Profile" active={false} onClick={onOpenProfile} />

      <p
        className="eyebrow"
        style={{ margin: "28px 0 10px", padding: "0 8px", color: "var(--text-muted)" }}
      >
        Tracked roles
      </p>

      {jobsLoading ? (
        <SkeletonJobs />
      ) : jobs.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 8px", lineHeight: 1.5 }}>
          No roles yet. Add one to start discovery.
        </p>
      ) : (
        jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isActive={job.id === activeJobId}
            onClick={() => onSelectJob(job.id)}
          />
        ))
      )}

      <button
        id="add-job-btn"
        onClick={onAddJob}
        className="btn-primary"
        style={{ marginTop: 16, width: "100%" }}
      >
        Add application
      </button>
    </aside>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px",
        background: "none",
        border: "none",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
      }}
    >
      {label}
    </button>
  );
}

function SkeletonJobs() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}

function JobCard({
  job,
  isActive,
  onClick,
}: {
  job: DBJob;
  isActive: boolean;
  onClick: () => void;
}) {
  const st = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
  const candidateCount = job.candidates.length;
  const hasSignal = candidateCount > 0;

  return (
    <button
      id={`job-${job.id}`}
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 8px",
        border: "none",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        background: isActive ? "rgba(244,239,230,0.03)" : "transparent",
        cursor: "pointer",
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {job.role}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{job.company}</p>
      <p style={{ fontSize: 11, color: hasSignal ? "var(--green)" : "var(--text-muted)", marginTop: 4 }}>
        {hasSignal ? `${candidateCount} potential hire${candidateCount > 1 ? "s" : ""}` : "Watching"}
      </p>
      <span style={{ fontSize: 10, color: st.color, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {st.label}
      </span>
    </button>
  );
}
