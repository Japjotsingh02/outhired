import type { DBJob } from "@/types";

export const APOLLO_STEPS = [
  {
    icon: "🌐",
    step: "Parse job",
    getDesc: (job: DBJob) =>
      `Verified role details · ${
        job.inputMode === "DESCRIPTION"
          ? "Provided job description"
          : job.inputMode === "MANUAL"
            ? "Entered manually"
            : (job.url ?? "Job link")
      }`,
  },
  {
    icon: "⚡",
    step: "Apollo search",
    getDesc: (job: DBJob) =>
      `POST /mixed_people/api_search · company: ${job.company}`,
  },
  {
    icon: "🔍",
    step: "Fuzzy title match",
    getDesc: () => "Jaccard similarity · threshold 0.2",
  },
  {
    icon: "👥",
    step: "Community voting",
    getDesc: () => "Highest-voted candidate surfaces on top",
  },
] as const;

export const APOLLO_API_KEY_HINT = "APOLLO_API_KEY=your_key # in .env.local";
