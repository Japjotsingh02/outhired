"use client";

import { Suspense, useState, useEffect, KeyboardEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserProfile } from "@/types";
import { FieldError } from "@/components/ui";
import { isProfileComplete } from "@/lib/profile";
import { fieldErrorsFromApiError, getErrorMessage } from "@/lib/apiClient";
import { useProfile, useSaveProfile, useSkipOnboarding } from "@/lib/queries/profile";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { toastError } from "@/components/ui/toast";

const profileSchema = z.object({
  linkedinUrl: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://linkedin.com/in/yourname")]),
  githubUrl: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://github.com/yourname")]),
  portfolioUrl: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://yourname.dev")]),
  headline: z.string(),
  resumeText: z.string(),
  experienceYrs: z
    .string()
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 50), {
      message: "Enter a number between 0 and 50",
    }),
  skills: z.array(z.string()),
});
type ProfileValues = z.infer<typeof profileSchema>;

/* ─── Loading skeleton ───────────────────────────────────────────────────── */
function ProfileSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
      ))}
    </div>
  );
}

/* ─── Form label ─────────────────────────────────────────────────────────── */
function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 12,
        color: "var(--text-muted)",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </label>
  );
}

/* ─── Section card wrapper ───────────────────────────────────────────────── */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: description ? 4 : 0 }}>{title}</p>
        {description && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ─── Skill tag input ────────────────────────────────────────────────────── */
function SkillsInput({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add() {
    const s = input.trim();
    if (s && !skills.includes(s)) onChange([...skills, s]);
    setInput("");
  }

  function remove(s: string) {
    onChange(skills.filter((x) => x !== s));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    }
    if (e.key === "Backspace" && input === "" && skills.length > 0) {
      onChange(skills.slice(0, -1));
    }
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
        borderRadius: 2,
        padding: "8px 10px",
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        minHeight: 48,
        cursor: "text",
      }}
      onClick={() => document.getElementById("skill-input")?.focus()}
    >
      {skills.map((s) => (
        <span
          key={s}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            padding: "3px 8px",
            borderRadius: 2,
            background: "rgba(196,92,62,0.12)",
            border: "1px solid rgba(196,92,62,0.25)",
            color: "#D98B73",
          }}
        >
          {s}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(s);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#D98B73",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              fontSize: 13,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id="skill-input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={add}
        placeholder={skills.length === 0 ? "Type skill + Enter (e.g. React, TypeScript…)" : ""}
        style={{
          flex: 1,
          minWidth: 120,
          background: "none",
          border: "none",
          outline: "none",
          fontSize: 14,
          color: "var(--text-primary)",
          fontFamily: "var(--font-inter)",
        }}
      />
    </div>
  );
}

/* ─── Profile page ───────────────────────────────────────────────────────── */
export default function ProfilePage() {
  // useSearchParams needs a Suspense boundary during the production build.
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  );
}

/** Loads the profile (a failure is an error state with Retry, never an empty form), then shows the form. */
function ProfileContent() {
  const { status } = useSession();
  const router = useRouter();
  const profileQuery = useProfile();

  // Redirect if not authed
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || (status === "authenticated" && profileQuery.isPending)) {
    return (
      <PageShell>
        <ProfileSkeleton />
      </PageShell>
    );
  }

  if (profileQuery.isError && profileQuery.data === undefined) {
    return (
      <PageShell>
        <ErrorState
          title="We couldn't load your profile"
          message={getErrorMessage(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
        />
      </PageShell>
    );
  }

  if (!profileQuery.data) return null;

  // The form takes its starting values from the loaded profile once; later cache updates never overwrite typing.
  return <ProfileForm profile={profileQuery.data} />;
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const { data: session } = useSession();
  const router = useRouter();
  const savedProfile = useSaveProfile();
  const skipOnboarding = useSkipOnboarding();

  const [saved, setSaved] = useState(false);
  const welcomeParam = useSearchParams().get("welcome") === "1";
  // Welcome header: shown on ?welcome=1 or while the user has never been onboarded (decided when the form opens).
  const [showWelcome] = useState(() => welcomeParam || profile.onboarded === false);
  const skipping = skipOnboarding.isPending;
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      linkedinUrl: profile.linkedinUrl ?? "",
      githubUrl: profile.githubUrl ?? "",
      portfolioUrl: profile.portfolioUrl ?? "",
      headline: profile.headline ?? "",
      resumeText: profile.resumeText ?? "",
      experienceYrs: profile.experienceYrs?.toString() ?? "",
      skills: profile.skills ?? [],
    },
  });
  const resumeText = useWatch({ control, name: "resumeText" });
  const resumeLength = resumeText.length;
  const linkedinUrlValue = useWatch({ control, name: "linkedinUrl" });
  const skillsValue = useWatch({ control, name: "skills" });
  const profileComplete = isProfileComplete({
    linkedinUrl: linkedinUrlValue,
    resumeText,
    skills: skillsValue,
  });

  // A quick action with no place for its message: failure is a toast (the global handler redirects on 401).
  function skipForNow() {
    skipOnboarding.mutate(undefined, {
      onSuccess: () => router.push("/"),
      onError: (err) => toastError(err, { retry: skipForNow }),
    });
  }

  async function onSubmit(values: ProfileValues) {
    setError("");
    setSaved(false);

    try {
      const updated = await savedProfile.mutateAsync({
        linkedinUrl: values.linkedinUrl || null,
        githubUrl: values.githubUrl || null,
        portfolioUrl: values.portfolioUrl || null,
        headline: values.headline || null,
        resumeText: values.resumeText || null,
        skills: values.skills,
        experienceYrs: values.experienceYrs ? parseFloat(values.experienceYrs) : null,
      });

      // The server stores a normalised LinkedIn URL; reflect it in the field.
      setValue("linkedinUrl", updated.linkedinUrl ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Server-side validation errors go next to the matching fields; the input is kept.
      const unplaced: string[] = [];
      const fields = fieldErrorsFromApiError(err);
      for (const [path, message] of Object.entries(fields)) {
        const field = path.split(".")[0] as keyof ProfileValues;
        if (field in profileSchema.shape) {
          setFieldError(field, { type: "server", message });
        } else {
          unplaced.push(message);
        }
      }
      if (Object.keys(fields).length > 0 && unplaced.length === 0) return;
      setError(unplaced[0] ?? getErrorMessage(err));
    }
  }

  if (!session) return null;

  return (
    <PageShell>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => router.push("/")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Back to dashboard
        </button>

        {showWelcome && (
          <div
            className="card"
            style={{
              marginBottom: 20,
              padding: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Welcome to OutHired</p>
              <h2 className="editorial" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 6 }}>
                Tell us about you.
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                You can compare yourself with candidates once this is filled in.
              </p>
            </div>
            <button
              id="skip-onboarding"
              type="button"
              className="btn-ghost"
              onClick={() => void skipForNow()}
              disabled={skipping}
              style={{ flexShrink: 0 }}
            >
              {skipping ? "Skipping…" : "Skip for now"}
            </button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Avatar */}
          <div
            style={{
              width: 52,
              height: 52,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {(session.user.name ?? "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 5 }}>Profile intelligence · Your baseline</p>
            <h1 className="editorial" style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 4 }}>
              {session.user.name}
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{session.user.email}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Identity */}
        <Section
          title="Professional identity"
          description="The experience we use as a baseline when you compare with a potential hire"
        >
          <div>
            <FieldLabel htmlFor="linkedin-url">LinkedIn Profile URL</FieldLabel>
            <input
              id="linkedin-url"
              className="input"
              type="url"
              placeholder="https://linkedin.com/in/yourname"
              {...register("linkedinUrl")}
            />
            <FieldError message={errors.linkedinUrl?.message} />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
              Used to build a fuller baseline for profile comparisons
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="github-url">GitHub Profile URL</FieldLabel>
            <input
              id="github-url"
              className="input"
              type="url"
              placeholder="https://github.com/yourname"
              {...register("githubUrl")}
            />
            <FieldError message={errors.githubUrl?.message} />
          </div>

          <div>
            <FieldLabel htmlFor="portfolio-url">Portfolio URL</FieldLabel>
            <input
              id="portfolio-url"
              className="input"
              type="url"
              placeholder="https://yourname.dev"
              {...register("portfolioUrl")}
            />
            <FieldError message={errors.portfolioUrl?.message} />
          </div>

          <div>
            <FieldLabel htmlFor="headline">Professional Headline</FieldLabel>
            <input
              id="headline"
              className="input"
              type="text"
              placeholder="Full-stack Engineer · 3 yrs · React, Node.js, TypeScript"
              {...register("headline")}
            />
          </div>

          <div>
            <FieldLabel htmlFor="experience-yrs">Years of Experience</FieldLabel>
            <input
              id="experience-yrs"
              className="input"
              type="number"
              min="0"
              max="50"
              step="0.5"
              placeholder="3"
              style={{ maxWidth: 160 }}
              {...register("experienceYrs")}
            />
            <FieldError message={errors.experienceYrs?.message} />
          </div>
        </Section>

        {/* Skills */}
        <Section
          title="Skills"
          description="Add your tech stack, tools, and domain skills"
        >
          <Controller
            control={control}
            name="skills"
            render={({ field }) => <SkillsInput skills={field.value} onChange={field.onChange} />}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -8 }}>
            Type a skill and press <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)" }}>Enter</kbd> or <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)" }}>,</kbd> to add
          </p>
        </Section>

        {/* Resume */}
        <Section
          title="Resume / Bio"
          description="Paste your resume text or a summary — used when no LinkedIn URL is set"
        >
          <textarea
            id="resume-text"
            className="input"
            placeholder="Paste your resume or a summary of your experience, projects, and achievements…"
            rows={10}
            style={{ resize: "vertical", fontFamily: "var(--font-inter)", lineHeight: 1.7 }}
            {...register("resumeText")}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -8 }}>
            {resumeLength > 0 ? `${resumeLength.toLocaleString()} characters` : "Optional"}
          </p>
        </Section>

        {/* Error */}
        {error && <InlineAlert>{error}</InlineAlert>}

        {/* Save bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {saved ? (
              <span style={{ color: "#4ADE80" }}>✓ Profile saved</span>
            ) : (
              profileComplete
                ? "Profile complete · stays private by default"
                : "Add a LinkedIn URL or resume, and at least 3 skills, to complete your profile"
            )}
          </p>
          <button
            id="save-profile"
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            style={{ padding: "10px 28px", fontSize: 14 }}
          >
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Account section */}
      <div className="card" style={{ marginTop: 8 }}>
        <p className="field-label">Account</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
          Signed in as <strong style={{ color: "var(--text-primary)" }}>{session.user.email}</strong>
        </p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          style={{ color: "var(--red)", borderColor: "var(--red)" }}
        >
          Sign out
        </button>
      </div>
    </PageShell>
  );
}

/* ─── Page shell with consistent padding + max-width ─────────────────────── */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      {/* Nav bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--border)",
          background: "rgba(20,20,20,0.96)",
          backdropFilter: "blur(12px)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--text-primary)",
          }}
        >
          <div
            style={{
            width: 32,
            height: 32,
            border: "1px solid var(--border-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ⚡
          </div>
            <span className="editorial" style={{ fontSize: 18 }}>OutHired</span>
        </a>
        <span
          style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: ".12em", textTransform: "uppercase" }}
        >
          Beta
        </span>
      </header>

      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "32px 24px 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
