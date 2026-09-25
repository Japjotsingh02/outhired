import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";

/**
 * Wraps a route handler: AppError -> its status, ZodError -> 400 with the issue
 * list, anything else -> logged and returned as a generic 500.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            ...(err.details !== undefined && { details: err.details }),
          },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Invalid request",
            code: "BAD_REQUEST",
            issues: err.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 },
        );
      }
      console.error("[handle] Unhandled error:", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
