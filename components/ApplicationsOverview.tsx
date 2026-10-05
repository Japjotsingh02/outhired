"use client";

import { DBJob } from "@/types";
import { STATUS_STYLE } from "@/constants";

interface ApplicationsOverviewProps {
  jobs: DBJob[];
  loading: boolean;
  onSelectJob: (jobId: string) => void;
  onAddJob: () => void;
}

export function ApplicationsOverview({
  jobs,
  loading,
  onSelectJob,
  onAddJob,
}: ApplicationsOverviewProps) {
  return (
    <section className="animate-fade-in">
      <div className="applications-heading">
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Workspace · Applications</p>
          <h1 className="editorial" style={{ fontSize: 36, lineHeight: 1.08, marginBottom: 8 }}>
            Your application trail
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
            Each role is a starting point for finding and reviewing a potential hire.
          </p>
        </div>
        <button className="btn-primary" onClick={onAddJob}>Add application</button>
      </div>

      <div className="applications-summary">
        <span className="eyebrow">{jobs.length} tracked {jobs.length === 1 ? "role" : "roles"}</span>
        <span className="applications-summary-note">Select a role to inspect its candidate signals and community confidence.</span>
      </div>

      {loading ? (
        <div className="applications-loading" aria-label="Loading applications">
          {[0, 1, 2].map((item) => <div className="skeleton" key={item} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card applications-empty">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Start with a role</p>
          <h2 className="editorial" style={{ fontSize: 28, marginBottom: 8 }}>Add the role. We&apos;ll find the hire.</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 520, marginBottom: 18 }}>
            Add a job you applied for to begin looking for a potential hire and community-confirmed signals.
          </p>
          <button className="btn-primary" onClick={onAddJob}>Add your first application</button>
        </div>
      ) : (
        <div className="data-table-wrap applications-table-wrap">
          <table className="data-table applications-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Date applied</th>
                <th>Status</th>
                <th>Discovery signal</th>
                <th aria-label="Open application" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const status = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
                const count = job.candidates.length;
                return (
                  <tr key={job.id} onClick={() => onSelectJob(job.id)}>
                    <td className="applications-company">{job.company}</td>
                    <td>{job.role}</td>
                    <td style={{ color: "var(--text-muted)" }}>{formatDate(job.appliedDate)}</td>
                    <td style={{ color: status.color }}>{status.label}</td>
                    <td style={{ color: count ? "var(--green)" : "var(--text-muted)" }}>
                      {count ? `${count} potential ${count === 1 ? "hire" : "hires"}` : "Watching for a signal"}
                    </td>
                    <td className="applications-open-cell"><span aria-hidden="true">→</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
