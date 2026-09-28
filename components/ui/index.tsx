"use client";

import React from "react";

/** Inline validation message shown under a form field. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ color: "var(--red)", fontSize: 12, marginTop: 5 }}>
      {message}
    </p>
  );
}

export function ConfidenceBar({ pct, bar }: { pct: number; bar: string }) {
  return (
    <div
      style={{
        height: 2,
        background: "rgba(244,239,230,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: bar,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

export function ConfidenceRow({
  yes,
  total,
  pct,
  bar,
}: {
  yes: number;
  total: number;
  pct: number;
  bar: string;
  label: string;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        <span>
          {yes}/{total} confirm this hire
        </span>
        <span>{pct}%</span>
      </div>
      <ConfidenceBar pct={pct} bar={bar} />
    </div>
  );
}

export function LinkedInLink({
  url,
  label = "View LinkedIn profile",
  size = 13,
}: {
  url: string;
  label?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: size,
        color: "var(--text-primary)",
        marginTop: 8,
        textDecoration: "none",
        borderBottom: "1px solid var(--border-strong)",
        paddingBottom: 1,
      }}
    >
      {label}
    </a>
  );
}

export function CandidateAvatar({
  initials,
  size = 40,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size > 42 ? 15 : 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: "var(--text-primary)",
      }}
    >
      {initials}
    </div>
  );
}

export function Badge({
  label,
  bg,
  color,
  border,
  fontSize = 10,
}: {
  label: string;
  bg: string;
  color: string;
  border?: string;
  fontSize?: number;
}) {
  return (
    <span
      style={{
        fontSize,
        padding: "3px 8px",
        background: bg,
        color,
        border: `1px solid ${border ?? "transparent"}`,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function SkillChip({
  skill,
  bg = "transparent",
  color = "var(--text-secondary)",
  border = "var(--border-strong)",
}: {
  skill: string;
  bg?: string;
  color?: string;
  border?: string;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "4px 8px",
        background: bg,
        border: `1px solid ${border}`,
        color,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {skill}
    </span>
  );
}

export function VoteButton({
  id,
  active,
  activeStyle,
  onClick,
  label,
}: {
  id: string;
  active: boolean;
  activeStyle: React.CSSProperties;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "7px 12px",
        background: "transparent",
        border: "1px solid var(--border-strong)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        transition: "all 0.15s",
        fontFamily: "var(--font-sans)",
        ...(active ? activeStyle : {}),
      }}
    >
      {label}
    </button>
  );
}

export function MatchProfileButton({
  id,
  hasLinkedIn,
  onClick,
  size = "sm",
}: {
  id: string;
  hasLinkedIn: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const pad = size === "md" ? "8px 14px" : "7px 12px";
  const fontSize = size === "md" ? 11 : 11;

  return (
    <button
      id={id}
      onClick={() => hasLinkedIn && onClick()}
      disabled={!hasLinkedIn}
      title={!hasLinkedIn ? "LinkedIn URL not available for this candidate" : ""}
      style={{
        fontSize,
        fontWeight: 600,
        padding: pad,
        background: hasLinkedIn ? "var(--accent)" : "transparent",
        border: `1px solid ${hasLinkedIn ? "var(--accent)" : "var(--border)"}`,
        color: hasLinkedIn ? "#f4efe6" : "var(--text-muted)",
        cursor: hasLinkedIn ? "pointer" : "not-allowed",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: hasLinkedIn ? 1 : 0.5,
        fontFamily: "var(--font-sans)",
      }}
    >
      Compare my profile
    </button>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="eyebrow"
      style={{ color: "var(--text-muted)", marginBottom: 10 }}
    >
      {children}
    </p>
  );
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const word = size === "sm" ? 15 : 18;
  return (
    <span
      className="editorial"
      style={{
        fontSize: word,
        letterSpacing: "0.02em",
        color: "var(--text-primary)",
        lineHeight: 1,
      }}
    >
      OutHired
    </span>
  );
}
