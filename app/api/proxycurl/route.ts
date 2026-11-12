import { NextRequest, NextResponse } from "next/server";
import { handle, readJsonBody } from "@/server/http";
import { BadRequestError, UpstreamError } from "@/server/errors";
import { getSessionOrThrow } from "@/server/security/auth";
import { scrapeLinkedInProfile, formatProxycurlForComparison } from "@/lib/proxycurl";

export const POST = handle(async (req: NextRequest) => {
  await getSessionOrThrow();

  const body = await readJsonBody(req);
  const { linkedin_url } = (body ?? {}) as { linkedin_url: string };

  if (!linkedin_url) throw new BadRequestError("linkedin_url is required");

  const profile = await scrapeLinkedInProfile(linkedin_url);
  if (!profile) {
    throw new UpstreamError("Could not scrape LinkedIn profile. Check PROXYCURL_API_KEY or the URL.");
  }

  return NextResponse.json({
    profile,
    formatted: formatProxycurlForComparison(profile),
  });
});
