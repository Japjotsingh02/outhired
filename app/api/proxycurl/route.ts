import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { scrapeLinkedInProfile, formatProxycurlForComparison } from "@/lib/proxycurl";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { linkedin_url } = body as { linkedin_url: string };

  if (!linkedin_url) {
    return NextResponse.json({ error: "linkedin_url is required" }, { status: 400 });
  }

  const profile = await scrapeLinkedInProfile(linkedin_url);
  if (!profile) {
    return NextResponse.json(
      { error: "Could not scrape LinkedIn profile. Check PROXYCURL_API_KEY or the URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    profile,
    formatted: formatProxycurlForComparison(profile),
  });
}
