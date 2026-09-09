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
