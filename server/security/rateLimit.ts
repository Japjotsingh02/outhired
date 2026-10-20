import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { RATE_LIMIT, RATE_WINDOW_MS } from "@/constants";

export interface RateLimitOptions {
  /** Namespace for the counter, e.g. "parse-job" or "hire-search". */
  scope?: string;
  limit?: number;
  windowMs?: number;
}

/** In-memory fallback when Redis is unavailable. Each entry remembers its own window. */
const localWindows = new Map<string, { timestamps: number[]; windowMs: number }>();

const REDIS_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {count + 1, 0}
`;

export interface RateLimitResult {
  limited: boolean;
  /** Whole seconds until a slot frees up; 0 when not limited. */
  retryAfterSeconds: number;
}

/**
 * Counts this call and says whether the caller should be blocked, and for how long.
 * Throws if Redis is reachable but errors.
 */
export async function checkRateLimit(
  ip: string,
  { scope = "parse-job", limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS }: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) return checkLocally(`${scope}:${ip}`, limit, windowMs);

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
        `outhired:${scope}:${keyHash}`,
        String(Date.now()),
        String(windowMs),
        String(limit),
        randomUUID(),
      ],
    ]),
    signal: AbortSignal.timeout(4_000),
  });

  if (!res.ok) throw new Error("Upstash rate limit request failed");
  const data = (await res.json()) as Array<{ result?: [number, number]; error?: string }>;
  if (data[0]?.error || !Array.isArray(data[0]?.result)) throw new Error("Upstash rate limit request failed");
  const [count, retryMs] = data[0].result;
  return { limited: Number(count) === 0, retryAfterSeconds: Math.max(1, Math.ceil(Number(retryMs) / 1000)) };
}

function checkLocally(rawKey: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  // Drop every expired entry so the map cannot grow without bound.
  for (const [windowKey, entry] of localWindows) {
    const last = entry.timestamps[entry.timestamps.length - 1];
    if (last === undefined || now - last >= entry.windowMs) localWindows.delete(windowKey);
  }
  const key = createHash("sha256").update(rawKey).digest("hex");
  const recent = (localWindows.get(key)?.timestamps ?? []).filter((t) => now - t < windowMs);
  const limited = recent.length >= limit;
  if (!limited) recent.push(now);
  localWindows.set(key, { timestamps: recent, windowMs });
  return {
    limited,
    retryAfterSeconds: limited ? Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) : 0,
  };
}
