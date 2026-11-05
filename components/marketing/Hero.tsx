const EXAMPLE_ROWS = [
  { name: "Candidate A", role: "Senior Product Manager", joined: "Mar 2026" },
  { name: "Candidate B", role: "Product Manager", joined: "Apr 2026" },
  { name: "Candidate C", role: "Group Product Manager", joined: "May 2026" },
];

/** A static illustration of a result list. No real names, photos or companies. */
function PreviewCard() {
  return (
    <div className="mk-preview" role="img" aria-label="Example: a tracked Senior Product Manager job with three candidate results, each with a Compare with me button">
      <div aria-hidden="true">
        <div className="mk-preview-head">
          <p className="field-label" style={{ marginBottom: 6 }}>
            Tracked job
          </p>
          <p className="editorial" style={{ fontSize: 22, lineHeight: 1.2 }}>
            Senior Product Manager
          </p>
          <p className="mk-secondary" style={{ marginTop: 4 }}>
            Acme Corp · Bengaluru
          </p>
        </div>
        {EXAMPLE_ROWS.map((row) => (
          <div key={row.name} className="mk-preview-row">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</p>
              <p className="mk-secondary" style={{ fontSize: 13 }}>
                {row.role} · joined {row.joined}
              </p>
            </div>
            <span className="mk-chip">Compare with me</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-wrap mk-hero-grid">
        <div>
          <p className="mk-label">For job seekers who got the rejection email</p>
          <h1 id="hero-title">See who got the job. Learn what got them there.</h1>
          <p className="mk-lede" style={{ maxWidth: 560 }}>
            Paste a role you were rejected from. OutHired finds the people who joined that company in that role soon after,
            then shows you, side by side, where your profile and theirs differ.
          </p>
          <div className="mk-hero-buttons">
            <a className="btn-primary" href="/signup">
              Track your first job
            </a>
            <a className="btn-ghost" href="#how">
              See how it works
            </a>
          </div>
          <p className="mk-note">Free plan, no card needed.</p>
        </div>
        <PreviewCard />
      </div>
    </section>
  );
}
