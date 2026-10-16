// Shared by server and client: no server imports here.

interface ProfileCompletenessInput {
  linkedinUrl?: string | null;
  resumeText?: string | null;
  skills: string[];
}

export const MIN_PROFILE_SKILLS = 3;

/** What a profile still lacks before comparisons are possible. */
export type ProfileMissing = "linkedin_or_resume" | "skills";

/** Plain-words prompts for each missing item. */
export const PROFILE_MISSING_LABELS: Record<ProfileMissing, string> = {
  linkedin_or_resume: "Add your LinkedIn URL or resume",
  skills: `Add at least ${MIN_PROFILE_SKILLS} skills`,
};

export function getProfileMissing(profile: ProfileCompletenessInput): ProfileMissing[] {
  const missing: ProfileMissing[] = [];
  if (!profile.linkedinUrl?.trim() && !profile.resumeText?.trim()) {
    missing.push("linkedin_or_resume");
  }
  if (profile.skills.length < MIN_PROFILE_SKILLS) missing.push("skills");
  return missing;
}

/** (LinkedIn URL or resume text) and at least 3 skills. */
export function isProfileComplete(profile: ProfileCompletenessInput): boolean {
  return getProfileMissing(profile).length === 0;
}
