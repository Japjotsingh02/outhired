import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { RATE_LIMIT, RATE_WINDOW_MS } from "@/constants";

/** In-memory fallback when Redis is unavailable. */
const localWindows = new Map<string, number[]>();

const REDIS_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return count + 1
`;

/** Returns true when the caller should be blocked. Throws if Redis is reachable but errors. */
export async function isRateLimited(ip: string): Promise<boolean> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) return isLocallyRateLimited(ip);

  const keyHash = createHash("sha256").update(ip).digest("hex");
  const res = await fetch(`${redisUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      [
        "EVAL",
        REDIS_SCRIPT,
        "1",
        `outhired:parse-job:${keyHash}`,
        String(Date.now()),
        String(RATE_WINDOW_MS),
        String(RATE_LIMIT),
        randomUUID(),
      ],
    ]),
    signal: AbortSignal.timeout(4_000),
  });

  if (!res.ok) throw new Error("Upstash rate limit request failed");
  const data = (await res.json()) as Array<{ result?: number; error?: string }>;
  if (data[0]?.error) throw new Error("Upstash rate limit request failed");
  return Number(data[0]?.result) === 0;
}

function isLocallyRateLimited(ip: string): boolean {
  const now = Date.now();
  // Drop every expired entry so the map cannot grow without bound.
  for (const [windowKey, timestamps] of localWindows) {
    const last = timestamps[timestamps.length - 1];
    if (last === undefined || now - last >= RATE_WINDOW_MS) localWindows.delete(windowKey);
  }
  const key = createHash("sha256").update(ip).digest("hex");
  const recent = (localWindows.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  const limited = recent.length >= RATE_LIMIT;
  if (!limited) recent.push(now);
  localWindows.set(key, recent);
  return limited;
}
