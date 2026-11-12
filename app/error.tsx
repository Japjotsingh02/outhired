"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] Unhandled render error:", error.digest ?? error.message);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
      }}
    >
      <div className="card" role="alert" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: 32 }}>
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
          This page hit an unexpected problem. Try again, and if it keeps happening, come back in a few minutes.
        </p>
        <button className="btn-primary" type="button" onClick={() => retry()}>
          Try again
        </button>
        {error.digest && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
