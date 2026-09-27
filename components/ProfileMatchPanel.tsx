"use client";

import { useState } from "react";
import { ProfileMatchResult } from "@/types";

interface Props {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  onClose: () => void;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 70 ? "#22C55E" :
    score >= 45 ? "#EAB308" :
    "#EF4444";

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        {/* Background ring */}
        <circle
          cx="55" cy="55" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        {/* Score arc */}
        <circle
          cx="55" cy="55" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
          className="animate-score-fill"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
}

export function ProfileMatchPanel({ candidateId, candidateName, jobTitle, onClose }: Props) {
  const [result, setResult] = useState<ProfileMatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<string>("");
  const [error, setError] = useState("");

  async function runComparison() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      setStep("Scraping LinkedIn profiles via Proxycurl…");
      await new Promise((r) => setTimeout(r, 600)); // Small delay for UX

      setStep("Sending profiles to Claude for analysis…");

      const res = await fetch("/api/compare-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobTitle }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Comparison failed");
      }

      const data = await res.json() as ProfileMatchResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setStep("");
    }
  }

  // Auto-run on mount
  if (!loading && !result && !error) {
    // Trigger on next tick
    setTimeout(runComparison, 50);
  }

  const scoreLabel =
    !result ? "" :
    result.score >= 70 ? "Strong match" :
    result.score >= 45 ? "Good match" :
    "Needs work";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="animate-slide-up profile-match-dialog"
        style={{
          width: "100%", maxWidth: 540,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 20,
          overflow: "hidden",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
              Profile match — {candidateName}
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{jobTitle}</p>
          </div>
          <button
            id="close-match-panel"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,0.06)", border: "none",
              color: "var(--text-secondary)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
            }}
          >×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
          {/* Loading state */}
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0" }} className="animate-fade-in">
              <div style={{ marginBottom: 20 }}>
                <div className="animate-pulse-ring" style={{
                  width: 64, height: 64, borderRadius: "50%", margin: "0 auto",
                  background: "var(--accent-soft)",
                  border: "1px solid var(--border-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24,
                }}>↗</div>
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Comparing profiles with AI…</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{step}</p>
              <div style={{ marginTop: 16, display: "flex", gap: 4, justifyContent: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "var(--accent-purple)",
                    animation: `pulse-ring 1.2s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.7,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="animate-fade-in" style={{ padding: "20px 0" }}>
              <div style={{
                padding: "16px", borderRadius: 12,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, color: "#F87171", marginBottom: 8 }}>{error}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Make sure PROXYCURL_API_KEY and ANTHROPIC_API_KEY are set in .env.local
                </p>
              </div>
              <button className="btn-ghost" onClick={runComparison} style={{ fontSize: 13 }}>
                Try again
              </button>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {result.cached && (
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", textAlign: "center",
                  padding: "4px 10px", background: "rgba(255,255,255,0.03)",
                  borderRadius: 6, display: "inline-block", margin: "0 auto",
                }}>
                  ↩ Cached result
                </div>
              )}

              {/* Score + label */}
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <ScoreRing score={result.score} />
                <p style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>{scoreLabel}</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, maxWidth: 360, margin: "8px auto 0" }}>
                  {result.summary}
                </p>
              </div>

              {/* Shared strengths */}
              {result.sharedStrengths.length > 0 && (
                <div className="card">
                  <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Shared strengths
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {result.sharedStrengths.map((s) => (
                      <span key={s} style={{
                        fontSize: 12, padding: "4px 10px", borderRadius: 2,
                        background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                        color: "#4ADE80",
                      }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {result.gaps.length > 0 && (
                <div className="card">
                  <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Gaps to close
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {result.gaps.map((g) => (
                      <span key={g} style={{
                        fontSize: 12, padding: "4px 10px", borderRadius: 2,
                        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                        color: "#F87171",
                      }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Advice */}
              <div className="card" style={{ borderColor: "rgba(196,92,62,0.2)", background: "rgba(196,92,62,0.04)" }}>
                <p style={{ fontSize: 11, color: "#D98B73", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  AI advice
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {result.advice}
                </p>
              </div>

              <button
                className="btn-ghost"
                onClick={runComparison}
                style={{ fontSize: 12, alignSelf: "center" }}
              >
                Re-run comparison
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
