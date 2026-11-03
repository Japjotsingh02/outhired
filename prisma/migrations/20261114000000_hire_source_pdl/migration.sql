-- Replace the Apify hire source with People Data Labs (PDL). Dev data is fake, so rows written
-- by the old source are removed first (the enum value cannot be dropped while rows use it).

-- Candidates from the old source (their votes and profile matches go with them: ON DELETE CASCADE).
DELETE FROM "candidates" WHERE "source"::text = 'APIFY_NEW_HIRES';

-- The shared cache holds provider rows in the old shape.
DELETE FROM "hire_search_cache";

-- Searches that finished or failed against the old source can be run again with PDL.
UPDATE "jobs"
SET "searchStatus" = 'NOT_STARTED',
    "searchStartedAt" = NULL,
    "lastSearchedAt" = NULL,
    "searchError" = NULL
WHERE "searchStatus" <> 'NOT_STARTED';

-- AlterEnum
BEGIN;
CREATE TYPE "HireSourceKind_new" AS ENUM ('PDL', 'USER_REPORTED');
ALTER TABLE "public"."candidates" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "candidates" ALTER COLUMN "source" TYPE "HireSourceKind_new" USING ("source"::text::"HireSourceKind_new");
ALTER TYPE "HireSourceKind" RENAME TO "HireSourceKind_old";
ALTER TYPE "HireSourceKind_new" RENAME TO "HireSourceKind";
DROP TYPE "public"."HireSourceKind_old";
ALTER TABLE "candidates" ALTER COLUMN "source" SET DEFAULT 'PDL';
COMMIT;

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "searchCostUsd",
DROP COLUMN "searchDatasetId",
DROP COLUMN "searchRunId",
ADD COLUMN     "searchCreditsUsed" INTEGER,
ADD COLUMN     "searchSkippedInternal" INTEGER,
ADD COLUMN     "searchTotalMatches" INTEGER;
