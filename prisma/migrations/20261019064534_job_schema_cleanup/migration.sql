-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'REJECTED', 'INTERVIEWING');

-- CreateEnum
CREATE TYPE "InputMode" AS ENUM ('URL', 'DESCRIPTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'STAFF', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('YES', 'NO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "resumeText" TEXT,
    "skills" TEXT[],
    "experienceYrs" DOUBLE PRECISION,
    "linkedinData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT,
    "domain" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team" TEXT,
    "seniority" "Seniority" NOT NULL DEFAULT 'UNKNOWN',
    "location" TEXT,
    "skills" TEXT[],
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "inputMode" "InputMode" NOT NULL DEFAULT 'URL',
    "postedMonth" DATE NOT NULL,
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "apolloId" TEXT,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headline" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "location" TEXT,
    "currentCompany" TEXT,
    "previousRole" TEXT,
    "skills" TEXT[],
    "education" TEXT,
    "apolloSource" BOOLEAN NOT NULL DEFAULT true,
    "linkedinData" JSONB,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "sharedStrengths" TEXT[],
    "gaps" TEXT[],
    "advice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parsed_jobs" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parsed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "jobs_userId_idx" ON "jobs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_userId_company_role_postedMonth_key" ON "jobs"("userId", "company", "role", "postedMonth");

-- CreateIndex
CREATE INDEX "candidates_jobId_idx" ON "candidates"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_jobId_apolloId_key" ON "candidates"("jobId", "apolloId");

-- CreateIndex
CREATE INDEX "votes_candidateId_idx" ON "votes"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_candidateId_key" ON "votes"("userId", "candidateId");

-- CreateIndex
CREATE INDEX "profile_matches_candidateId_idx" ON "profile_matches"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_matches_userId_candidateId_key" ON "profile_matches"("userId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "parsed_jobs_url_key" ON "parsed_jobs"("url");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_matches" ADD CONSTRAINT "profile_matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_matches" ADD CONSTRAINT "profile_matches_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
