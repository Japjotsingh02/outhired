import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { handleGlobalError } from "@/lib/queries/globalError";
import { retryDelay, shouldRetry } from "@/lib/queries/retry";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleGlobalError }),
    mutationCache: new MutationCache({ onError: handleGlobalError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        retryDelay,
      },
      mutations: { retry: 0 },
    },
  });
}

let browserClient: QueryClient | undefined;

/** A new client per request on the server, one shared client in the browser. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}
