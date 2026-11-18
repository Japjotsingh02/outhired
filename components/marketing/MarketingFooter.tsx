import { SUPPORT_EMAIL } from "@/lib/plans";

export function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-wrap mk-footer-row">
        <small>© 2026 OutHired</small>
        <nav aria-label="Footer">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/privacy#removal">Removal request</a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
        </nav>
      </div>
    </footer>
  );
}
