const STEPS = [
  {
    n: "01",
    title: "Add the job",
    text: "Paste the job link or the description. We pull out the company, role, team, location and the date it was posted.",
  },
  {
    n: "02",
    title: "Find who joined",
    text: "We search professional profile data for people who started at that company in a matching role within a few months of the posting.",
  },
  {
    n: "03",
    title: "Confirm the match",
    text: "Other users who applied for the same role vote on which result is the actual hire, so the best match rises to the top.",
  },
  {
    n: "04",
    title: "Compare with me",
    text: "Get a gap analysis of your resume, GitHub or portfolio against theirs: skills, experience and the steps worth taking next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mk-section" aria-labelledby="how-title">
      <div className="mk-wrap">
        <div className="mk-section-head">
          <p className="mk-label">How it works</p>
          <h2 id="how-title" style={{ marginTop: 14 }}>
            From rejection to a plan, in four steps.
          </h2>
        </div>
        <ol className="mk-steps">
          {STEPS.map((step) => (
            <li key={step.n} className="mk-step">
              <p className="mk-step-num" aria-hidden="true">
                {step.n}
              </p>
              <h3>
                <span className="sr-only">Step {Number(step.n)}: </span>
                {step.title}
              </h3>
              <p className="mk-secondary">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
