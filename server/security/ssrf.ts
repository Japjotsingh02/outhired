import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";

/** Returns the real client IP from forwarded headers. */
export function getClientIp(req: Request): string {
  return (
    (req.headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Rejects non-HTTP protocols, credentials in the URL and any hostname that
 * resolves (on ANY address) to a private, loopback, link-local or metadata IP.
 * Async because the hostname is resolved via DNS.
 */
export async function isSafeUrl(value: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return false;

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch (err) {
    console.error(`[isSafeUrl] DNS lookup failed for ${host}:`, err instanceof Error ? err.message : err);
    return false;
  }
  if (addresses.length === 0) return false;

  return addresses.every(({ address, family }) => !isBlockedAddress(address, family));
}

/** Fetches HTML while manually following redirects and re-checking each hop for safety. */
export async function fetchHtmlSafely(initialUrl: string): Promise<{
  html: string;
  finalUrl: string;
  invalidRedirect?: boolean;
}> {
  let currentUrl = initialUrl;

  for (let hops = 0; hops <= 5; hops++) {
    if (!(await isSafeUrl(currentUrl))) {
      return { html: "", finalUrl: currentUrl, invalidRedirect: true };
    }

    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OutHired/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { html: "", finalUrl: currentUrl };
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { html: await res.text(), finalUrl: currentUrl };
  }

  return { html: "", finalUrl: currentUrl };
}

/* ── Internals ────────────────────────────────────────────────────────────── */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

// Loopback, private, link-local (incl. the 169.254.169.254 metadata endpoint),
// unspecified and carrier-grade NAT ranges. IPv4 rules also cover IPv4-mapped
// IPv6 addresses (::ffff:a.b.c.d).
const blockList = new BlockList();
blockList.addSubnet("0.0.0.0", 8, "ipv4");
blockList.addSubnet("10.0.0.0", 8, "ipv4");
blockList.addSubnet("100.64.0.0", 10, "ipv4");
blockList.addSubnet("127.0.0.0", 8, "ipv4");
blockList.addSubnet("169.254.0.0", 16, "ipv4");
blockList.addSubnet("172.16.0.0", 12, "ipv4");
blockList.addSubnet("192.168.0.0", 16, "ipv4");
blockList.addAddress("::", "ipv6");
blockList.addAddress("::1", "ipv6");
blockList.addSubnet("fc00::", 7, "ipv6");
blockList.addSubnet("fe80::", 10, "ipv6");

function isBlockedAddress(address: string, family: number): boolean {
  try {
    return blockList.check(address, family === 6 ? "ipv6" : "ipv4");
  } catch (err) {
    // An address we cannot parse (e.g. an IPv6 zone id) is not safe to fetch.
    console.error(`[isSafeUrl] Could not check address ${address}:`, err instanceof Error ? err.message : err);
    return true;
  }
}
