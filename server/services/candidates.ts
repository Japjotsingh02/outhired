import "server-only";
import { prisma } from "@/server/db";
import {
  searchApolloPeople,
  fuzzyFilterByTitle,
  shapePerson,
  hireWindow,
  startedWithinWindow,
} from "@/lib/apollo";

/**
 * Runs an Apollo people search for the given role/domain and bulk-inserts
 * matching candidates under the specified job. Only people who started in
 * the posted month (or up to 90 days after it ends) are kept.
 *
 * Failures are non-fatal — the job has already been created before this runs.
 */
export async function seedCandidatesFromApollo(
  jobId: string,
  company: string,
  role: string,
  postedMonth: Date,
): Promise<void> {
  const window = hireWindow(postedMonth);
  const { people } = await searchApolloPeople(company, role, window.daysBack);
  const filtered = fuzzyFilterByTitle(people, role).filter((person) =>
    startedWithinWindow(person, window),
  );

  // skipDuplicates: (jobId, apolloId) is unique, so re-seeding is harmless.
  await prisma.candidate.createMany({
    data: filtered.map(shapePerson).map((c) => ({
      jobId,
      apolloId: c.id,
      name: c.name,
      initials: c.initials,
      title: c.title,
      headline: c.headline,
      linkedinUrl: c.linkedinUrl,
      location: c.location,
      currentCompany: c.currentCompany,
      previousRole: c.previousRole,
      skills: c.skills,
      education: c.education,
      apolloSource: true,
    })),
    skipDuplicates: true,
  });
}

/** Prisma include shape used whenever we return a job with its candidates. */
export const JOB_WITH_CANDIDATES_INCLUDE = {
  candidates: {
    include: { votes: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;
