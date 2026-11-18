import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { SUPPORT_EMAIL } from "@/lib/plans";
import { getViewer } from "@/server/services/billing/viewer";

export const metadata: Metadata = {
  title: "Terms: OutHired",
  description: "The terms for using OutHired.",
};

export const dynamic = "force-dynamic";

// TODO: replace this placeholder with the real terms of service before launch.
export default async function TermsPage() {
  const viewer = await getViewer();
  return (
    <div className="mk-page">
      <MarketingHeader loggedIn={viewer.loggedIn} />
      <main className="mk-wrap">
        <div className="mk-prose">
          <h1>Terms</h1>
          <p>The full terms are still being written. This page is a placeholder.</p>
          <p>
            Questions in the meantime: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
