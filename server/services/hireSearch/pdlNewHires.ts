import "server-only";
import { getPdlClient, type PdlClient } from "@/server/clients/pdl";
import { countryFromLocation } from "@/server/services/hireSearch/country";
import { buildPdlQuery, searchFingerprint } from "@/server/services/hireSearch/pdlQuery";
import { mapPdlRecords } from "@/server/services/hireSearch/pdlRecord";
import { buildRoleFilter } from "@/server/services/hireSearch/roleMapping";
import type { HireSource, SearchInput, SearchOutcome } from "@/server/services/hireSearch/types";

/** People Data Labs person search, as a "who joined this company" source. Pass a client in tests. */
export function createPdlNewHiresSource(clientFactory: () => PdlClient = getPdlClient): HireSource {
  return {
    kind: "PDL",

    fingerprint(input: SearchInput): string {
      return searchFingerprint(buildRoleFilter(input.role), countryFromLocation(input.location));
    },

    async search(input: SearchInput): Promise<SearchOutcome> {
      const roleFilter = buildRoleFilter(input.role);
      const country = countryFromLocation(input.location);
      const client = clientFactory();
      const run = (withCountry: string | null) =>
        client.searchPeople({
          query: buildPdlQuery({
            domain: input.domain,
            sinceMonth: input.sinceMonth,
            untilMonth: input.untilMonth,
            roleFilter,
            country: withCountry,
          }),
          size: input.size,
        });

      let result = await run(country);
      // A country filter that finds nobody is tried once more without it (a search with no
      // matches returns no records, so the first call cost no credits).
      if (result.total === 0 && country) result = await run(null);

      const mapped = mapPdlRecords(result.records, {
        domain: input.domain,
        sinceMonth: input.sinceMonth,
        untilMonth: input.untilMonth,
      });
      // Counts only: never a name, a URL or any other record content.
      console.info(
        `[hireSearch] PDL: total=${result.total} returned=${result.records.length} hires=${mapped.records.length} internal=${mapped.skippedInternal} invalid=${mapped.invalid}`,
      );
      return {
        records: mapped.records,
        total: result.total,
        skippedInternal: mapped.skippedInternal,
        // PDL bills one credit per record returned, including any we then drop.
        creditsUsed: result.records.length,
      };
    },
  };
}
