"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { JobInputPanel } from "@/components/JobInputPanel";
import { ProfileMatchPanel } from "@/components/ProfileMatchPanel";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { CandidateList } from "@/components/CandidateList";
import { CandidateDetail } from "@/components/CandidateDetail";
import { GapAnalysis } from "@/components/GapAnalysis";
import { SearchLogPanel } from "@/components/SearchLogPanel";
import { HireSearchPanel } from "@/components/HireSearchPanel";
import { DashboardOverview } from "@/components/DashboardOverview";
import { ApplicationsOverview } from "@/components/ApplicationsOverview";
import { CompareProfilePrompt } from "@/components/CompareProfilePrompt";

import { DBJob, DBCandidate } from "@/types";
import { sortCandidatesByVotes } from "@/lib/helpers";
import { getErrorMessage } from "@/lib/apiClient";
import { useJobs, useVote } from "@/lib/queries/jobs";
import { useProfile } from "@/lib/queries/profile";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { STATUS_STYLE, TAB_LABELS } from "@/constants";

type ActiveTab = "candidates" | "gap" | "log";
type ShellView = "dashboard" | "applications" | "job";
type WorkspaceSection = "dashboard" | "applications";

interface WorkspaceProps {
  section?: WorkspaceSection;
  initialJobId?: string;
  initialCandidateId?: string;
  initialCompareCandidateId?: string;
}

const NO_JOBS: DBJob[] = [];

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          className="animate-spin-slow"
          style={{
            width: 28,
            height: 28,
            margin: "0 auto 12px",
            border: "1px solid var(--border-strong)",
            borderTopColor: "var(--accent)",
          }}
        />
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading OutHired…</p>
      </div>
    </div>
  );
}

function JobHeader({ job, onBack }: { job: DBJob; onBack: () => void }) {
  const st = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
  const hireCount = job.candidates.length;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 28,
        gap: 16,
      }}
    >
      <div>
        <button
          className="applications-back-link"
          onClick={onBack}
          style={{ padding: 0, border: 0, background: "none", color: "var(--text-secondary)", cursor: "pointer", marginBottom: 14, fontSize: 12 }}
        >
          ← All applications
        </button>
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Applications · Detail
        </p>
        <h1 className="editorial" style={{ fontSize: 32, lineHeight: 1.15, marginBottom: 8 }}>
          {job.company} — {job.role}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {job.location ? `${job.location}` : "Location not listed"}
          {job.team ? ` · ${job.team}` : ""}
        </p>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              display: "inline-block",
              marginTop: 10,
              borderBottom: "1px solid var(--border-strong)",
              textDecoration: "none",
            }}
          >
            View job posting
          </a>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "5px 10px",
            background: "var(--accent)",
            color: "#f4efe6",
          }}
        >
          {st.label}
        </span>
        <p style={{ fontSize: 12, color: hireCount ? "var(--green)" : "var(--text-muted)" }}>
          {hireCount > 0 ? `Potential hire found` : "Watching"}
        </p>
      </div>
    </div>
  );
}

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        marginBottom: 24,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {(["candidates", "gap", "log"] as ActiveTab[]).map((tab) => (
        <button
          key={tab}
          id={`tab-${tab}`}
          onClick={() => onChange(tab)}
          style={{
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "none",
            color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
            border: "none",
            borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

export function Workspace({
  section = "dashboard",
  initialJobId,
  initialCandidateId,
  initialCompareCandidateId,
}: WorkspaceProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // A failed request is an error state, never "no profile" / "no jobs".
  const profileQuery = useProfile();
  // Jobs load for every authenticated user, with or without a complete profile.
  const jobsQuery = useJobs();
  const vote = useVote();
  const profile = profileQuery.data;
  const profileLoading = profileQuery.isPending;
  const profileError = profileQuery.isError;
  const jobs = jobsQuery.data ?? NO_JOBS;
  const jobsLoading = jobsQuery.isPending;
  // No data and it failed: the whole list is an error. With data on screen, a failed refresh is only a note.
  const jobsError = jobsQuery.isError && jobsQuery.data === undefined;
  // Set when a comparison was requested but the profile is incomplete.
  const [compareMissing, setCompareMissing] = useState<string[] | null>(null);

  const [shellView, setShellView] = useState<ShellView>(
    initialJobId ? "job" : section,
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId ?? null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("candidates");
  const [activeCandId, setActiveCandId] = useState<string | null>(initialCandidateId ?? null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [matchCandidate, setMatchCandidate] = useState<DBCandidate | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Compare / gap analysis is the only feature that needs a complete profile.
  function requestCompare(candidate: DBCandidate) {
    if (profile?.profileComplete) setMatchCandidate(candidate);
    else setCompareMissing(profile?.missing ?? []);
  }

  useEffect(() => {
    if (!initialCompareCandidateId || jobs.length === 0 || !profile) return;
    const candidate = jobs
      .flatMap((job) => job.candidates)
      .find((item) => item.id === initialCompareCandidateId);
    if (!candidate) return;
    if (profile.profileComplete) setMatchCandidate(candidate);
    else setCompareMissing(profile.missing ?? []);
  }, [initialCompareCandidateId, jobs, profile]);

  function handleVote(candidateId: string, type: "YES" | "NO") {
    if (!activeJob) return;
    vote.mutate({ jobId: activeJob.id, candidateId, type });
  }

  function handleJobCreated(job: object) {
    // useCreateJob has already put the job in the cached list.
    const newJob = job as DBJob;
    setActiveJobId(newJob.id);
    setShowAddJob(false);
    setShellView("job");
    setActiveTab("candidates");
    router.push(`/applications/${newJob.id}`);
  }

  function handleSelectJob(jobId: string) {
    router.push(`/applications/${jobId}`);
  }

  function handleSelectDashboard() {
    router.push("/");
  }

  function handleSelectApplications() {
    router.push("/applications");
  }

  function openAddJob() {
    setShowAddJob(true);
    setActiveCandId(null);
    setActiveJobId(null);
    setShellView(section);
  }

  function cancelAddJob() {
    setShowAddJob(false);
    router.push(initialJobId ? `/applications/${initialJobId}` : section === "applications" ? "/applications" : "/");
  }

  if (status === "loading" || profileLoading) return <LoadingScreen />;
  if (!session) return null;

  if (profileError || !profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", padding: 16 }}>
        <div style={{ maxWidth: 420, width: "100%" }}>
          <ErrorState
            title="We couldn't load your profile"
            message={getErrorMessage(profileQuery.error ?? "UNKNOWN")}
            onRetry={() => void profileQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const sortedCandidates = activeJob ? sortCandidatesByVotes(activeJob.candidates) : [];
  const activeCandidate = activeCandId
    ? sortedCandidates.find((c) => c.id === activeCandId) ?? null
    : null;

  const matchJob = matchCandidate
    ? jobs.find((j) => j.candidates.some((c) => c.id === matchCandidate.id)) ?? activeJob
    : activeJob;

  return (
    <div className="app-shell" style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Header
        userName={session.user.name ?? "User"}
        userEmail={session.user.email ?? undefined}
      />

      <div
        className="app-layout"
        style={{
          display: "flex",
          maxWidth: 1200,
          margin: "0 auto",
          minHeight: "calc(100vh - 57px)",
        }}
      >
        <Sidebar
          jobs={jobs}
          jobsLoading={jobsLoading}
          activeJobId={activeJobId}
          view={shellView === "dashboard" ? "dashboard" : "applications"}
          onSelectDashboard={handleSelectDashboard}
          onSelectApplications={handleSelectApplications}
          onSelectJob={handleSelectJob}
          onAddJob={openAddJob}
          onOpenProfile={() => router.push("/profile")}
        />

        <main className="app-main" style={{ flex: 1, minWidth: 0, padding: "32px 36px 64px" }}>
          {compareMissing && (
            <CompareProfilePrompt missing={compareMissing} onClose={() => setCompareMissing(null)} />
          )}

          {jobsError && !showAddJob && (
            <ErrorState
              title="We couldn't load your applications"
              message={getErrorMessage(jobsQuery.error)}
              onRetry={() => void jobsQuery.refetch()}
            />
          )}

          {jobsQuery.isRefetchError && !jobsError && !showAddJob && (
            <div style={{ marginBottom: 16 }}>
              <InlineAlert action={{ label: "Retry", onClick: () => void jobsQuery.refetch() }}>
                Couldn&apos;t refresh your applications. What&apos;s shown may be out of date.
              </InlineAlert>
            </div>
          )}

          {showAddJob && (
            <JobInputPanel
              loading={false}
              logs={[]}
              onBack={cancelAddJob}
              onJobCreated={handleJobCreated}
            />
          )}

          {!showAddJob && activeCandidate && activeJob && (
            <CandidateDetail
              candidate={activeCandidate}
              job={activeJob}
              userId={session.user.id}
              onBack={() => setActiveCandId(null)}
              onVote={(type) => handleVote(activeCandidate.id, type)}
              onMatch={() => requestCompare(activeCandidate)}
            />
          )}

          {!showAddJob && !activeCandidate && activeJob && shellView === "job" && (
            <div className="animate-fade-in">
              <JobHeader job={activeJob} onBack={handleSelectApplications} />
              <TabBar activeTab={activeTab} onChange={setActiveTab} />

              {activeTab === "candidates" && (
                <HireSearchPanel key={activeJob.id} job={activeJob}>
                  <CandidateList
                    candidates={sortedCandidates}
                    job={activeJob}
                    userId={session.user.id}
                    onVote={handleVote}
                    onOpen={setActiveCandId}
                    onMatch={requestCompare}
                  />
                </HireSearchPanel>
              )}
              {activeTab === "gap" && !profile.profileComplete && (
                <CompareProfilePrompt missing={profile.missing ?? []} />
              )}
              {activeTab === "gap" && profile.profileComplete && sortedCandidates.length > 0 && (
                <GapAnalysis
                  job={activeJob}
                  top={sortedCandidates[0]}
                  profile={profile}
                />
              )}
              {activeTab === "log" && <SearchLogPanel job={activeJob} />}
            </div>
          )}

          {!showAddJob && !activeCandidate && !jobsError && shellView === "dashboard" && (
            <DashboardOverview
              userName={session.user.name ?? "there"}
              jobs={jobs}
              userId={session.user.id}
              onSelectJob={handleSelectJob}
              onAddJob={openAddJob}
              onOpenCandidate={(jobId, candidateId) => {
                router.push(`/applications/${jobId}?candidate=${candidateId}`);
              }}
              profileComplete={profile.profileComplete ?? false}
              onCompare={(jobId, candidateId) => {
                if (!profile.profileComplete) {
                  setCompareMissing(profile.missing ?? []);
                  return;
                }
                router.push(`/applications/${jobId}?compare=${candidateId}`);
              }}
            />
          )}

          {!showAddJob && !activeCandidate && !jobsError && shellView === "applications" && (
            <ApplicationsOverview
              jobs={jobs}
              loading={jobsLoading}
              onSelectJob={handleSelectJob}
              onAddJob={openAddJob}
            />
          )}

          {!showAddJob && !activeCandidate && shellView === "job" && !activeJob && jobsLoading && (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading application…</p>
          )}

          {!showAddJob && !activeCandidate && shellView === "job" && !activeJob && !jobsLoading && !jobsError && (
            <div className="card">
              <p className="eyebrow" style={{ marginBottom: 8 }}>Application unavailable</p>
              <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>This application could not be found in your workspace.</p>
              <button className="btn-ghost" onClick={handleSelectApplications}>Back to applications</button>
            </div>
          )}
        </main>
      </div>

      {matchCandidate && matchJob && (
        <ProfileMatchPanel
          candidateId={matchCandidate.id}
          candidateName={matchCandidate.name}
          jobTitle={matchJob.role}
          onClose={() => setMatchCandidate(null)}
          onProfileIncomplete={(missing) => {
            setMatchCandidate(null);
            setCompareMissing(missing);
          }}
        />
      )}
    </div>
  );
}
