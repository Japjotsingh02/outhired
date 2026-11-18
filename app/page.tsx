import type { Metadata } from "next";
import { Faq } from "@/components/marketing/Faq";
import { Features } from "@/components/marketing/Features";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { PrivacyBand } from "@/components/marketing/PrivacyBand";
import { getViewer } from "@/server/services/billing/viewer";

const TITLE = "OutHired: See who got the job";
const DESCRIPTION =
  "Paste a role you were rejected from. OutHired finds the people who joined that company in that role soon after, then shows you where your profile and theirs differ.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "OutHired" },
};

// Reads the session to switch the header button, so this page is rendered per request.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <div className="mk-page">
      <MarketingHeader loggedIn={viewer.loggedIn} />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <PrivacyBand />
        <section id="pricing" className="mk-section" aria-labelledby="pricing-title">
          <div className="mk-wrap">
            <div className="mk-section-head" style={{ margin: "0 auto 44px", textAlign: "center" }}>
              <p className="mk-label">Pricing</p>
              <h2 id="pricing-title" style={{ marginTop: 14 }}>
                Start free. Upgrade when the search gets serious.
              </h2>
            </div>
            <PricingPlans viewer={viewer.pricing} />
          </div>
        </section>
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
