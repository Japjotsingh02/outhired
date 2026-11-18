import "./marketing.css";
import Link from "next/link";
import { BrandMark } from "@/components/ui";
import { MobileNav, type NavLink } from "@/components/marketing/MobileNav";

const LINKS: NavLink[] = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/** Logo, section links and the sign-in / get-started buttons. Signed-in visitors get "Go to dashboard". */
export function MarketingHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="mk-header">
      <div className="mk-wrap">
        <div className="mk-header-row">
          <Link className="mk-logo" href="/" aria-label="OutHired home">
            <BrandMark />
          </Link>
          <nav className="mk-nav" aria-label="Main">
            {LINKS.map((link) => (
              <a key={link.href} className="mk-link" href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mk-actions">
            {loggedIn ? (
              <a className="btn-primary" href="/dashboard">
                Go to dashboard
              </a>
            ) : (
              <>
                <a className="mk-link" href="/login">
                  Sign in
                </a>
                <a className="btn-primary" href="/signup">
                  Get started free
                </a>
              </>
            )}
          </div>
          <MobileNav links={LINKS} loggedIn={loggedIn} />
        </div>
      </div>
    </header>
  );
}
