import { z } from "zod";

// Server-only in practice: never import this from a client component.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),
  PROXYCURL_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function load(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}

/** Typed, validated environment. Parsed on first property access, not on import. */
export const env: Env = new Proxy({} as Env, {
  get: (_target, property) => load()[property as keyof Env],
});
