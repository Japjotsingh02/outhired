import { FeatureIcon } from "@/components/marketing/icons";

const FEATURES = [
  {
    icon: "parse",
    title: "Smart job parsing",
    text: "Paste a link or the description. We pull out the company, role, team, location and the date it was posted.",
  },
  {
    icon: "search",
    title: "New-hire search",
    text: "Finds people who started at the company in a matching role after the posting, and filters out internal promotions.",
  },
  {
    icon: "vote",
    title: "Community confirmation",
    text: "People who applied for the same role vote on the real hire, so the strongest match rises to the top.",
  },
  {
    icon: "gap",
    title: "Gap analysis",
    text: "Compare your resume, GitHub or portfolio with theirs: skills, experience and the next steps worth taking.",
  },
  {
    icon: "track",
    title: "One place for every application",
    text: "Keep every role you applied for together with the hires we found and your comparisons.",
  },
  {
    icon: "shield",
    title: "Minimal, respectful data",
    text: "We show only work-related fields: role, company, start date and a public profile link. No contact details, ever.",
  },
] as const;

export function Features() {
  return (
    <section id="features" className="mk-section" aria-labelledby="features-title">
      <div className="mk-wrap">
        <div className="mk-section-head">
          <p className="mk-label">Features</p>
          <h2 id="features-title" style={{ marginTop: 14 }}>
            Built to answer one question honestly.
          </h2>
          <p className="mk-lede">
            Not a guess at why you were rejected. Evidence of what the person who was hired brought to the table.
          </p>
        </div>
        <div className="mk-grid-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="card mk-feature">
              <FeatureIcon name={feature.icon} />
              <h3>{feature.title}</h3>
              <p className="mk-secondary">{feature.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
