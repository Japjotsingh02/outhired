@AGENTS.md

## Architecture rules
- Layers: Route handler -> Service -> Repository / Client. Imports only go one way.
- app/api/**/route.ts: HTTP only. Auth, rate limit, Zod validation, call ONE service function, map the result to a status code. No business logic, no Prisma, no external API calls.
- server/services: business rules as plain TypeScript functions. They never touch NextRequest/NextResponse.
- server/repositories: ALL Prisma queries live here. Nothing outside repositories imports the Prisma client.
- server/clients: one wrapper per external API (Apollo, Gemini, Jina, GitHub, Claude, LinkedIn scraper) with its own timeout, retry and error type.
- server/security: auth helper, SSRF protection, rate limiting, client IP.
- lib/: code that may be imported by BOTH browser and server (Zod schemas, UTC month helpers, pure utils). It must never import from server/.
- server/: server-only. Every file starts with `import "server-only";`. Client components must never import from server/.
- Zod validates every boundary: request bodies, external API responses, JSON read back from the database.
- Dates are month precision, stored as "YYYY-MM-01" / UTC midnight. Never call new Date(<arbitrary string>); parse with regex/lookup tables and use Date.UTC.
- Services throw typed AppError subclasses; one handle() wrapper converts them to HTTP responses.
- AI is the fallback layer for job extraction, never the first choice. Gemini Flash for extraction, Claude Sonnet only for gap analysis.
- Never cache a failed or empty parse result.
- Do not mix refactors with logic changes in one pass.

## Error handling
Full policy in docs/ERROR_HANDLING.md.
- Every route is wrapped in handle() and fails as JSON { error, code, details?, requestId }. Throw AppError subclasses; never return ad-hoc { error } bodies.
- Browser requests use apiFetch (lib/apiClient.ts). Error text comes only from getErrorMessage; never build user-facing messages from raw server text.

## Data fetching (client only; details in docs/ERROR_HANDLING.md)
- Components never call fetch/apiFetch. They use TanStack Query hooks from lib/queries/; apiFetch is the only fetcher and every queryFn passes the AbortSignal.
- Query keys are ["user", userId, ...]; enabled only when the session is authenticated; cache cleared on sign-out/user change; never persisted.
- No copying query data into useState, no useEffect that fetches, no server prefetch/hydration, no Server Actions as queryFn.
- Global QueryCache/MutationCache handlers only redirect on 401 and log the requestId in development. No toasts there.
- Pure helpers must not import @tanstack/react-query (server-condition tests cannot load it).
- One surface per error: error page or in-place ErrorState with Retry for failed loads; InlineAlert/field errors for forms and panels; toast for quick actions; ConfirmDialog only for decisions. Never window.alert/confirm, never a toast plus an inline message for the same failure.
- 401 -> redirectIfAuthExpired. A failed poll never alerts; show "Having trouble updating" only after 3 in a row.
