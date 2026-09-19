export { APOLLO_BASE, APOLLO_LEGACY_BASE } from "@/constants";
import { APOLLO_BASE, APOLLO_LEGACY_BASE } from "@/constants";

export function getApolloKey(): string | undefined {
  return process.env.APOLLO_API_KEY;
}

export function requireApolloKey(): string {
  const key = getApolloKey();
  if (!key) throw new Error("APOLLO_API_KEY not set in .env.local");
  return key;
}

export function apolloHeaders(key = requireApolloKey()): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Accept: "application/json",
    "x-api-key": key,
  };
}
