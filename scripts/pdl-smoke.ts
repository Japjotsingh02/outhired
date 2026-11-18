/**
 * Live check of the PDL hire search for one company. Uses credits (1 per record returned).
 *
 *   npm run pdl:smoke -- stripe.com [YYYY-MM] [role] [size]
 *
 * Reads PDL_API_KEY from the environment (the npm script loads .env.local). Prints only counts:
 * no names, no profile links, no key. Defaults: window starting 3 months ago, role "Software
 * Engineer", size 3 (at most 25).
 */
import { normalizeCompanyDomain } from "@/lib/domain";
import { parseYearMonth, formatYearMonth } from "@/lib/postedMonth";
import { createPdlClient } from "@/server/clients/pdl";
import { createPdlNewHiresSource } from "@/server/services/hireSearch/pdlNewHires";
import { hireWindow } from "@/server/services/hireSearch/window";

const MAX_SIZE = 25;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const [domainArg, monthArg, roleArg, sizeArg] = process.argv.slice(2);
  const apiKey = process.env.PDL_API_KEY?.trim();
  if (!apiKey) fail("Set PDL_API_KEY in the environment.");
  const domain = domainArg ? normalizeCompanyDomain(domainArg) : null;
  if (!domain) fail("Usage: npm run pdl:smoke -- <company-domain> [YYYY-MM] [role] [size]");

  const now = new Date();
  const defaultStart = formatYearMonth({
    year: now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1,
    month: ((now.getUTCMonth() + 12 - 3) % 12) + 1,
  });
  const since = monthArg ?? defaultStart;
  const parsedSince = parseYearMonth(since);
  if (!parsedSince) fail(`The start month must look like 2026-06 (got "${since}").`);
  const size = sizeArg ? Math.min(Math.max(1, Number.parseInt(sizeArg, 10) || 3), MAX_SIZE) : 3;
  const role = roleArg?.trim() || "Software Engineer";

  const window = hireWindow(new Date(Date.UTC(parsedSince.year, parsedSince.month - 1, 1)));
  const source = createPdlNewHiresSource(() => createPdlClient({ apiKey }));
  const outcome = await source.search({
    domain,
    sinceMonth: window.sinceMonth,
    untilMonth: window.untilMonth,
    role,
    location: null,
    size,
  });

  const histogram = new Map<string, number>();
  for (const record of outcome.records) {
    histogram.set(record.startedMonth, (histogram.get(record.startedMonth) ?? 0) + 1);
  }

  console.log(`company:           ${domain}`);
  console.log(`window:            ${window.sinceMonth} to ${window.untilMonth}`);
  console.log(`role filter:       ${source.fingerprint({ domain, ...window, role, location: null, size })}`);
  console.log(`total matches:     ${outcome.total}`);
  console.log(`records returned:  ${outcome.creditsUsed}`);
  console.log(`new hires:         ${outcome.records.length}`);
  console.log(`internal moves:    ${outcome.skippedInternal}`);
  console.log(
    `start months:      ${
      histogram.size === 0
        ? "(none)"
        : [...histogram.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => `${month}=${count}`).join(" ")
    }`,
  );
  console.log(`credits used:      ${outcome.creditsUsed}`);
}

main().catch((err: unknown) => {
  // The client's errors never contain the key or any record content.
  console.error(`Search failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
