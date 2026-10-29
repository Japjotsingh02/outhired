// Client-safe query keys. Every key starts with ["user", userId] so one user's data can never be
// served to another, and so a whole user's cache can be addressed with queryKeys.user(userId).

export const queryKeys = {
  user: (userId: string) => ["user", userId] as const,
  profile: (userId: string) => ["user", userId, "profile"] as const,
  jobs: (userId: string) => ["user", userId, "jobs"] as const,
  hireSearch: (userId: string, jobId: string) => ["user", userId, "hire-search", jobId] as const,
  matches: (userId: string) => ["user", userId, "match"] as const,
  match: (userId: string, candidateId: string) => ["user", userId, "match", candidateId] as const,
};
