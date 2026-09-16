export function AuthSplit({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  kicker: string;
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
  footer?: string;
}) {
  return (
    <div className="auth-split">
      <aside className="auth-split-aside">
        <div>
          <p className="eyebrow" style={{ marginBottom: 28 }}>
            {kicker}
          </p>
          <hr className="accent-rule" style={{ marginBottom: 28 }} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1
            className="editorial"
            style={{
              fontSize: "clamp(36px, 4.6vw, 56px)",
              lineHeight: 1.05,
              maxWidth: 420,
              marginBottom: 20,
            }}
          >
            {title}
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 380 }}>
            {subtitle}
          </p>
        </div>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            borderLeft: "2px solid var(--accent)",
            paddingLeft: 12,
            lineHeight: 1.5,
            marginTop: 32,
          }}
        >
          {footer ?? "A focused workspace for applications, apparent-hire signals, and profile comparison."}
        </p>
      </aside>

      <main className="auth-split-main">
        <div style={{ width: "100%", maxWidth: 400 }}>{children}</div>
      </main>
    </div>
  );
}
