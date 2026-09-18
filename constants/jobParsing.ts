import type { AIExtractionResult } from "@/types/jobParsing";

export const MANDATORY_FIELDS = ["role", "company", "datePosted"] as const;

export const OPTIONAL_FIELDS = [
  "location",
  "employmentType",
  "team",
  "locationType",
  "skills",
] as const;

/** Maximum input lengths accepted by the job description extraction layers. */
export const AI_CONTENT_MAX_CHARS = 3_000;
export const HTML_STRIP_MAX_CHARS = 8_000;

export const EMPTY_EXTRACTION: AIExtractionResult = {
  role: null,
  team: null,
  company: null,
  location: null,
  datePosted: null,
  locationType: null,
  skills: [],
};

export const GEMINI_MODEL = "gemini-2.0-flash";

/** Single retry for transient Gemini/Jina failures. */
export const AI_RETRY_DELAY_MS = 1_000;

/** Posted month must be this recent (inclusive) and not in the future. */
export const POSTED_MONTH_MAX_AGE_MONTHS = 36;

/** Apollo hire window extends this many days past the end of the posted month. */
export const APOLLO_WINDOW_EXTRA_DAYS = 90;

export const ROLE_PHRASES: Record<string, string> = {
  "front end": "frontend", "front-end": "frontend",
  "back end": "backend", "back-end": "backend",
  "full stack": "fullstack", "full-stack": "fullstack",
  "dev ops": "devops", "machine learning": "ml",
  "artificial intelligence": "ai", "human resources": "hr",
  "customer success": "cs", "quality assurance": "qa",
  "site reliability": "sre", "user experience": "ux",
  "user interface": "ui", "vice president": "vp", "&": "and",
};

export const ROLE_ABBREVIATIONS: Record<string, string> = {
  sr: "senior", snr: "senior", jr: "junior", jnr: "junior",
  assoc: "associate", prin: "principal",
  pm: "product manager", pgm: "program manager",
  tpm: "technical program manager",
  swe: "software engineer", sde: "software engineer",
  sdet: "software engineer in test",
  eng: "engineer", engr: "engineer", dev: "developer",
  mgr: "manager", mngr: "manager", dir: "director",
  admin: "administrator", exec: "executive",
  rep: "representative", spec: "specialist", coord: "coordinator",
  biz: "business", ops: "operations", mktg: "marketing",
  acct: "accounting", fin: "finance",
  pmm: "product marketing manager", bd: "business development",
  bdr: "business development representative",
  sdr: "sales development representative",
  csm: "customer success manager", mle: "machine learning engineer",
  vp: "vice president", svp: "senior vice president",
  evp: "executive vice president",
  cto: "chief technology officer", ceo: "chief executive officer",
  cfo: "chief financial officer", coo: "chief operating officer",
  cpo: "chief product officer", cmo: "chief marketing officer",
};
// Intentionally NOT included (ambiguous): sde1, ds, de, em, ae

export const LEVEL_NUMERALS: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
};

export const ROLE_FILLER_WORDS = new Set(["the", "of", "and", "for", "a", "an", "-", "–", "—"]);

export const SENIORITY_WORDS = new Set([
  "intern", "junior", "associate", "senior", "staff", "principal",
  "lead", "head", "director", "vice", "chief",
]);

export const HTML_ENTITIES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " ",
};

export const SKILL_PATTERNS: Record<string, RegExp> = {
  React: /\breact\b/i,
  "Next.js": /\bnext\.?js\b/i,
  TypeScript: /\btypescript\b/i,
  JavaScript: /\bjavascript\b/i,
  "Node.js": /\bnode\.?js\b/i,
  Python: /\bpython\b/i,
  Go: /\bgolang\b/i,
  Rust: /\brust\b/i,
  Java: /\bjava\b/i,
  PostgreSQL: /\bpostgresql\b|\bpostgres\b/i,
  MySQL: /\bmysql\b/i,
  Redis: /\bredis\b/i,
  Kafka: /\bkafka\b/i,
  AWS: /\baws\b/i,
  GCP: /\bgcp\b|\bgoogle\s+cloud\b/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b/i,
  GraphQL: /\bgraphql\b/i,
  Tailwind: /\btailwind\b/i,
};

export const JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "lever.co",
  "greenhouse.io",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "ziprecruiter.com",
  "monster.com",
  "wellfound.com",
  "angellist.com",
  "dice.com",
  "workable.com",
  "naukri.com",
  "shine.com",
  "foundit.in",
  "instahyre.com",
  "hirist.tech",
] as const;

