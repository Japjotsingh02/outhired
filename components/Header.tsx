"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { initials } from "@/lib/helpers";
import { BrandMark } from "@/components/ui";

interface HeaderProps {
  userName: string;
  userEmail?: string;
}

export function Header({ userName, userEmail }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border)",
        background: "rgba(20,20,20,0.92)",
        backdropFilter: "blur(12px)",
        padding: "14px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BrandMark />
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            borderLeft: "1px solid var(--border)",
            paddingLeft: 12,
          }}
        >
          Beta
        </span>
      </div>

      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          id="user-menu-btn"
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "1px solid",
            borderColor: dropdownOpen ? "var(--border-strong)" : "transparent",
            padding: "4px 8px 4px 4px",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {initials(userName ?? "U")}
          </div>
          <span
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userName}
          </span>
        </button>

        {dropdownOpen && (
          <div
            className="animate-fade-in"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 240,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{userName}</p>
              {userEmail && (
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{userEmail}</p>
              )}
            </div>
            <div style={{ padding: 6 }}>
              <DropdownItem
                id="profile-link"
                label="Edit profile"
                sublabel="Baseline for comparisons"
                onClick={() => {
                  setDropdownOpen(false);
                  router.push("/profile");
                }}
              />
              <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
              <DropdownItem
                id="sign-out-btn"
                label="Sign out"
                onClick={() => {
                  setDropdownOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
                danger
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function DropdownItem({
  id,
  label,
  sublabel,
  onClick,
  danger = false,
}: {
  id: string;
  label: string;
  sublabel?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        width: "100%",
        display: "block",
        padding: "10px 12px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        color: danger ? "var(--red)" : "var(--text-primary)",
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
      {sublabel && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sublabel}</p>
      )}
    </button>
  );
}
