-- Monthly credits with per-person unlocks.
-- usage_events.creditsUsed (PDL records billed) becomes pdlRecords, kept as is; "credits" is new
-- and counts people unlocked (1 credit each). candidate_unlocks records who may see whom.

-- usage_events: rename (keeps the data) and add credits
ALTER TABLE "usage_events" RENAME COLUMN "creditsUsed" TO "pdlRecords";
ALTER TABLE "usage_events" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 0;

-- Backfill: in the old model one provider record = one person shown = one credit.
UPDATE "usage_events" SET "credits" = "pdlRecords" WHERE "kind" = 'HIRE_SEARCH';

-- CreateTable
CREATE TABLE "candidate_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_unlocks_userId_createdAt_idx" ON "candidate_unlocks"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_unlocks_candidateId_idx" ON "candidate_unlocks"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_unlocks_userId_jobId_candidateId_key" ON "candidate_unlocks"("userId", "jobId", "candidateId");

-- AddForeignKey
ALTER TABLE "candidate_unlocks" ADD CONSTRAINT "candidate_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_unlocks" ADD CONSTRAINT "candidate_unlocks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_unlocks" ADD CONSTRAINT "candidate_unlocks_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: everyone already saw every visible candidate on their own jobs; keep it that way.
INSERT INTO "candidate_unlocks" ("id", "userId", "jobId", "candidateId")
SELECT gen_random_uuid()::text, j."userId", c."jobId", c."id"
FROM "candidates" c
JOIN "jobs" j ON j."id" = c."jobId"
WHERE c."hidden" = false
ON CONFLICT ("userId", "jobId", "candidateId") DO NOTHING;
