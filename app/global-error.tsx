"use client";

// Replaces the root layout, so it brings its own document and plain inline styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#141414",
          color: "#f4efe6",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            padding: 32,
            background: "#1c1c1c",
            border: "1px solid rgba(245,240,232,0.14)",
          }}
        >
          <p style={{ fontSize: 17, fontWeight: 500, margin: "0 0 8px" }}>Something went wrong</p>
          <p style={{ fontSize: 13, color: "#9a958c", lineHeight: 1.5, margin: "0 0 20px" }}>
            The app hit an unexpected problem. Try again, and if it keeps happening, come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: "9px 16px",
              background: "#c45c3e",
              color: "#f4efe6",
              border: "none",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#6b6760", margin: "16px 0 0" }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
