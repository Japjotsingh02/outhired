import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { getViewer } from "@/server/services/billing/viewer";

const DESCRIPTION = "Free to try on the role that stung the most. Pro for an active search across many companies.";

export const metadata: Metadata = {
  title: "Pricing: OutHired",
  description: DESCRIPTION,
  openGraph: { title: "Pricing: OutHired", description: DESCRIPTION, type: "website", siteName: "OutHired" },
};

// The buttons depend on who is signed in, so this page is rendered per request.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const viewer = await getViewer();
  return (
    <div className="mk-page">
      <MarketingHeader loggedIn={viewer.loggedIn} />
      <main className="mk-wrap" style={{ padding: "72px 24px 96px" }}>
        <div className="mk-section-head" style={{ margin: "0 auto 44px", textAlign: "center" }}>
          <p className="mk-label">Pricing</p>
          <h1 style={{ fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.08, margin: "14px 0" }}>
            Start free. Upgrade when the search gets serious.
          </h1>
          <p className="mk-lede">{DESCRIPTION}</p>
        </div>
        <PricingPlans viewer={viewer.pricing} />
      </main>
      <MarketingFooter />
    </div>
  );
}
