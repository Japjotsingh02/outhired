"use client";

import { useState } from "react";

interface SkillTagsProps {
  id: string;
  skills: string[];
  onChange: (skills: string[]) => void;
}

/** Skills as removable tags with an input that adds a tag on Enter or comma. */
export function SkillTags({ id, skills, onChange }: SkillTagsProps) {
  const [draft, setDraft] = useState("");

  function addDraft() {
    const next = draft.trim();
    setDraft("");
    if (!next || skills.some((skill) => skill.toLowerCase() === next.toLowerCase())) return;
    onChange([...skills, next]);
  }

  return (
    <div>
      {skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {skills.map((skill) => (
            <span
              key={skill}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 8px", fontSize: 12,
                border: "1px solid var(--border)", borderRadius: 2,
                color: "var(--text-primary)",
              }}
            >
              {skill}
              <button
                type="button"
                aria-label={`Remove ${skill}`}
                onClick={() => onChange(skills.filter((item) => item !== skill))}
                style={{ border: 0, background: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className="input"
        value={draft}
        placeholder="Type a skill and press Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addDraft();
          } else if (event.key === "Backspace" && !draft && skills.length > 0) {
            onChange(skills.slice(0, -1));
          }
        }}
        onBlur={addDraft}
      />
    </div>
  );
}
