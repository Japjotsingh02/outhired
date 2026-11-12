// Shared by browser and tests: no server imports here.

/** A failed API call. `code` is the server's error code, or one chosen from the status / network. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
    /** Seconds to wait before retrying, when the server said so (Retry-After). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Code for a response whose body gave none (for example an HTML error page). */
function codeFromStatus(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status >= 500) return "UPSTREAM_ERROR";
  return "UNKNOWN";
}

function parseJson(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function retryAfter(response: Response, details: unknown): number | undefined {
  const header = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header);
  const fromDetails = isRecord(details) ? Number(details.retryAfterSeconds) : NaN;
  return Number.isFinite(fromDetails) && fromDetails > 0 ? Math.ceil(fromDetails) : undefined;
}

/**
 * fetch + safe JSON. Resolves with the parsed body; rejects with an ApiError for
 * HTTP failures (JSON or HTML body), a malformed success body, and network failures (code NETWORK).
 */
export async function apiFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  return (await apiFetchWithStatus<T>(url, init)).data;
}

/** Like apiFetch, but also returns the HTTP status (for example 201 created vs 200 already existed). */
export async function apiFetchWithStatus<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    throw networkOrAbort(err, init.signal);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw networkOrAbort(err, init.signal);
  }
  const body = parseJson(text);

  if (!response.ok) {
    const record = isRecord(body) ? body : {};
    const code = typeof record.code === "string" ? record.code : codeFromStatus(response.status);
    const message = typeof record.error === "string" ? record.error : `Request failed (${response.status})`;
    throw new ApiError(
      response.status,
      code,
      message,
      record.details,
      typeof record.requestId === "string" ? record.requestId : undefined,
      retryAfter(response, record.details),
    );
  }

  if (body === undefined && text.trim() !== "") {
    throw new ApiError(response.status, "BAD_RESPONSE", "The server sent a response we could not read");
  }
  return { status: response.status, data: body as T };
}

/** True for a request that was cancelled on purpose (an AbortSignal), as opposed to one that failed. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** A cancelled request stays an AbortError (never a NETWORK error); anything else is a network failure. */
function networkOrAbort(err: unknown, signal?: AbortSignal | null): unknown {
  if (signal?.aborted || isAbortError(err)) return isAbortError(err) ? err : signal?.reason ?? err;
  return new ApiError(0, "NETWORK", "Network request failed");
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** True when the session is gone and the user must sign in again. */
export function isAuthExpired(err: unknown): boolean {
  return isApiError(err) && (err.status === 401 || err.code === "UNAUTHORIZED");
}

let redirecting = false;

/**
 * Sends the browser to the login page when the session has ended. Returns true if the error was an
 * expired session. It navigates once (several requests can fail together) and never on /login or /signup.
 */
export function redirectIfAuthExpired(err: unknown): boolean {
  if (!isAuthExpired(err) || typeof window === "undefined") return false;
  const { pathname } = window.location;
  if (redirecting || pathname === "/login" || pathname === "/signup") return true;
  redirecting = true;
  // A full navigation on purpose: it drops every piece of signed-in client state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login?reason=expired";
  return true;
}

function waitText(seconds?: number): string {
  if (!seconds) return "a minute";
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function friendly(code: string, err: ApiError | null): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Your session has ended. Please sign in again.";
    case "FORBIDDEN":
      return "You don't have access to this. Check that you're signed in to the right account.";
    case "FEATURE_RESTRICTED":
      return "This feature is in private beta.";
    case "PROFILE_INCOMPLETE":
      return "Finish your profile first, then try again.";
    case "RATE_LIMITED":
      return `You're going too fast. Wait ${waitText(err?.retryAfterSeconds)} and try again.`;
    case "NOT_FOUND":
      return "We couldn't find that. It may have been removed, so go back and try again.";
    case "VALIDATION":
    case "BAD_REQUEST":
      return "Some details need fixing. Check the highlighted fields and try again.";
    case "PROVIDER_FAILED":
    case "UPSTREAM_ERROR":
      return "A service we rely on failed. Please try again in a moment.";
    case "TIMEOUT":
      return "That took too long. Please try again.";
    case "LIMIT_REACHED":
      return "You've reached the search limit for now. Try again later.";
    case "DOMAIN_NOT_FOUND":
      return "We couldn't find that company website. Check the address and try again.";
    case "SEARCH_TOO_SOON":
      return "This job was searched recently. Check again later.";
    case "NETWORK":
      return "We couldn't reach the server. Check your connection and try again.";
    case "NO_DOMAIN":
      return "Add the company website to find people who joined.";
    case "INVALID_DOMAIN":
      return "Enter a valid company website, for example stripe.com.";
    case "SERVICE_UNAVAILABLE":
      return "This service isn't available right now. Please try again later.";
    case "CONFLICT":
    case "EMAIL_TAKEN":
      return "That already exists.";
    default:
      return "Something went wrong on our side. Please try again.";
  }
}

/**
 * The one place that turns an error or a bare error code into text for the user:
 * what happened, then what to do. In development the technical message and requestId are appended.
 */
export function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return friendly(err, null);
  const apiError = isApiError(err) ? err : null;
  const base = friendly(apiError?.code ?? "UNKNOWN", apiError);
  if (process.env.NODE_ENV !== "development") return base;
  const technical = err instanceof Error ? err.message : String(err);
  const id = apiError?.requestId ? ` [${apiError.requestId}]` : "";
  return `${base} (${technical}${id})`;
}

/** Field errors from a 400 response's `details.issues`, as `{ fieldPath: message }`. */
export function fieldErrorsFromApiError(err: unknown): Record<string, string> {
  if (!isApiError(err) || !isRecord(err.details) || !Array.isArray(err.details.issues)) return {};
  const fields: Record<string, string> = {};
  for (const issue of err.details.issues) {
    if (isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string") {
      fields[issue.path] ??= issue.message;
    }
  }
  return fields;
}
