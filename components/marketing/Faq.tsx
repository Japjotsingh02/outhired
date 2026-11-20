import { PlusIcon } from "@/components/marketing/icons";

const QUESTIONS = [
  {
    q: "What is a credit?",
    a: "1 credit = 1 person found. Free gets 3 every month, Pro gets 50. Credits reset monthly. Re-opening someone you've already found is free.",
  },
  {
    q: "How do you know who got the job?",
    a: "We don't claim certainty. We search professional profile data for people who started at that company in a matching role soon after the posting. Other users who applied for the same role then vote on which result is the real hire.",
  },
  {
    q: "What if no one shows up?",
    a: "Profiles often update weeks after someone joins, so a new hire may not be in the data yet. Try the search again later. A search that finds nobody costs no credits.",
  },
  {
    q: "What do I need for Compare with me?",
    a: "A completed profile. Everything else works without one.",
  },
  {
    q: "Can I contact the people I find?",
    a: "No. We show no contact details, only a public profile link. Please be respectful: they are here to be learned from, not messaged.",
  },
  {
    q: "I'm in the results. Can I be removed?",
    a: (
      <>
        Yes. Send a removal request from the <a href="/privacy#removal" style={{ color: "var(--text-primary)" }}>privacy page</a> and
        we will take you off the results.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="mk-section" aria-labelledby="faq-title">
      <div className="mk-wrap">
        <div className="mk-section-head">
          <p className="mk-label">FAQ</p>
          <h2 id="faq-title" style={{ marginTop: 14 }}>
            Questions, answered plainly.
          </h2>
        </div>
        <div className="mk-faq">
          {QUESTIONS.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <PlusIcon />
              </summary>
              <p className="mk-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
