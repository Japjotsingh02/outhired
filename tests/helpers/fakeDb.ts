import "./testEnv";

/**
 * In-memory stand-in for the few Prisma calls the hire-search repositories make.
 * Installed on the real client object, so the repositories and services run unchanged
 * and no database is touched.
 */

export interface FakeJob {
  id: string;
  userId: string;
  role: string;
  company: string;
  postedMonth: Date;
  domain: string | null;
  searchStatus: "NOT_STARTED" | "RUNNING" | "DONE" | "FAILED";
  searchRunId: string | null;
  searchDatasetId: string | null;
  searchStartedAt: Date | null;
  lastSearchedAt: Date | null;
  searchError: string | null;
  searchCostUsd: number | null;
}

export interface FakeCandidate {
  jobId: string;
  externalId: string;
  hidden: boolean;
  votes: string[];
  [key: string]: unknown;
}

type Where = Record<string, unknown>;

function matches(job: FakeJob, where: Where): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR") {
      if (!(expected as Where[]).some((clause) => matches(job, clause))) return false;
      continue;
    }
    const actual = (job as unknown as Record<string, unknown>)[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const condition = expected as { not?: unknown; lt?: Date };
      if ("not" in condition && actual === condition.not) return false;
      if ("lt" in condition) {
        if (!(actual instanceof Date) || !(actual.getTime() < (condition.lt as Date).getTime())) return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

export function createFakeDb() {
  const jobs = new Map<string, FakeJob>();
  const candidates = new Map<string, FakeCandidate>();
  const cache = new Map<string, { cacheKey: string; rows: unknown; expiresAt: Date }>();
  const counters = { candidateUpserts: 0, cacheWrites: 0 };

  const visibleCount = (jobId: string) =>
    [...candidates.values()].filter((c) => c.jobId === jobId && !c.hidden).length;

  const jobDelegate = {
    async findFirst({ where }: { where: { id: string; userId: string } }) {
      const job = jobs.get(where.id);
      if (!job || job.userId !== where.userId) return null;
      return { ...job, _count: { candidates: visibleCount(job.id) } };
    },
    async update({ where, data }: { where: { id: string }; data: Partial<FakeJob> }) {
      const job = jobs.get(where.id)!;
      Object.assign(job, data);
      return { id: job.id };
    },
    async updateMany({ where, data }: { where: Where; data: Partial<FakeJob> }) {
      let count = 0;
      for (const job of jobs.values()) {
        if (matches(job, where)) {
          Object.assign(job, data);
          count++;
        }
      }
      return { count };
    },
  };

  const candidateDelegate = {
    async upsert({
      where,
      create,
      update,
    }: {
      where: { jobId_source_externalId: { jobId: string; externalId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      counters.candidateUpserts++;
      const { jobId, externalId } = where.jobId_source_externalId;
      const key = `${jobId}|${externalId}`;
      const existing = candidates.get(key);
      if (existing) Object.assign(existing, update);
      else candidates.set(key, { jobId, externalId, hidden: false, votes: [], ...create } as FakeCandidate);
      return {};
    },
  };

  const cacheDelegate = {
    async findUnique({ where }: { where: { cacheKey: string } }) {
      return cache.get(where.cacheKey) ?? null;
    },
    async upsert({ where, create }: { where: { cacheKey: string }; create: { rows: unknown; expiresAt: Date } }) {
      counters.cacheWrites++;
      cache.set(where.cacheKey, { cacheKey: where.cacheKey, rows: create.rows, expiresAt: create.expiresAt });
      return {};
    },
    async deleteMany({ where }: { where: { expiresAt: { lt: Date } } }) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt.getTime() < where.expiresAt.lt.getTime()) cache.delete(key);
      }
      return { count: 0 };
    },
  };

  const transaction = async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: unknown) => Promise<unknown>)({ job: jobDelegate, candidate: candidateDelegate });
  };

  return {
    jobs,
    candidates,
    cache,
    counters,
    addJob(overrides: Partial<FakeJob> & { id: string; userId: string }): FakeJob {
      const job: FakeJob = {
        role: "Senior Product Manager",
        company: "Stripe",
        postedMonth: new Date(Date.UTC(2026, 1, 1)),
        domain: "stripe.com",
        searchStatus: "NOT_STARTED",
        searchRunId: null,
        searchDatasetId: null,
        searchStartedAt: null,
        lastSearchedAt: null,
        searchError: null,
        searchCostUsd: null,
        ...overrides,
      };
      jobs.set(job.id, job);
      return job;
    },
    /** Replaces the Prisma delegates; returns a function that puts the originals back. */
    async install(): Promise<() => void> {
      const { prisma } = await import("@/server/db");
      const target = prisma as unknown as Record<string, unknown>;
      const saved = {
        job: target.job,
        candidate: target.candidate,
        hireSearchCache: target.hireSearchCache,
        $transaction: target.$transaction,
      };
      Object.assign(target, {
        job: jobDelegate,
        candidate: candidateDelegate,
        hireSearchCache: cacheDelegate,
        $transaction: transaction,
      });
      return () => Object.assign(target, saved);
    },
  };
}
