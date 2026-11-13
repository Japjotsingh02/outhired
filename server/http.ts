import "server-only";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import { isRecordNotFound, isUniqueViolation } from "@/lib/prismaErrors";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
} from "@/server/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Short id shown to the user and written to the matching log line. */
function newRequestId(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Wraps a route handler. Every failure becomes JSON `{ error, code, details?, requestId }`:
 * AppError -> its status, ZodError -> 400 VALIDATION, anything else -> a generic 500
 * (the real error is logged with the same requestId, never returned).
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const requestId = newRequestId();
      // A Prisma unique violation / missing row that no service handled is a 409 / 404, not a 500.
      if (!(err instanceof AppError)) {
        if (isUniqueViolation(err)) err = new ConflictError("That already exists");
        else if (isRecordNotFound(err)) err = new NotFoundError("Not found");
      }
      if (err instanceof AppError) {
        if (err.status >= 500) console.error(`[handle] ${requestId} ${err.code}: ${err.message}`);
        const retryAfterSeconds = err instanceof RateLimitedError ? err.retryAfterSeconds : undefined;
        const details =
          retryAfterSeconds === undefined
            ? err.details
            : { ...(isRecord(err.details) ? err.details : {}), retryAfterSeconds };
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            ...(details !== undefined && { details }),
            requestId,
          },
          {
            status: err.status,
            ...(retryAfterSeconds !== undefined && { headers: { "Retry-After": String(retryAfterSeconds) } }),
          },
        );
      }
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        return NextResponse.json(
          {
            error: "Invalid request",
            code: "VALIDATION",
            details: { issues },
            // Kept for callers that still read the old top-level list.
            issues,
            requestId,
          },
          { status: 400 },
        );
      }
      console.error(`[handle] ${requestId} Unhandled error:`, err);
      return NextResponse.json(
        { error: "Something went wrong", code: "INTERNAL", requestId },
        { status: 500 },
      );
    }
  };
}

/** Reads the JSON body of a request, throwing BadRequestError when it is not valid JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

/** Like readJsonBody, but an empty body is read as an empty object. */
export async function readOptionalJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}
