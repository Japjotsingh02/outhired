/** True for Prisma's unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** True for Prisma's "record to update/delete does not exist" error (P2025). */
export function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2025"
  );
}
