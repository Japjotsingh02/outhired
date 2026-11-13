"use client";

import Link from "next/link";
import { PROFILE_MISSING_LABELS, type ProfileMissing } from "@/lib/profile";

interface CompareProfilePromptProps {
  /** Missing-item codes from the server (GET /api/profile or a 403 PROFILE_INCOMPLETE). */
  missing: string[];
  onClose?: () => void;
}

/** Small inline prompt shown instead of opening a comparison. */
export function CompareProfilePrompt({ missing, onClose }: CompareProfilePromptProps) {
  const items = missing
    .filter((code): code is ProfileMissing => code in PROFILE_MISSING_LABELS)
    .map((code) => PROFILE_MISSING_LABELS[code]);

  return (
    <div
      role="status"
      className="card"
      style={{ marginBottom: 20, padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 12 }}
    >
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Complete your profile to compare</p>
        {items.length > 0 && (
          <ul style={{ margin: "0 0 8px 18px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <Link href="/profile" style={{ fontSize: 13, color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Go to your profile
        </Link>
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          style={{ border: 0, background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, alignSelf: "flex-start" }}
        >
          ×
        </button>
      )}
    </div>
  );
}
