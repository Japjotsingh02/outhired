"use client";

import { useUsage } from "@/lib/queries/usage";
import { usageLine } from "@/lib/plans";

/** One quiet line under a button: how many searches or Compares are left. Nothing while loading or unlimited. */
export function UsageNote({ feature }: { feature: "hireSearch" | "compare" }) {
  const { data } = useUsage();
  // A note is optional: if the usage answer is missing or odd, show nothing rather than break the panel.
  const meter = data?.[feature];
  if (!data || !meter) return null;
  const text = usageLine(data.plan, meter, feature === "hireSearch" ? "search" : "Compare");
  if (!text) return null;
  return <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{text}</p>;
}
