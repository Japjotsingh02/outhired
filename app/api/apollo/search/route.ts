import { NextRequest, NextResponse } from "next/server";
import { enrichApolloPeople, fuzzyFilterByTitle, searchApolloPeople, shapePerson } from "@/lib/apollo";
import { getApolloKey } from "@/lib/apolloClient";

export async function POST(req: NextRequest) {
  try {
    const { company, role, daysWindow = 90, page = 1, perPage = 10 } = await req.json();

    if (!company || !role) {
      return NextResponse.json({ error: "company and role are required" }, { status: 400 });
    }

    if (!getApolloKey()) {
      return NextResponse.json({ error: "APOLLO_API_KEY not set in .env.local" }, { status: 500 });
    }

    const { people, source } = await searchApolloPeople(company, role, daysWindow, page, perPage);
    const filtered = fuzzyFilterByTitle(people, role);
    const ids = filtered.map((p) => p.id).filter(Boolean) as string[];
    const enrichedMap = await enrichApolloPeople(ids);

    const candidates = filtered.map((p) => {
      const enriched = p.id ? enrichedMap.get(p.id) : undefined;
      return shapePerson(enriched ? { ...p, ...enriched } : p);
    });

    return NextResponse.json({
      candidates,
      rawCount: people.length,
      filteredCount: candidates.length,
      source,
      enrichedCount: enrichedMap.size,
      page,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Apollo search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
