"use client";

import { InlineAlert } from "@/components/ui/InlineAlert";
import { getErrorMessage } from "@/lib/apiClient";
import { PLAN_DISPLAY, formatResetDay, type UsageMeter } from "@/lib/plans";
import { useUsage } from "@/lib/queries/usage";

function meterText(meter: UsageMeter, noun: string): string {
  const reset = formatResetDay(meter.resetsAt);
  if (meter.limit === null) return `${meter.used} ${noun} used (unlimited)`;
  return `${meter.used} of ${meter.limit} ${noun} used${reset ? ` this month, resets ${reset}` : ""}`;
}

/** The profile page's small "Plan" block: which plan, and what has been used. */
export function PlanBlock() {
  const usage = useUsage();
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="field-label">Plan</p>
      {usage.isError ? (
        <InlineAlert action={{ label: "Retry", onClick: () => void usage.refetch() }}>
          {getErrorMessage(usage.error)}
        </InlineAlert>
      ) : !usage.data ? (
        <div className="skeleton" style={{ height: 44 }} aria-hidden="true" />
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{PLAN_DISPLAY[usage.data.plan].name}</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {meterText(usage.data.hireSearch, usage.data.hireSearch.limit === 1 ? "new-hire search" : "new-hire searches")}
              <br />
              {meterText(usage.data.compare, usage.data.compare.limit === 1 ? "Compare" : "Compares")}
            </p>
          </div>
          {usage.data.plan === "FREE" && (
            <a className="btn-ghost" href="/pricing" style={{ textDecoration: "none" }}>
              Upgrade to Pro
            </a>
          )}
        </div>
      )}
    </div>
  );
}
