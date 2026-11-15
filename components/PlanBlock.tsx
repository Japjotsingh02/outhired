"use client";

import { InlineAlert } from "@/components/ui/InlineAlert";
import { getErrorMessage } from "@/lib/apiClient";
import { PLAN_DISPLAY, formatResetDay } from "@/lib/plans";
import { useUsage } from "@/lib/queries/usage";

/** The profile page's "Plan" block: which plan, credits used and left, and when they reset. */
export function PlanBlock() {
  const usage = useUsage();
  const data = usage.data;
  const reset = data ? formatResetDay(data.credits.resetsAt) : null;
  return (
    <div id="plan" className="card" style={{ marginTop: 8, scrollMarginTop: 80 }}>
      <p className="field-label">Plan</p>
      {usage.isError ? (
        <InlineAlert action={{ label: "Retry", onClick: () => void usage.refetch() }}>
          {getErrorMessage(usage.error)}
        </InlineAlert>
      ) : !data ? (
        <div className="skeleton" style={{ height: 44 }} aria-hidden="true" />
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{PLAN_DISPLAY[data.plan].name}</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {data.credits.used} of {data.credits.limit} credits used · {data.credits.remaining} left
              {reset ? ` · resets ${reset}` : ""}
              <br />
              {data.compare.limit === null
                ? `${data.compare.used} Compare used this month (unlimited)`
                : `${data.compare.used} of ${data.compare.limit} Compare used this month`}
            </p>
          </div>
          {data.plan === "FREE" && (
            <a className="btn-ghost" href="/pricing" style={{ textDecoration: "none" }}>
              Upgrade to Pro
            </a>
          )}
        </div>
      )}
    </div>
  );
}
