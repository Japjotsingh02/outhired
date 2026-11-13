import type { DBJob } from "@/types";

export const SEARCH_STEPS = [
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
    step: "Find people who joined",
    getDesc: (job: DBJob) =>
      `New-hire lookup · ${job.domain ?? "company website not set"}`,
  },
  {
    icon: "🔍",
    step: "Rank by title match",
    getDesc: () => "Closest titles and start dates surface first",
  },
  {
    icon: "👥",
    step: "Community voting",
    getDesc: () => "Highest-voted candidate surfaces on top",
  },
] as const;
