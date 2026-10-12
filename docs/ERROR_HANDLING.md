# Error handling

One policy for every failure the user can see. The rule of thumb: **one surface per error**. Never a toast and an inline message for the same failure.

## Which surface

| Situation | Surface | Example |
| --- | --- | --- |
| A page or data block failed to load or render | Error page, or an in-place `ErrorState` with **Retry** | Jobs list, profile load, `app/error.tsx` |
| A failure tied to a form, field or panel | `InlineAlert` and/or a field error; keep the user's input | Profile save, create job, signup, compare panel |
| A quick action failed, with no place for the message | Toast (`toastError`); lasts 8 s; may offer **Retry** | Vote rolled back, skip onboarding |
| Something finished and the result is not visible | Toast (info) | "That application is already in your list." |
| The user must decide or acknowledge | `ConfirmDialog` | Delete an application, discard unsaved edits |

Rules:

- No success toast when the result is already visible.
- Never use a dialog for an ordinary API error.
- Never use `window.alert`, `window.confirm` or `window.prompt`.
- A failed vote (or similar) is optimistic: update at once, roll back and `toastError` on failure.

## Status mapping

| Status / code | What the user gets |
| --- | --- |
| 400 `VALIDATION` / `BAD_REQUEST` | Field errors from `details.issues` plus an inline alert |
| 401 `UNAUTHORIZED` | Redirect to `/login?reason=expired`; the login page shows "Please sign in again." |
| 403 `PROFILE_INCOMPLETE` | Inline prompt with a link to `/profile` |
| 403 `FEATURE_RESTRICTED` | "This feature is in private beta." |
| 404 `NOT_FOUND` | In-place not-found state |
| 409 duplicate | Info toast and open the existing item |
| 429 `RATE_LIMITED` | Inline message with the wait time (from `Retry-After`, else "a minute") |
| 5xx, `PROVIDER_FAILED`, `TIMEOUT`, `NETWORK` | In-place error with Retry (a toast for quick actions) |
| Polling | No alert for a failed poll. After 3 failures in a row, show "Having trouble updating". Stop at the existing timeout. |

## Server contract

`handle()` in `server/http.ts` wraps every route. Any failure is JSON:

```json
{ "error": "…", "code": "NOT_FOUND", "details": {}, "requestId": "ab12cd34" }
```

- `error` is safe to show; unexpected errors are a generic "Something went wrong" (code `INTERNAL`).
- Never HTML, never a stack trace, never a secret.
- `requestId` (8 hex characters) is also written to the matching server log line, so a support report can be traced.
- A `ZodError` is `400 VALIDATION` with `details.issues: [{ path, message }]`. The top-level `issues` is kept for older callers.
- Routes throw `AppError` subclasses (`server/errors.ts`) instead of returning `NextResponse.json({ error })`.

## Client contract

- All browser requests go through `apiFetch` / `apiFetchWithStatus` in `lib/apiClient.ts`. They parse JSON safely, throw `ApiError { status, code, message, details, requestId }`, and report a network failure as code `NETWORK`.
- `getErrorMessage(err | code)` is the **only** place that turns a code into text: what happened, then what to do. In development it appends the technical message and `requestId`.
- `fieldErrorsFromApiError(err)` maps a 400's `details.issues` to `{ field: message }` for `react-hook-form` `setError`.
- `redirectIfAuthExpired(err)` sends a 401 to the login page.
- Data comes from TanStack Query hooks in `lib/queries/` (see "Data fetching"); components never call `fetch` or `apiFetch` themselves.
- Components: `components/ui/InlineAlert.tsx`, `ErrorState.tsx`, `ConfirmDialog.tsx`; toasts via `components/ui/toast.ts` (`toastError`, `toastInfo`). `<Toaster />` is mounted once in `app/providers.tsx`.
- Error pages: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` (Next 16 passes `retry`, not `reset`).

## Data fetching (TanStack Query v5, client only)

No server prefetching or hydration, and no Server Actions as `queryFn`.

- **Where**: hooks live in `lib/queries/` (`profile`, `jobs`, `hireSearch`, `match`, `auth`). `apiFetch` is the only fetcher and every `queryFn` passes the `AbortSignal`.
- **Keys**: always `["user", userId, ...]` (`lib/queries/keys.ts`). Queries are enabled only when the NextAuth session is authenticated. The cache is cleared on sign-out and when the user changes, and is never persisted.
- **Defaults** (`lib/queries/queryClient.ts`): `staleTime` 30 s, no refetch on window focus. `lib/queries/retry.ts`: never retry a 4xx or an abort; retry `NETWORK`/5xx twice with backoff (1 s, 2 s, cap 8 s). Mutations do not retry.
- **Global handlers** do two things only: redirect once on 401 (`redirectIfAuthExpired`) and, in development, warn with the `requestId`. They never toast or alert, so each call site owns its one surface.
- **Surfaces**:
  - Initial load failed, no data: `ErrorState` with Retry (`refetch`).
  - Background refetch failed, data on screen: keep the data and show a small inline "Couldn't refresh. Retry" note; no toast.
  - Form mutation: `InlineAlert` plus `setError` field errors; the input is kept.
  - Quick action (vote, skip onboarding): optimistic update where it makes sense, `toastError` with rollback.
- **Rules for code**: do not copy query data into `useState`; do not fetch in `useEffect`. A form that edits server data is mounted once the data exists and takes its starting values from it.
- **Polling** (hire search): `refetchInterval` is a pure function (`hireSearchPolling.ts`): 3 s while `RUNNING` and inside 4 minutes of `searchStartedAt`, otherwise off. `retry: 0`; "Having trouble updating" after 3 failures in a row, reset by a success.
- **Pure helpers** go in files that do not import `@tanstack/react-query`, so the server-condition test runner can load them. Component tests use `npm run test:components` with a fresh `QueryClient` (`retry: false`, `gcTime: Infinity`).
- **Left outside TanStack on purpose**: NextAuth `signIn`/`signOut` and `SessionProvider`'s own session requests.

## Adding a new error code

1. Throw it from the service as an `AppError` subclass with a `code`.
2. Add one `case` in `friendly()` in `lib/apiClient.ts`: what happened, then what to do.
3. Add it to the table in `tests/errorHandling.test.ts`.
