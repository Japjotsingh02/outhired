import { isApiError, redirectIfAuthExpired } from "@/lib/apiClient";

/**
 * The only two things the global handlers do: send an expired session to the login page, and, in
 * development, log the requestId. They never show a toast or an alert; each screen owns its message.
 */
export function handleGlobalError(error: unknown): void {
  redirectIfAuthExpired(error);
  if (process.env.NODE_ENV === "development" && isApiError(error) && error.requestId) {
    console.warn(`[query] ${error.code} (status ${error.status}) requestId=${error.requestId}`);
  }
}
