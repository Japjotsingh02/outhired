"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserProfile } from "@/types";
import { FieldError } from "@/components/ui";

const profileSchema = z.object({
  linkedinUrl: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://linkedin.com/in/yourname")]),
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
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { linkedinUrl: "", headline: "", resumeText: "", experienceYrs: "", skills: [] },
  });
  const resumeLength = useWatch({ control, name: "resumeText" }).length;

  // Redirect if not authed
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Load profile
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: UserProfile) => {
        reset({
          linkedinUrl: p.linkedinUrl ?? "",
          headline: p.headline ?? "",
          resumeText: p.resumeText ?? "",
          experienceYrs: p.experienceYrs?.toString() ?? "",
          skills: p.skills ?? [],
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("[profile] Failed to load profile:", err);
        setLoading(false);
      });
  }, [status, reset]);

  async function onSubmit(values: ProfileValues) {
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedinUrl: values.linkedinUrl || null,
          headline: values.headline || null,
          resumeText: values.resumeText || null,
          skills: values.skills,
          experienceYrs: values.experienceYrs ? parseFloat(values.experienceYrs) : null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save profile");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "loading" || loading) {
    return (
      <PageShell>
        <ProfileSkeleton />
      </PageShell>
    );
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
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#F87171",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

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
              "Your profile stays private by default"
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
      <div
        className="card"
        style={{
          marginTop: 8,
          borderRadius: 16,
          padding: 20,
          borderColor: "rgba(239,68,68,0.15)",
          background: "rgba(239,68,68,0.03)",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Account</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
          Signed in as <strong style={{ color: "var(--text-primary)" }}>{session.user.email}</strong>
        </p>
        <button
          onClick={() =>
            (window.location.href =
              "/api/auth/signout?callbackUrl=/login")
          }
          style={{
            fontSize: 13,
            padding: "8px 18px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#F87171",
            cursor: "pointer",
          }}
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
