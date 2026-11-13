// Import this first: the Prisma client wrapper needs a connection string at import time
// (it never connects until a query runs, and the tests stub every query).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
