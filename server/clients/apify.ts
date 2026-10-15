import "server-only";
import { z } from "zod";
import { ServiceUnavailableError, UpstreamError } from "@/server/errors";
import { getHireSearchConfig } from "@/server/env";

const API_BASE = "https://api.apify.com/v2";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_000;

/** Raised for any Apify failure. The message is safe to log: it never carries the token, headers or rows. */
export class ApifyError extends UpstreamError {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

// Ids end up in URL paths, so only plain tokens are accepted.
const ACTOR_ID = /^[A-Za-z0-9._~-]+$/;
const RESOURCE_ID = /^[A-Za-z0-9]+$/;

const runEnvelope = z.object({
  data: z.object({
    id: z.string(),
    status: z.string(),
    defaultDatasetId: z.string(),
    startedAt: z.string().nullish(),
    finishedAt: z.string().nullish(),
    statusMessage: z.string().nullish(),
    usageTotalUsd: z.number().nullish(),
  }),
});
const itemsBody = z.array(z.unknown());

export interface ApifyRun {
  runId: string;
  datasetId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  statusMessage: string | null;
  usageTotalUsd: number | null;
}

export interface StartRunOptions {
  maxTotalChargeUsd: number;
  timeoutSecs: number;
}

interface ClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

export function createApifyClient({ token, fetchImpl = fetch, retryDelayMs = RETRY_DELAY_MS }: ClientOptions) {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /**
   * One call with a timeout. With `retry`, one more attempt (~1 s later) after a network error, 429 or 5xx.
   * Calls that are not idempotent must pass retry: false.
   */
  async function request(
    method: "GET" | "POST",
    path: string,
    { body, retry }: { body?: unknown; retry: boolean },
  ): Promise<unknown> {
    const maxAttempts = retry ? 2 : 1;
    for (let attempt = 1; ; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetchImpl(`${API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined && { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Network failure or timeout: the error text is dropped on purpose.
        if (attempt < maxAttempts) {
          await sleep(retryDelayMs);
          continue;
        }
        throw new ApifyError("Apify request failed (network or timeout)");
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new ApifyError("Apify returned a response that was not JSON", response.status);
        }
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxAttempts) {
        await sleep(retryDelayMs);
        continue;
      }
      throw new ApifyError(`Apify returned HTTP ${response.status}`, response.status);
    }
  }

  function parseRun(raw: unknown): ApifyRun {
    const parsed = runEnvelope.safeParse(raw);
    if (!parsed.success) throw new ApifyError("Apify run response had an unexpected shape");
    const { data } = parsed.data;
    return {
      runId: data.id,
      datasetId: data.defaultDatasetId,
      status: data.status,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      statusMessage: data.statusMessage ?? null,
      usageTotalUsd: data.usageTotalUsd ?? null,
    };
  }

  function requireId(value: string, pattern: RegExp, what: string): string {
    if (!pattern.test(value)) throw new ApifyError(`Invalid Apify ${what}`);
    return value;
  }

  return {
    /**
     * Starts a run and returns immediately; spend is capped by maxTotalChargeUsd.
     * Never retried: a repeat could start a second billable run.
     */
    async startRun(actorId: string, input: unknown, options: StartRunOptions): Promise<ApifyRun> {
      requireId(actorId, ACTOR_ID, "actor id");
      const query = new URLSearchParams({
        maxTotalChargeUsd: String(options.maxTotalChargeUsd),
        timeout: String(Math.max(1, Math.floor(options.timeoutSecs))),
      });
      return parseRun(await request("POST", `/actors/${actorId}/runs?${query}`, { body: input, retry: false }));
    },

    async getRun(runId: string): Promise<ApifyRun> {
      requireId(runId, RESOURCE_ID, "run id");
      return parseRun(await request("GET", `/actor-runs/${runId}`, { retry: true }));
    },

    async abortRun(runId: string): Promise<void> {
      requireId(runId, RESOURCE_ID, "run id");
      await request("POST", `/actor-runs/${runId}/abort`, { retry: true });
    },

    /** Raw dataset rows; callers validate each one. */
    async getDatasetItems(datasetId: string, options: { limit: number }): Promise<unknown[]> {
      requireId(datasetId, RESOURCE_ID, "dataset id");
      const query = new URLSearchParams({ format: "json", limit: String(options.limit) });
      const parsed = itemsBody.safeParse(await request("GET", `/datasets/${datasetId}/items?${query}`, { retry: true }));
      if (!parsed.success) throw new ApifyError("Apify dataset response was not an array");
      return parsed.data;
    },
  };
}

export type ApifyClient = ReturnType<typeof createApifyClient>;

/** Client for the configured token. A missing token is a 503, never an import-time crash. */
export function getApifyClient(): ApifyClient {
  const { apifyToken } = getHireSearchConfig();
  if (!apifyToken) {
    console.error("[apify] APIFY_TOKEN is not set; hire search is unavailable");
    throw new ServiceUnavailableError("Hire search is not configured");
  }
  return createApifyClient({ token: apifyToken });
}
