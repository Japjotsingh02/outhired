import { CheckIcon } from "@/components/marketing/icons";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { PLAN_DISPLAY, PRICING_NOTE, SUPPORT_EMAIL, type PlanDisplay } from "@/lib/plans";

/** "anon" = signed out. */
export type PricingViewer = "anon" | "FREE" | "PRO";

function ProButton({ viewer }: { viewer: PricingViewer }) {
  if (viewer === "PRO") {
    return (
      <button className="btn-ghost" type="button" disabled>
        Current plan
      </button>
    );
  }
  const href = viewer === "anon" ? "/signup?plan=pro" : "/pricing#upgrade";
  return (
    <a className="btn-primary" href={href}>
      Upgrade to Pro
    </a>
  );
}

function PlanCard({ plan, viewer }: { plan: PlanDisplay; viewer: PricingViewer }) {
  const isPro = plan.id === "PRO";
  return (
    <article className={`card mk-plan${isPro ? " mk-plan-pro" : ""}`} aria-labelledby={`plan-${plan.id}`}>
      <div className="mk-plan-top">
        <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
        {plan.badge && <span className="recommended-label">{plan.badge}</span>}
      </div>
      <p className="mk-plan-price">
        ${plan.priceUsd}
        <span>{plan.period === "forever" ? "forever" : `/ ${plan.period}`}</span>
      </p>
      <p className="mk-secondary">{plan.tagline}</p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature.text}>
            <CheckIcon />
            <span>
              {feature.text}
              {feature.note && <span className="mk-plan-soon">({feature.note})</span>}
            </span>
          </li>
        ))}
      </ul>
      {isPro ? (
        <ProButton viewer={viewer} />
      ) : viewer === "FREE" ? (
        <button className="btn-ghost" type="button" disabled>
          Current plan
        </button>
      ) : (
        <a className="btn-ghost" href={viewer === "PRO" ? "/dashboard" : "/signup"}>
          {viewer === "PRO" ? "Go to dashboard" : "Get started free"}
        </a>
      )}
    </article>
  );
}

/** The two plan cards, shared by the homepage and /pricing. All numbers come from lib/plans. */
export function PricingPlans({ viewer }: { viewer: PricingViewer }) {
  return (
    <div>
      <div className="mk-plans">
        <PlanCard plan={PLAN_DISPLAY.FREE} viewer={viewer} />
        <PlanCard plan={PLAN_DISPLAY.PRO} viewer={viewer} />
      </div>
      {viewer === "FREE" && (
        <div id="upgrade" className="mk-upgrade">
          <InlineAlert variant="info">
            Payments are launching soon. Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--text-primary)" }}>
              {SUPPORT_EMAIL}
            </a>{" "}
            to get Pro early.
          </InlineAlert>
        </div>
      )}
      <p className="mk-secondary mk-plan-note">{PRICING_NOTE}</p>
    </div>
  );
}
