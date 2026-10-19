import { test } from "node:test";
import assert from "node:assert/strict";
import { getProfileMissing, isProfileComplete } from "@/lib/profile";

test("getProfileMissing / isProfileComplete", () => {
  const cases: Array<{
    name: string;
    profile: { linkedinUrl?: string | null; resumeText?: string | null; skills: string[] };
    missing: string[];
  }> = [
    { name: "empty", profile: { skills: [] }, missing: ["linkedin_or_resume", "skills"] },
    { name: "only skills", profile: { skills: ["a", "b", "c"] }, missing: ["linkedin_or_resume"] },
    {
      name: "only LinkedIn",
      profile: { linkedinUrl: "https://www.linkedin.com/in/x", skills: [] },
      missing: ["skills"],
    },
    { name: "resume + 2 skills", profile: { resumeText: "my resume", skills: ["a", "b"] }, missing: ["skills"] },
    { name: "resume + 3 skills", profile: { resumeText: "my resume", skills: ["a", "b", "c"] }, missing: [] },
    { name: "blank resume does not count", profile: { resumeText: "   ", skills: ["a", "b", "c"] }, missing: ["linkedin_or_resume"] },
  ];
  for (const { name, profile, missing } of cases) {
    assert.deepEqual(getProfileMissing(profile), missing, name);
    assert.equal(isProfileComplete(profile), missing.length === 0, name);
  }
});

// The service imports the Prisma client wrapper, which needs a connection string at
// import time (it never connects until a query runs).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

type Row = Parameters<typeof import("@/server/services/profile.service").toProfileView>[0];

const row = (overrides: Partial<Row>): Row => ({
  id: "u1",
  name: "Test",
  email: "t@example.test",
  headline: null,
  linkedinUrl: null,
  githubUrl: null,
  portfolioUrl: null,
  resumeText: null,
  skills: [],
  experienceYrs: null,
  onboardedAt: null,
  ...overrides,
});

test("requireCompleteProfile throws PROFILE_INCOMPLETE with the missing list", async () => {
  const { requireCompleteProfile } = await import("@/server/services/profile.service");
  const { ForbiddenError } = await import("@/server/errors");

  await assert.rejects(
    requireCompleteProfile("u1", async () => row({ skills: ["a"] })),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "PROFILE_INCOMPLETE");
      assert.deepEqual(err.details, { missing: ["linkedin_or_resume", "skills"] });
      return true;
    },
  );
});

test("requireCompleteProfile passes for a complete profile", async () => {
  const { requireCompleteProfile } = await import("@/server/services/profile.service");
  await assert.doesNotReject(
    requireCompleteProfile("u1", async () => row({ resumeText: "resume", skills: ["a", "b", "c"] })),
  );
});

test("requireCompleteProfile rejects an unknown user as unauthorized", async () => {
  const { requireCompleteProfile } = await import("@/server/services/profile.service");
  const { UnauthorizedError } = await import("@/server/errors");
  await assert.rejects(requireCompleteProfile("gone", async () => null), UnauthorizedError);
});

test("profile view exposes flags but never onboardedAt", async () => {
  const { toProfileView } = await import("@/server/services/profile.service");
  const view = toProfileView(row({ onboardedAt: new Date(), skills: ["a", "b", "c"], resumeText: "r" }));
  assert.equal(view.onboarded, true);
  assert.equal(view.profileComplete, true);
  assert.deepEqual(view.missing, []);
  assert.ok(!("onboardedAt" in view));
  assert.ok(!("passwordHash" in view));
  assert.ok(!("linkedinData" in view));
  assert.equal(toProfileView(row({})).onboarded, false);
});
