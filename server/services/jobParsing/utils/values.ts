import "server-only";
import { decodeHtmlEntities } from "@/server/services/jobParsing/utils/html";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? decodeHtmlEntities(value).trim()
    : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringOrArray(value: unknown): string | null {
  if (Array.isArray(value)) {
    const values = value
      .map(stringValue)
      .filter((item): item is string => Boolean(item));
    return values.length ? values.join(", ") : null;
  }
  return stringValue(value);
}
