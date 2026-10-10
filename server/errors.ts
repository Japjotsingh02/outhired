import "server-only";

/** Base class for errors that map to an HTTP status. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown, code = "BAD_REQUEST") {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown, code = "FORBIDDEN") {
    super(403, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown, code = "CONFLICT") {
    super(409, code, message, details);
  }
}

export class RateLimitedError extends AppError {
  /** Seconds until the caller may try again; sent as the Retry-After header and details.retryAfterSeconds. */
  readonly retryAfterSeconds?: number;

  constructor(message = "Too many requests", details?: unknown, code = "RATE_LIMITED", retryAfterSeconds?: number) {
    super(429, code, message, details);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UpstreamError extends AppError {
  constructor(message = "Upstream service failed", details?: unknown) {
    super(502, "UPSTREAM_ERROR", message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable", details?: unknown) {
    super(503, "SERVICE_UNAVAILABLE", message, details);
  }
}
