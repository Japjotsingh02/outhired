import Link from "next/link";

export default function NotFound() {
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
      <div className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: 32 }}>
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>We couldn&apos;t find that page</p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
          The link may be old or the page may have been removed. Head back to your applications.
        </p>
        <Link className="btn-primary" href="/" style={{ textDecoration: "none", display: "inline-block" }}>
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
