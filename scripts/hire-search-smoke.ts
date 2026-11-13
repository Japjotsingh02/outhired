/**
 * Manual smoke test for the hire-search provider. Not run in CI and not part of `npm test`.
 *
 *   APIFY_TOKEN=... node --conditions=react-server --import tsx scripts/hire-search-smoke.ts stripe.com
 *
 * Runs the actor for one domain with a tiny result and spend cap, then prints ONLY
 * counts, the status breakdown, a start-month histogram and the cost. No names or URLs.
 */
import { createApifyClient } from "@/server/clients/apify";
import { parseDatasetRows } from "@/server/services/hireSearch/apifyNewHires";
import { normalizeCompanyDomain } from "@/lib/domain";

const MAX_RESULTS = 5;
const MAX_CHARGE_USD = 0.05;
const POLL_MS = 3_000;
const GIVE_UP_MS = 4 * 60 * 1000;
const FINISHED = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Set APIFY_TOKEN in the environment.");
  const domain = normalizeCompanyDomain(process.argv[2] ?? "");
  if (!domain) throw new Error("Pass a company domain, for example: stripe.com");

  const actorId = process.env.HIRE_ACTOR_ID ?? "b2bsearch~new-hires-finder";
  const client = createApifyClient({ token });
  const startedAt = Date.now();

  let run = await client.startRun(
    actorId,
    { companyDomains: [domain], sinceMonths: 6, maxResults: MAX_RESULTS, maxPerCompany: MAX_RESULTS },
    { maxTotalChargeUsd: MAX_CHARGE_USD, timeoutSecs: 180 },
  );
  console.log(`run started: ${run.runId} (${run.status})`);

  while (!FINISHED.has(run.status)) {
    if (Date.now() - startedAt > GIVE_UP_MS) {
      await client.abortRun(run.runId);
      throw new Error("Gave up waiting; run aborted.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    run = await client.getRun(run.runId);
  }
  console.log(`run finished: ${run.status}${run.statusMessage ? ` (${run.statusMessage})` : ""}`);

  const items = await client.getDatasetItems(run.datasetId, { limit: MAX_RESULTS + 50 });
  const statusBreakdown: Record<string, number> = {};
  for (const item of items) {
    const status = String((item as { _status?: unknown } | null)?._status ?? "unknown");
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
  }

  const parsed = parseDatasetRows(items);
  const histogram: Record<string, number> = {};
  for (const record of parsed.records) {
    const key = record.startPrecision === "year" ? `${record.startedMonth.slice(0, 4)} (year only)` : record.startedMonth;
    histogram[key] = (histogram[key] ?? 0) + 1;
  }

  console.log(`rows: ${items.length} total, ${parsed.records.length} valid found, ${parsed.invalid} invalid found, ${parsed.notFound} notes`);
  console.log("status breakdown:", statusBreakdown);
  console.log("start-month histogram:", Object.fromEntries(Object.entries(histogram).sort()));
  console.log(`cost: ${run.usageTotalUsd === null ? "unknown" : `$${run.usageTotalUsd.toFixed(4)}`}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Smoke test failed");
  process.exit(1);
});
