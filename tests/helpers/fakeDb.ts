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
  location: string | null;
  searchStatus: "NOT_STARTED" | "RUNNING" | "DONE" | "FAILED";
  searchStartedAt: Date | null;
  lastSearchedAt: Date | null;
  searchError: string | null;
  searchCreditsUsed: number | null;
  searchTotalMatches: number | null;
  searchSkippedInternal: number | null;
}

export interface FakeCandidate {
  id: string;
  jobId: string;
  externalId: string;
  hidden: boolean;
  votes: string[];
  [key: string]: unknown;
}

export interface FakeUser {
  id: string;
  plan: "FREE" | "PRO";
  planEndsAt: Date | null;
}

export interface FakeUsageEvent {
  id: string;
  userId: string;
  kind: "HIRE_SEARCH" | "COMPARE";
  jobId: string | null;
  credits: number;
  pdlRecords: number;
  createdAt: Date;
}

export interface FakeUnlock {
  userId: string;
  jobId: string;
  candidateId: string;
}

type Where = Record<string, unknown>;

const sameValue = (actual: unknown, expected: unknown) =>
  actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;

function matches(job: FakeJob, where: Where): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR") {
      if (!(expected as Where[]).some((clause) => matches(job, clause))) return false;
      continue;
    }
    const actual = (job as unknown as Record<string, unknown>)[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const condition = expected as { not?: unknown; lt?: Date; gte?: Date };
      if ("not" in condition && sameValue(actual, condition.not)) return false;
      if ("lt" in condition) {
        if (!(actual instanceof Date) || !(actual.getTime() < (condition.lt as Date).getTime())) return false;
      }
      if ("gte" in condition) {
        if (!(actual instanceof Date) || !(actual.getTime() >= (condition.gte as Date).getTime())) return false;
      }
    } else if (!sameValue(actual, expected)) {
      return false;
    }
  }
  return true;
}

export function createFakeDb() {
  const jobs = new Map<string, FakeJob>();
  const candidates = new Map<string, FakeCandidate>();
  const cache = new Map<string, { cacheKey: string; rows: unknown; expiresAt: Date }>();
  const users = new Map<string, FakeUser>();
  const usageEvents = new Map<string, FakeUsageEvent>();
  const unlocks = new Map<string, FakeUnlock>();
  let eventSeq = 0;
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
    async count({ where }: { where: Where }) {
      return [...jobs.values()].filter((job) => matches(job, where)).length;
    },
    async aggregate({ where }: { where: Where }) {
      const sum = [...jobs.values()]
        .filter((job) => matches(job, where))
        .reduce((total, job) => total + (job.searchCreditsUsed ?? 0), 0);
      return { _sum: { searchCreditsUsed: sum } };
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
      else candidates.set(key, { id: key, jobId, externalId, hidden: false, votes: [], ...create } as FakeCandidate);
      return {};
    },
    async findMany({ where }: { where: { jobId: string; hidden: boolean } }) {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
      const score = (c: FakeCandidate) => (typeof c.roleMatchScore === "number" ? c.roleMatchScore : -1);
      const month = (c: FakeCandidate) => (c.startedMonth instanceof Date ? c.startedMonth.getTime() : Infinity);
      return [...candidates.values()]
        .filter((c) => c.jobId === where.jobId && c.hidden === where.hidden)
        .sort(
          (a, b) =>
            (rank[String(a.confidence)] ?? 1) - (rank[String(b.confidence)] ?? 1) ||
            score(b) - score(a) ||
            month(a) - month(b),
        )
        .map((c) => ({ id: c.id }));
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

  const eventMatches = (event: FakeUsageEvent, where: Where) =>
    Object.entries(where).every(([key, expected]) => {
      if (key === "createdAt") return event.createdAt.getTime() >= (expected as { gte: Date }).gte.getTime();
      return (event as unknown as Record<string, unknown>)[key] === expected;
    });

  const userDelegate = {
    // An unknown user is a FREE user, so tests that do not care about plans need no setup.
    async findUnique({ where }: { where: { id: string } }) {
      const user = users.get(where.id) ?? { id: where.id, plan: "FREE" as const, planEndsAt: null };
      return { plan: user.plan, planEndsAt: user.planEndsAt };
    },
  };

  const usageDelegate = {
    async count({ where }: { where: Where }) {
      return [...usageEvents.values()].filter((e) => eventMatches(e, where)).length;
    },
    async aggregate({ where, _sum }: { where: Where; _sum: { credits?: true; pdlRecords?: true } }) {
      const field = _sum.credits ? "credits" : "pdlRecords";
      const total = [...usageEvents.values()]
        .filter((e) => eventMatches(e, where))
        .reduce((sum, e) => sum + e[field], 0);
      return { _sum: { [field]: total } };
    },
    async create({ data }: { data: Omit<FakeUsageEvent, "id"> }) {
      const id = `ue${++eventSeq}`;
      usageEvents.set(id, { ...data, id });
      return { id };
    },
    async deleteMany({ where }: { where: { id: string } }) {
      return { count: usageEvents.delete(where.id) ? 1 : 0 };
    },
  };

  const visibleUnlocks = (where: { userId: string; jobId?: string; candidateId?: string }) =>
    [...unlocks.values()].filter(
      (u) =>
        u.userId === where.userId &&
        (where.jobId === undefined || u.jobId === where.jobId) &&
        (where.candidateId === undefined || u.candidateId === where.candidateId) &&
        [...candidates.values()].some((c) => c.id === u.candidateId && !c.hidden),
    );

  const unlockDelegate = {
    async count({ where }: { where: { userId: string; jobId?: string; candidateId?: string } }) {
      return visibleUnlocks(where).length;
    },
    async findMany({ where }: { where: { userId: string; jobId: string } }) {
      return visibleUnlocks(where).map((u) => ({ candidateId: u.candidateId }));
    },
    async createMany({ data }: { data: FakeUnlock[] }) {
      for (const row of data) unlocks.set(`${row.userId}|${row.jobId}|${row.candidateId}`, row);
      return { count: data.length };
    },
  };

  // Callback transactions run one at a time: that is what the user-row FOR UPDATE lock gives.
  let queue: Promise<unknown> = Promise.resolve();
  const transaction = async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const tx = {
      job: jobDelegate,
      candidate: candidateDelegate,
      user: userDelegate,
      usageEvent: usageDelegate,
      candidateUnlock: unlockDelegate,
      $queryRaw: async () => [],
    };
    const run = queue.then(() => (arg as (tx: unknown) => Promise<unknown>)(tx));
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    jobs,
    candidates,
    cache,
    counters,
    users,
    usageEvents,
    unlocks,
    addUser(id: string, plan: FakeUser["plan"] = "FREE", planEndsAt: Date | null = null): FakeUser {
      const user = { id, plan, planEndsAt };
      users.set(id, user);
      return user;
    },
    addUsage(
      userId: string,
      kind: FakeUsageEvent["kind"],
      createdAt: Date,
      amounts: { credits?: number; pdlRecords?: number } = {},
    ): void {
      const id = `ue${++eventSeq}`;
      usageEvents.set(id, { id, userId, kind, jobId: null, credits: 0, pdlRecords: 0, ...amounts, createdAt });
    },
    /** Marks people as already unlocked by a user on a job (by candidate id = "jobId|externalId"). */
    addUnlock(userId: string, jobId: string, candidateId: string): void {
      unlocks.set(`${userId}|${jobId}|${candidateId}`, { userId, jobId, candidateId });
    },
    addJob(overrides: Partial<FakeJob> & { id: string; userId: string }): FakeJob {
      const job: FakeJob = {
        role: "Senior Product Manager",
        company: "Stripe",
        postedMonth: new Date(Date.UTC(2026, 1, 1)),
        domain: "stripe.com",
        location: null,
        searchStatus: "NOT_STARTED",
        searchStartedAt: null,
        lastSearchedAt: null,
        searchError: null,
        searchCreditsUsed: null,
        searchTotalMatches: null,
        searchSkippedInternal: null,
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
        user: target.user,
        usageEvent: target.usageEvent,
        candidateUnlock: target.candidateUnlock,
        $transaction: target.$transaction,
      };
      Object.assign(target, {
        job: jobDelegate,
        candidate: candidateDelegate,
        hireSearchCache: cacheDelegate,
        user: userDelegate,
        usageEvent: usageDelegate,
        candidateUnlock: unlockDelegate,
        $transaction: transaction,
      });
      return () => Object.assign(target, saved);
    },
  };
}
