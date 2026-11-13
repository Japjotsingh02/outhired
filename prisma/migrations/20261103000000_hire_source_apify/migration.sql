-- CreateEnum
CREATE TYPE "HireSourceKind" AS ENUM ('APIFY_NEW_HIRES', 'USER_REPORTED');

-- CreateEnum
CREATE TYPE "SearchStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- DropIndex
DROP INDEX "candidates_jobId_apolloId_key";

-- AlterTable
ALTER TABLE "candidates" DROP COLUMN "apolloId",
DROP COLUMN "apolloSource",
ADD COLUMN     "confidence" "MatchConfidence" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previousCompany" TEXT,
ADD COLUMN     "previousEndedMonth" DATE,
ADD COLUMN     "roleMatchScore" DOUBLE PRECISION,
ADD COLUMN     "seniorityBucket" TEXT,
ADD COLUMN     "source" "HireSourceKind" NOT NULL DEFAULT 'APIFY_NEW_HIRES',
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "startedMonth" DATE,
ADD COLUMN     "startedYearOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "lastSearchedAt" TIMESTAMP(3),
ADD COLUMN     "searchCostUsd" DOUBLE PRECISION,
ADD COLUMN     "searchDatasetId" TEXT,
ADD COLUMN     "searchError" TEXT,
ADD COLUMN     "searchRunId" TEXT,
ADD COLUMN     "searchStartedAt" TIMESTAMP(3),
ADD COLUMN     "searchStatus" "SearchStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "hire_search_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sinceMonth" TEXT NOT NULL,
    "keywords" TEXT[],
    "rows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hire_search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hire_search_cache_cacheKey_key" ON "hire_search_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "hire_search_cache_expiresAt_idx" ON "hire_search_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_jobId_source_externalId_key" ON "candidates"("jobId", "source", "externalId");
