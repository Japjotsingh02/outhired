import { CheckIcon } from "@/components/marketing/icons";

const CHECKS = [
  "No emails or phone numbers shown",
  "Only work history fields are stored",
  "Simple removal request for anyone listed",
];

export function PrivacyBand() {
  return (
    <section className="mk-section mk-band" aria-labelledby="privacy-title">
      <div className="mk-wrap mk-band-grid">
        <div>
          <p className="mk-label">Privacy</p>
          <h2 id="privacy-title">Fair to you, and to the people you look up.</h2>
          <p className="mk-lede">
            OutHired is for learning, not contacting or tracking people. Results come from professional profile data and may
            be incomplete. Anyone can ask to be removed from results.
          </p>
          <a className="mk-text-link" href="/privacy">
            Read our privacy policy
          </a>
        </div>
        <ul className="mk-checks">
          {CHECKS.map((text) => (
            <li key={text}>
              <CheckIcon />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
