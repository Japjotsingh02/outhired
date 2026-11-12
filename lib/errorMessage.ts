/**
 * Message of a thrown value. Pass `fallback` where the text is shown to a user
 * and a non-Error throw should not leak its string form.
 */
export function errorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}
