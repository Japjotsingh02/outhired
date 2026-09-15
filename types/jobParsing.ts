/** How a mandatory field's final value was established. */
export type FieldConfidence = "verified" | "ai" | "fallback";
export type MandatoryField = "role" | "company" | "datePosted";
export type OptionalField = "location" | "employmentType" | "team" | "locationType" | "skills";
export type ExtractionField = MandatoryField | OptionalField;
export type LocationType = "remote" | "hybrid" | "onsite" | null;

export type JobConfidence = Record<MandatoryField, FieldConfidence>;

/** Gemini output. Dates are "YYYY-MM-01" after parsing. */
export interface AIExtractionResult {
  role: string | null; team: string | null; company: string | null; location: string | null;
  datePosted: string | null; locationType: LocationType; skills: string[];
}

/** Result of one Gemini extraction; `ok: false` means every attempt failed. */
export type AIExtractionOutcome =
  | { ok: true; data: AIExtractionResult }
  | { ok: false; reason: string };

/** Values produced by one extraction layer (JSON-LD or page metadata). */
export interface ExtractionLayer {
  role: string | null; team: string | null; company: string | null; location: string | null;
  datePosted: string | null; employmentType: string | null; locationType: LocationType; skills: string[];
}

export interface JobPostingParseResult {
  role: string | null; team: string | null; company: string | null; location: string | null;
  locationType?: LocationType; datePosted: string | null; employmentType: string | null; skills: string[];
  seniority: "junior" | "mid" | "senior" | "staff" | "unknown";
  confidence: JobConfidence;
  /** Whole-parse failure (AI was needed and failed). Controls caching; not a confidence value. */
  failed: boolean;
}
