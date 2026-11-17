import "server-only";
import { z } from "zod";
import { RateLimitedError, ServiceUnavailableError, UpstreamError } from "@/server/errors";
import { getHireSearchConfig } from "@/server/env";

const SEARCH_URL = "https://api.peopledatalabs.com/v5/person/search";
const REQUEST_TIMEOUT_MS = 15_000;

/** Raised for a PDL failure. The message is safe to log: it never carries the key, headers or records. */
export class PdlError extends UpstreamError {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

// Only the envelope is checked here; every record is validated one by one by the caller.
const searchEnvelope = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(z.unknown()),
});

// PDL's error body: { status, error: { type, message } }. The message describes the problem
// with the request (for a 400, the bad part of the query), never a person.
const errorEnvelope = z.object({
  error: z.object({ type: z.string().optional(), message: z.string().optional() }).optional(),
});

export interface PdlSearchInput {
  /** Elasticsearch query (PDL's recommended form). */
  query: Record<string, unknown>;
  /** Records to return: PDL charges one credit per record. */
  size: number;
  /** Optional field list for PDL's data_include. Leave unset to get the default payload. */
  dataInclude?: string[];
}

export interface PdlSearchResult {
  /** All matches in PDL, not just the ones returned. */
  total: number;
  records: unknown[];
}

interface ClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (!raw || !/^\d{1,6}$/.test(raw.trim())) return undefined;
  const seconds = Number(raw.trim());
  return seconds > 0 ? seconds : undefined;
}

/** PDL's own description of what was wrong with the request, shortened. Never a record. */
async function errorMessageOf(response: Response): Promise<string> {
  try {
    const parsed = errorEnvelope.safeParse(await response.json());
    const message = parsed.success ? parsed.data.error?.message : undefined;
    return (message ?? "no message").replace(/\s+/g, " ").slice(0, 300);
  } catch {
    return "no message";
  }
}

export function createPdlClient({ apiKey, fetchImpl = fetch }: ClientOptions) {
  return {
    /**
     * One person search. Never retried: a retry after a lost response could be billed twice.
     * Zero matches (404, or 200 with total 0) is an empty result, not an error.
     */
    async searchPeople({ query, size, dataInclude }: PdlSearchInput): Promise<PdlSearchResult> {
      const body = {
        query,
        size,
        ...(dataInclude && dataInclude.length > 0 && { data_include: dataInclude.join(",") }),
      };

      let response: Response;
      try {
        response = await fetchImpl(SEARCH_URL, {
          method: "POST",
          headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Network failure or timeout: the error text is dropped on purpose.
        console.error("[pdl] Request failed (network or timeout)");
        throw new PdlError("PDL request failed (network or timeout)");
      }

      if (response.status === 404) {
        console.info("[pdl] Search finished: total=0 records=0");
        return { total: 0, records: [] };
      }
      if (response.status === 402) {
        console.error("[pdl] Credit limit reached (HTTP 402)");
        throw new RateLimitedError("Search limit reached", undefined, "LIMIT_REACHED");
      }
      if (response.status === 429) {
        console.error("[pdl] Rate limited (HTTP 429)");
        throw new RateLimitedError("PDL is rate limiting requests", undefined, "RATE_LIMITED", retryAfterSeconds(response));
      }
      if (response.status === 401) {
        console.error("[pdl] PDL key rejected (HTTP 401)");
        throw new PdlError("PDL rejected the API key", 401);
      }
      if (response.status === 400) {
        console.error(`[pdl] Bad request (HTTP 400): ${await errorMessageOf(response)}`);
        throw new PdlError("PDL rejected the search query", 400);
      }
      if (!response.ok) {
        console.error(`[pdl] PDL returned HTTP ${response.status}`);
        throw new PdlError(`PDL returned HTTP ${response.status}`, response.status);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        console.error("[pdl] Response was not JSON");
        throw new PdlError("PDL returned a response that was not JSON", response.status);
      }
      const parsed = searchEnvelope.safeParse(json);
      if (!parsed.success) {
        console.error("[pdl] Response had an unexpected shape");
        throw new PdlError("PDL response had an unexpected shape", response.status);
      }
      console.info(`[pdl] Search finished: total=${parsed.data.total} records=${parsed.data.data.length}`);
      return { total: parsed.data.total, records: parsed.data.data };
    },
  };
}

export type PdlClient = ReturnType<typeof createPdlClient>;

/** Client for the configured key. A missing key is a 503, never an import-time crash. */
export function getPdlClient(): PdlClient {
  const { pdlApiKey } = getHireSearchConfig();
  if (!pdlApiKey) {
    console.error("[pdl] PDL_API_KEY is not set; hire search is unavailable");
    throw new ServiceUnavailableError("Hire search is not configured");
  }
  return createPdlClient({ apiKey: pdlApiKey });
}
