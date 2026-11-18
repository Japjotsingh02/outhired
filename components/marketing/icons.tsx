// Inline stroke icons. Decorative, so hidden from assistive tech.
import type { ReactElement } from "react";

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CheckIcon = () => (
  <Icon>
    <path d="M4 12.5l5 5L20 6.5" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

type IconName = "parse" | "search" | "vote" | "gap" | "track" | "shield";

const PATHS: Record<IconName, ReactElement> = {
  parse: (
    <>
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M9 12h6M9 16h6M9 8h3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l6 6" />
    </>
  ),
  vote: (
    <>
      <path d="M4 12.5l5 5L20 6.5" />
      <path d="M4 20h16" />
    </>
  ),
  gap: (
    <>
      <path d="M4 5v14M20 5v14" />
      <path d="M8 12h8M8 12l2.5-2.5M8 12l2.5 2.5M16 12l-2.5-2.5M16 12l-2.5 2.5" />
    </>
  ),
  track: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
      <path d="M8 3v4M8 10v4M8 17v4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};

export function FeatureIcon({ name }: { name: IconName }) {
  return <Icon className="mk-icon">{PATHS[name]}</Icon>;
}
