"use client";

import { useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/marketing/icons";

export interface NavLink {
  href: string;
  label: string;
}

/** The phone-width menu: a button that opens the same links and buttons as the desktop header. */
export function MobileNav({
  links,
  loggedIn,
}: {
  links: NavLink[];
  loggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mk-toggle"
        aria-expanded={open}
        aria-controls="mk-mobile-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      <div id="mk-mobile-panel" className={`mk-mobile-panel${open ? " open" : ""}`} style={{ width: "100%", flexBasis: "100%" }}>
        <nav aria-label="Mobile">
          {links.map((link) => (
            <a key={link.href} className="mk-link" href={link.href} onClick={() => setOpen(false)}>
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
              <a className="btn-ghost" href="/login">
                Sign in
              </a>
              <a className="btn-primary" href="/signup">
                Get started free
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}
