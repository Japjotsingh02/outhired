import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { SUPPORT_EMAIL } from "@/lib/plans";
import { getViewer } from "@/server/services/billing/viewer";

export const metadata: Metadata = {
  title: "Privacy: OutHired",
  description: "How OutHired treats the people who appear in results, and how to ask to be removed.",
};

export const dynamic = "force-dynamic";

// TODO: replace this placeholder with the full privacy policy before launch.
export default async function PrivacyPage() {
  const viewer = await getViewer();
  return (
    <div className="mk-page">
      <MarketingHeader loggedIn={viewer.loggedIn} />
      <main className="mk-wrap">
        <div className="mk-prose">
          <h1>Privacy</h1>
          <p>
            OutHired is for learning, not contacting or tracking people. Results come from professional profile data and may
            be incomplete. We show only work-related fields: role, company, start date and a public profile link. We never
            show emails or phone numbers.
          </p>
          <p>The full privacy policy is still being written. This page is a placeholder.</p>
          <h2 id="removal">Removal request</h2>
          <p>
            If you appear in results and want to be removed, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Removal%20request`}>{SUPPORT_EMAIL}</a> with a link to the public profile
            that is shown. We will remove it from results.
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
