"use client";

import { useState } from "react";
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SearchLog } from "@/types";
import { FieldError } from "@/components/ui";
import { MonthYearSelect } from "@/components/MonthYearSelect";
import { SkillTags } from "@/components/SkillTags";
import { isAllowedPostedMonth, parseYearMonth, validatePostedMonth } from "@/lib/postedMonth";
import { normalizeCompanyDomain } from "@/lib/domain";
import { ApiError, fieldErrorsFromApiError, getErrorMessage } from "@/lib/apiClient";
import { useCreateJob, useParseJob } from "@/lib/queries/jobs";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { toastInfo } from "@/components/ui/toast";

/** Server field path (CreateJobSchema) -> review form field. */
const REVIEW_FIELD_FOR: Record<string, keyof ReviewValues | undefined> = {
  role: "jobTitle",
  company: "company",
  datePosted: "datePosted",
  team: "team",
  domain: "domain",
};

/* ── AnimatedLog ─────────────────────────────────────────────────────────── */
export function AnimatedLog({ logs }: { logs: SearchLog[] }) {
  if (logs.length === 0) return null;

  return (
    <div style={{
      background: "rgba(0,0,0,0.3)",
      border: "1px solid var(--border)",
      borderRadius: 2,
      padding: "16px 20px",
      fontFamily: "monospace",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {logs.map((log, i) => (
          <div
            key={i}
            className="animate-log-in"
            style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              animationDelay: `${i * 0.08}s`,
              paddingBottom: i < logs.length - 1 ? 14 : 0,
              borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            {/* Status icon */}
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginTop: 2,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: log.status === "ok"
                ? "rgba(34,197,94,0.15)"
                : log.status === "error"
                  ? "rgba(239,68,68,0.15)"
                  : "rgba(196,92,62,0.15)",
              border: `1px solid ${log.status === "ok" ? "rgba(34,197,94,0.3)" : log.status === "error" ? "rgba(239,68,68,0.3)" : "rgba(196,92,62,0.3)"}`,
            }}>
              {log.status === "ok" && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {log.status === "error" && <span style={{ fontSize: 12 }}>✕</span>}
              {log.status === "loading" && (
                <div className="animate-spin-slow" style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(196,92,62,0.3)",
                  borderTopColor: "#C45C3E",
                }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3, fontFamily: "var(--font-inter)" }}>
                {log.step}
              </p>
              <p style={{ fontSize: 12, color: "#22C55E", lineHeight: 1.5, wordBreak: "break-word" }}>
                {log.detail}
              </p>
            </div>

            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, alignSelf: "flex-start", marginTop: 2, fontFamily: "monospace" }}>
              {log.timestamp}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── JobInputPanel ──────────────────────────────────────────────────────────── */
interface JobInputPanelProps {
  loading: boolean;
  logs: SearchLog[];
  onBack: () => void;
  onJobCreated: (job: object) => void;
}

type InputMode = "description" | "url";

/** Normalises what the user typed in the URL box; undefined when it is not a usable http(s) URL. */
function toSourceUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

interface SourceValues {
  jobDescription: string;
  jobUrl: string;
}

const reviewSchema = z.object({
  jobTitle: z.string().trim().min(1, "Add the job title"),
  company: z.string().trim().min(1, "Add the company"),
  datePosted: z
    .string()
    .min(1, "Choose the month and year it was posted")
    .superRefine((value, ctx) => {
      const message = validatePostedMonth(value);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
  team: z.string().trim(),
  domain: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeCompanyDomain(value) !== null, "Enter a website like stripe.com"),
  skills: z.array(z.string()),
});
type ReviewValues = z.infer<typeof reviewSchema>;

export function JobInputPanel({ loading, logs, onBack, onJobCreated }: JobInputPanelProps) {
  const [mode, setMode] = useState<InputMode>("description");
  const [stage, setStage] = useState<"source" | "review">("source");
  // Only what the create call needs from the parsed posting (not a copy of any query data).
  const [parsedLocation, setParsedLocation] = useState<string | null>(null);
  const [localLogs, setLocalLogs] = useState<SearchLog[]>([]);
  const parseJob = useParseJob();
  const createJob = useCreateJob();
  // The failed call of the current step, shown once, inline. `null` when there is none.
  const failure: unknown = stage === "source" ? parseJob.error : createJob.error;
  const localLoading = parseJob.isPending || createJob.isPending;

  const sourceForm = useForm<SourceValues>({ defaultValues: { jobDescription: "", jobUrl: "" } });
  const reviewForm = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { jobTitle: "", company: "", datePosted: "", team: "", domain: "", skills: [] },
  });
  const jobDescription = useWatch({ control: sourceForm.control, name: "jobDescription" });

  const allLogs = [...logs, ...localLogs];
  const isLoading = loading || localLoading;

  function addLog(step: string, status: SearchLog["status"], detail: string) {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLocalLogs((current) => [...current, { step, status, detail, timestamp }]);
  }

  async function parseSource(values: SourceValues) {
    const source = mode === "description" ? values.jobDescription.trim() : values.jobUrl.trim();

    setLocalLogs([]);
    addLog(mode === "description" ? "Reading job description" : "Fetching job posting", "loading", "Extracting role details for you to review…");

    try {
      const parsed = await parseJob.mutateAsync(mode === "description" ? { jobDescription: source } : { url: source });
      setParsedLocation(parsed.location || null);
      const parsedMonth = parsed.datePosted ? parseYearMonth(parsed.datePosted) : null;
      reviewForm.reset({
        jobTitle: parsed.role ?? "",
        company: parsed.company ?? "",
        datePosted: parsedMonth && isAllowedPostedMonth(parsedMonth) ? parsed.datePosted!.slice(0, 7) : "",
        team: parsed.team ?? "",
        domain: parsed.companyDomain ?? "",
        skills: parsed.skills ?? [],
      });
      setLocalLogs([
        {
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          step: "Details ready to review",
          status: "ok",
          detail: [parsed.role, parsed.company].filter(Boolean).join(" · ") || "Review and complete the fields below.",
        },
      ]);
      setStage("review");
    } catch {
      // The error is on `parseJob.error` (shown below); 401 is redirected by the global handler.
      setLocalLogs([]);
    }
  }

  async function confirmAndSearch({ jobTitle, company, datePosted, team, domain, skills }: ReviewValues) {
    setLocalLogs([]);
    addLog("Searching for potential hires", "loading", `Looking for people at ${company} with experience as ${jobTitle}…`);

    try {
      const { status, data: result } = await createJob.mutateAsync({
        company,
        role: jobTitle,
        datePosted: `${datePosted}-01`,
        team: team || undefined,
        domain: domain || undefined,
        skills,
        location: parsedLocation || undefined,
        inputMode: mode === "url" ? "URL" : "DESCRIPTION",
        sourceUrl: mode === "url" ? toSourceUrl(sourceForm.getValues("jobUrl")) : undefined,
      });

      // The server answers 200 (not 201) when this application already exists: open it.
      if (status === 200) {
        toastInfo("That application is already in your list.");
        onJobCreated(result);
        return;
      }

      const count = result.candidates?.length ?? 0;
      const searching = result.searchStatus === "RUNNING";
      setLocalLogs([
        {
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          step: "Search complete",
          status: "ok",
          detail: count
            ? `${count} potential ${count === 1 ? "hire" : "hires"} found for ${company} · ${jobTitle}.`
            : searching
              ? "Your role is saved. We’re looking for people who joined; results appear on the next screen."
              : "Your role is saved. Add the company website on the next screen to look for people who joined.",
        },
      ]);
      setTimeout(() => onJobCreated(result), 650);
    } catch (err) {
      setLocalLogs([]);
      // Field errors from a 400 go on the fields; the alert (createJob.error) stays as the summary.
      for (const [path, message] of Object.entries(fieldErrorsFromApiError(err))) {
        const field = REVIEW_FIELD_FOR[path];
        if (field) reviewForm.setError(field, { message });
      }
    }
  }

  return (
    <div className="animate-fade-in">
      <button className="applications-back-link" onClick={onBack} style={{ padding: 0, border: 0, background: "none", color: "var(--text-secondary)", cursor: "pointer", marginBottom: 20, fontSize: 13 }}>
        ← Back
      </button>

      <div className="card job-entry-card" style={{ padding: 24, marginBottom: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 10 }}>New application · Candidate discovery</p>
        <h1 className="editorial" style={{ fontSize: "clamp(30px, 4vw, 42px)", lineHeight: 1.05, marginBottom: 10 }}>
          Add the role. We&apos;ll find the hire.
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 580, marginBottom: 24 }}>
          Share the job you applied for. We&apos;ll extract the role details, let you check them, then look for a potential hire.
        </p>

        {stage === "source" && (
          <div className="job-input-modes" role="tablist" aria-label="How would you like to add the job?">
            {(["description", "url"] as const).map((option) => (
              <button
                key={option}
                id={`mode-${option}`}
                type="button"
                role="tab"
                aria-selected={mode === option}
                onClick={() => { setMode(option); parseJob.reset(); }}
                className={mode === option ? "job-input-mode active" : "job-input-mode"}
                disabled={isLoading}
              >
                {option === "description" ? "Paste job description" : "Paste job link"}
                {option === "description" && <span className="recommended-label">Recommended</span>}
              </button>
            ))}
          </div>
        )}

        {stage === "source" ? (
          <form className="job-source-form" noValidate onSubmit={sourceForm.handleSubmit(parseSource)}>
            {mode === "description" ? (
              <div>
                <label className="field-label" htmlFor="job-description">Job description</label>
                <textarea
                  id="job-description"
                  className="input"
                  placeholder="Paste the full job description here. The more detail you include, the more useful your discovery results can be."
                  rows={10}
                  maxLength={30000}
                  readOnly={isLoading}
                  {...sourceForm.register("jobDescription", {
                    validate: (value) => value.trim() !== "" || "Paste the job description to continue.",
                  })}
                />
                <FieldError message={sourceForm.formState.errors.jobDescription?.message} />
                <p className="job-input-hint">Your description is used to extract role details and search for relevant potential hires.</p>
              </div>
            ) : (
              <div>
                <label className="field-label" htmlFor="job-url">Job posting URL</label>
                <input
                  id="job-url"
                  className="input"
                  type="url"
                  placeholder="https://company.com/careers/software-engineer"
                  readOnly={isLoading}
                  {...sourceForm.register("jobUrl", {
                    validate: (value) => value.trim() !== "" || "Enter the job posting URL to continue.",
                  })}
                />
                <FieldError message={sourceForm.formState.errors.jobUrl?.message} />
                <p className="job-input-hint">Some job sites limit access. If the link can&apos;t be read, paste the description instead.</p>
              </div>
            )}
            <button className="btn-primary" type="submit" disabled={isLoading}>
              {isLoading ? "Reading job details…" : "Review extracted details →"}
            </button>
          </form>
        ) : (
          <form className="job-review" noValidate onSubmit={reviewForm.handleSubmit(confirmAndSearch)}>
            <div className="job-review-heading">
              <div>
                <p className="eyebrow" style={{ marginBottom: 7 }}>Step 2 · Your review</p>
                <h2 className="editorial" style={{ fontSize: 27, lineHeight: 1.12, marginBottom: 6 }}>Confirm the role details</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55 }}>We extracted these from your {mode === "description" ? "description" : "job link"}. Correct anything that looks off before we search.</p>
              </div>
              <button className="btn-ghost" type="button" onClick={() => { setStage("source"); createJob.reset(); parseJob.reset(); }} disabled={isLoading}>Edit source</button>
            </div>

            <div className="job-review-grid">
              <ReviewField id="review-role" label="Job title" required inputProps={reviewForm.register("jobTitle")} error={reviewForm.formState.errors.jobTitle?.message} />
              <ReviewField id="review-company" label="Company" required inputProps={reviewForm.register("company")} error={reviewForm.formState.errors.company?.message} />
              <div>
                <label className="field-label" htmlFor="review-date-posted">Posted (month &amp; year) <span aria-hidden="true">*</span></label>
                <Controller
                  control={reviewForm.control}
                  name="datePosted"
                  render={({ field }) => (
                    <MonthYearSelect id="review-date-posted" value={field.value} onChange={field.onChange} disabled={isLoading} />
                  )}
                />
                <FieldError message={reviewForm.formState.errors.datePosted?.message} />
              </div>
              <ReviewField id="review-team" label="Team / department" placeholder="Optional" inputProps={reviewForm.register("team")} />
              <ReviewField
                id="review-domain"
                label="Company website"
                placeholder="stripe.com"
                hint="Used to find people who joined. Example: stripe.com"
                inputProps={reviewForm.register("domain")}
                error={reviewForm.formState.errors.domain?.message}
              />
              <div className="job-review-full-width">
                <label className="field-label" htmlFor="review-skills">Skills from the job</label>
                <Controller
                  control={reviewForm.control}
                  name="skills"
                  render={({ field }) => <SkillTags id="review-skills" skills={field.value} onChange={field.onChange} />}
                />
              </div>
            </div>

            {mode === "description" && jobDescription && (
              <details className="job-source-preview">
                <summary>Review pasted description</summary>
                <p>{jobDescription}</p>
              </details>
            )}

            <div className="job-review-actions">
              <button className="btn-primary" type="submit" disabled={isLoading}>
                {isLoading ? "Searching for potential hires…" : "Confirm details & find the hire →"}
              </button>
              <p>We&apos;ll start discovery only after you confirm these details.</p>
            </div>
          </form>
        )}

        {failure !== null && (
          <div style={{ marginTop: 16 }}>
            <InlineAlert
              action={
                failure instanceof ApiError && failure.code === "PROFILE_INCOMPLETE"
                  ? { label: "Open profile", href: "/profile" }
                  : undefined
              }
            >
              {getErrorMessage(failure)}
            </InlineAlert>
          </div>
        )}
      </div>

      {allLogs.length > 0 && <AnimatedLog logs={allLogs} />}
    </div>
  );
}

function ReviewField({
  id,
  label,
  inputProps,
  error,
  placeholder,
  required,
  hint,
}: {
  id: string;
  label: string;
  inputProps: UseFormRegisterReturn;
  error?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}{required ? " *" : ""}</label>
      <input id={id} className="input" placeholder={placeholder} {...inputProps} />
      {hint && !error && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}
