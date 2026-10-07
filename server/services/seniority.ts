import "server-only";
import type { Seniority } from "@/generated/prisma";
import type { ParsedJob } from "@/types";
import { inferSeniority } from "@/server/services/jobParsing";

const SENIORITY_BY_LABEL: Record<ParsedJob["seniority"], Seniority> = {
  junior: "JUNIOR",
  mid: "MID",
  senior: "SENIOR",
  staff: "STAFF",
  unknown: "UNKNOWN",
};

/** The one place that maps inferSeniority's lowercase labels to the Prisma enum. */
export function toSeniorityEnum(label: ParsedJob["seniority"]): Seniority {
  return SENIORITY_BY_LABEL[label] ?? "UNKNOWN";
}

/** Seniority is always derived on the server from the role, never from client input. */
export function seniorityFromRole(role: string): Seniority {
  return toSeniorityEnum(inferSeniority(role));
}
