import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// Load .env.local so prisma CLI commands (db push, migrate, studio, etc.)
// pick up DATABASE_URL — Next.js does this automatically, but the Prisma
// CLI is a plain Node process and does not.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
