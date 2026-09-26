import "server-only";
import type { ExtractionLayer } from "@/types/jobParsing";

// ─── Extraction layers ───────────────────────────────────────────────────────

export function emptyLayer(): ExtractionLayer {
  return {
    role: null,
    team: null,
    company: null,
    location: null,
    datePosted: null,
    employmentType: null,
    locationType: null,
    skills: [],
  };
}
