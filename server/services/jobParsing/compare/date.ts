import "server-only";

/** Compares year-month only. */
export function datesMatch(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
