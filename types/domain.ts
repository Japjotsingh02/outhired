// Shared data shapes used by the UI and API layers.
export interface DBCandidate {
  id: string; jobId: string; apolloId?: string | null; name: string; initials: string;
  title: string; headline?: string | null; linkedinUrl?: string | null; location?: string | null;
  currentCompany?: string | null; previousRole?: string | null; skills: string[];
  education?: string | null; apolloSource: boolean; votes: DBVote[];
  githubUrl?: string | null; portfolioUrl?: string | null;
  linkedinData?: object | null; lastScrapedAt?: string | null; createdAt: string;
}
export interface DBVote { id: string; userId: string; candidateId: string; type: "YES" | "NO" }
export interface DBJob {
  id: string; userId: string; url?: string | null; domain?: string | null;
  company: string; role: string; team?: string | null; seniority: "JUNIOR" | "MID" | "SENIOR" | "STAFF" | "UNKNOWN";
  location?: string | null; skills: string[]; status: "PENDING" | "REJECTED" | "INTERVIEWING";
  inputMode: "URL" | "DESCRIPTION" | "MANUAL"; postedMonth: string; // ISO date, 1st of the month (UTC)
  appliedDate: string; candidates: DBCandidate[]; createdAt: string; updatedAt: string;
}
export interface UserProfile {
  id: string; name: string; email: string; linkedinUrl?: string | null; resumeText?: string | null;
  skills: string[]; experienceYrs?: number | null; headline?: string | null;
}
export interface ProfileMatchResult {
  score: number; summary: string; sharedStrengths: string[]; gaps: string[]; advice: string; cached?: boolean;
}
export interface Candidate {
  id: string; name: string; initials: string; title: string; headline: string | null;
  linkedinUrl: string | null; location: string; currentCompany: string | null; previousRole: string | null;
  skills: string[]; education: string | null; apolloSource: boolean; votes: number; novotes: number;
  userVote: "yes" | "no" | null; email?: string | null;
}
export interface ParsedJob {
  url: string; linkedInJobId?: string | null; domain: string; company: string;
  role: string; team: string | null; seniority: "junior" | "mid" | "senior" | "staff" | "unknown";
  location: string | null; datePosted: string | null; skills: string[];
}
export interface SearchLog { timestamp: string; step: string; status: "ok" | "error" | "loading"; detail: string }
