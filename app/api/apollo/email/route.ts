import { NextRequest, NextResponse } from "next/server";
import { APOLLO_BASE, apolloHeaders, getApolloKey } from "@/lib/apolloClient";

export async function POST(req: NextRequest) {
  try {
    const { apolloPersonId, linkedinUrl, name, domain } = await req.json();

    if (!apolloPersonId && !linkedinUrl) {
      return NextResponse.json({ error: "apolloPersonId or linkedinUrl required" }, { status: 400 });
    }

    if (!getApolloKey()) {
      return NextResponse.json({ error: "APOLLO_API_KEY not set" }, { status: 500 });
    }

    const payload: Record<string, string> = {};
    if (apolloPersonId) payload.id = apolloPersonId;
    if (linkedinUrl) payload.linkedin_url = linkedinUrl;
    if (name) {
      const parts = name.trim().split(" ");
      payload.first_name = parts[0];
      payload.last_name = parts.slice(1).join(" ");
    }
    if (domain) payload.domain = domain;

    const res = await fetch(`${APOLLO_BASE}/people/match?reveal_personal_emails=false&reveal_phone_number=false`, {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Apollo match failed: ${res.status}`, detail: err }, { status: res.status });
    }

    const data = await res.json();
    const person = data.person;

    return NextResponse.json({
      email: person?.email ?? null,
      emailStatus: person?.email_status ?? null,
      linkedinUrl: person?.linkedin_url ?? linkedinUrl ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
