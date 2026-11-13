import { ApiError, isAbortError } from "@/lib/apiClient";

/** Retries allowed after the first failure. */
export const MAX_RETRIES = 2;

/**
 * Default retry rule for queries. Only network failures (status 0) and 5xx are retried, up to twice.
 * A 4xx answer is final, and so is a cancelled request or an error that is not an ApiError.
 * `failureCount` is the number of failures so far (0 for the first failure).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (!(error instanceof ApiError)) return false;
  const transient = error.status === 0 || error.status >= 500;
  return transient && failureCount < MAX_RETRIES;
}

/** Exponential backoff: 1 s, 2 s, then capped at 8 s. `attemptIndex` starts at 0. */
export function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}
