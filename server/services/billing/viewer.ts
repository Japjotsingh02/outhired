import "server-only";
import type { PricingViewer } from "@/components/marketing/PricingPlans";
import { getOptionalUserId } from "@/server/security/auth";
import { getPlanId } from "@/server/services/billing/entitlements";

export interface Viewer {
  loggedIn: boolean;
  /** What the pricing buttons need: "anon" for a visitor, otherwise the user's plan. */
  pricing: PricingViewer;
}

/** Who is looking at a public page. Never throws: a failed lookup shows the signed-out page. */
export async function getViewer(): Promise<Viewer> {
  try {
    const userId = await getOptionalUserId();
    if (!userId) return { loggedIn: false, pricing: "anon" };
    return { loggedIn: true, pricing: (await getPlanId(userId)) ?? "FREE" };
  } catch (err) {
    console.error(
      "[viewer] Lookup failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { loggedIn: false, pricing: "anon" };
  }
}
