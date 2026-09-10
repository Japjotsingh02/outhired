# OutHired

> Find out who actually got the job you applied for — and see how you compare.

**OutHired** is a community-driven job intelligence platform. When you apply for a role, it searches [Apollo.io](https://apollo.io) for people who recently joined that company in a matching position, shows you their profiles, and lets the community vote to confirm the hire. An AI (Claude) then compares your profile against theirs and tells you exactly where you stack up.

---

## Features

- 🔍 **Hire Discovery** — paste a job URL or enter details manually; the app scrapes the JD, extracts the role/skills, and queries Apollo for recent new hires at that company
- 🗳️ **Community Voting** — users vote YES/NO on each candidate to crowdsource confidence ("High confidence · 78%")
- 🤖 **AI Profile Match** — Claude compares your LinkedIn/resume against a candidate's profile, returning a score, shared strengths, skill gaps, and actionable advice
- 🔗 **LinkedIn Enrichment** — Proxycurl fills in richer profile data (education, previous roles, detailed skills)
- 📊 **Application Tracker** — track jobs across statuses: Pending · Interviewing · Not Selected
- 🔐 **Auth** — email/password auth via NextAuth with bcrypt password hashing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth v4 |
| AI | Anthropic Claude (SDK) |
| Candidate Search | Apollo.io API |
| LinkedIn Enrichment | Proxycurl API |
| Fuzzy Matching | Fuse.js + Jaccard similarity |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### 1. Clone & install

```bash
git clone https://github.com/your-username/outhired.git
cd outhired
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in your `.env.local`:

| Variable | Description | Where to get it |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Your DB provider |
| `NEXTAUTH_SECRET` | Random secret for session signing | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` for dev |
| `APOLLO_API_KEY` | Apollo.io API key | [developer.apollo.io](https://developer.apollo.io) · free tier: 50 credits/mo |
| `PROXYCURL_API_KEY` | LinkedIn enrichment | [nubela.co/proxycurl](https://nubela.co/proxycurl) · ~$0.01/scrape |
| `ANTHROPIC_API_KEY` | Claude AI for profile comparison | [console.anthropic.com](https://console.anthropic.com) |

### 3. Set up the database

```bash
npx prisma migrate dev
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
outhired/
├── app/
│   ├── page.tsx              # Main dashboard (job list + candidate cards)
│   ├── layout.tsx            # Root layout + font setup
│   ├── providers.tsx         # NextAuth SessionProvider
│   ├── globals.css           # Global styles / CSS variables
│   ├── login/                # Login page
│   ├── signup/               # Signup page
│   └── api/
│       ├── auth/             # NextAuth [...nextauth] handler
│       ├── profile/          # GET/POST user profile
│       ├── jobs/             # CRUD for tracked jobs
│       ├── parse-job/        # Scrape job URL → extract role/skills
│       ├── apollo/
│       │   ├── search/       # Find new hires at company via Apollo
│       │   └── email/        # Reveal email (costs 1 Apollo credit)
│       ├── proxycurl/        # LinkedIn profile enrichment
│       └── compare-profile/  # Claude AI profile comparison
├── components/
│   ├── JobInputPanel.tsx     # Add job via URL or manual form
│   ├── ProfileMatchPanel.tsx # AI comparison modal
│   ├── ProfileSetup.tsx      # Onboarding / profile editor
│   └── useApollo.ts          # Client hook wrapping Apollo routes
├── lib/                      # Shared utilities & Prisma client
├── types/                    # Shared TypeScript types
├── generated/prisma/         # Auto-generated Prisma client
└── prisma/
    └── schema.prisma         # Database schema
```

---

## How the Hire Discovery Pipeline Works

```
User pastes job URL
       ↓
POST /api/parse-job        — scrape JD, extract role + domain + skills
       ↓
POST /api/apollo/search    — search Apollo for new hires at that company
       ↓
Fuzzy title match          — Jaccard similarity filters irrelevant titles
       ↓
Candidates displayed       — community votes YES/NO to confirm
       ↓
POST /api/compare-profile  — Claude compares your profile vs. the hire
```

> **Apollo credits**: people/search costs 1 credit per call (not per result). Email reveal costs 1 credit per person. The free tier gives 50 credits/month.

---

## Database Schema (simplified)

```
User ──< Job ──< Candidate ──< Vote
              └─────────────< ProfileMatch
```

- **User** — registered account with LinkedIn URL, resume text, and skills
- **Job** — a tracked application with company, role, status, and required skills
- **Candidate** — a person found via Apollo who may have gotten the role
- **Vote** — community YES/NO on whether a candidate actually got the job
- **ProfileMatch** — AI comparison result between a user and a candidate

---

## API Reference

| Method | Route | Description |
|---|---|---|
| `GET/POST` | `/api/profile` | Read or update your profile |
| `GET/POST` | `/api/jobs` | List or create tracked jobs |
| `POST` | `/api/parse-job` | Parse a job URL into structured data |
| `POST` | `/api/apollo/search` | Search for new hires at a company |
| `POST` | `/api/apollo/email` | Reveal a candidate's email |
| `POST` | `/api/proxycurl` | Enrich a LinkedIn profile |
| `POST` | `/api/compare-profile` | Run AI profile comparison |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a PR

---

## License

MIT
