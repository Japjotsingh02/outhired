# Apollo API Integration

## How it works

```
User pastes job URL
       ↓
POST /api/parse-job        — scrapes JD, extracts role + domain + skills
       ↓
POST /api/apollo/search    — searches Apollo for new hires at that company
       ↓
Fuzzy title match          — Jaccard similarity filters out irrelevant titles
       ↓
Candidates returned        — community votes to confirm the hire
       ↓
POST /api/apollo/email     — (Pro only) reveals email, costs 1 Apollo credit
```

## Files

```
src/
├── app/api/
│   ├── parse-job/route.ts        # Scrape job URL → extract role/domain/skills
│   ├── apollo/
│   │   ├── search/route.ts       # People search → new hires at company
│   │   └── email/route.ts        # Email reveal for a specific person
└── hooks/
    └── useApollo.ts              # Client hook — wraps all three routes
```

## Setup

1. Copy `.env.local.example` → `.env.local`
2. Add your Apollo API key (https://developer.apollo.io)
3. Install dependencies (no extra packages needed — uses native fetch)

## Usage in a component

```tsx
import { useApollo } from "@/hooks/useApollo";

export default function TrackJob() {
  const { findHires, loading, logs } = useApollo();

  async function handleSubmit(jobUrl: string) {
    const { job, candidates } = await findHires(jobUrl);
    // job.company, job.role, job.domain, job.skills ...
    // candidates[].name, .title, .skills, .votes ...
  }

  return (
    <div>
      {loading && <p>Searching Apollo...</p>}
      {logs.map((l) => (
        <p key={l.timestamp}>{l.step}: {l.detail}</p>
      ))}
    </div>
  );
}
```

## Apollo credit cost

| Action              | Credits |
|---------------------|---------|
| people/search       | 1 per call (not per result) |
| people/match (email)| 1 per reveal |
| Free tier           | 50 credits/month |
| Paid (Basic)        | $49/mo — 1,000 credits |

## Key Apollo payload

```json
POST https://api.apollo.io/v1/people/search
{
  "api_key": "...",
  "q_organization_domains": ["stripe.com"],
  "person_titles": ["Software Engineer", "SWE", "Frontend Engineer"],
  "changed_jobs_within_days": 90,
  "page": 1,
  "per_page": 10
}
```

## Fuzzy title matching

Apollo's title filter is broad — someone titled "SWE II - Payments"
will match a search for "Software Engineer". We run a second pass
using Jaccard similarity on word tokens to tighten the results.

Threshold is `0.3` in `search/route.ts` — lower it for more results,
raise it for stricter matching. Community voting handles the rest.

## Rate limiting (recommended)

Wrap the Apollo routes with Upstash Redis rate limiting so users
can't burn through your credits:

```ts
import { Ratelimit } from "@upstash/ratelimit";
const ratelimit = new Ratelimit({
  limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 searches/min per user
});
```
