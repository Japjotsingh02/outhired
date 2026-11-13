import { JOB_BOARD_DOMAINS } from "@/constants/jobParsing";

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isJobBoardHost(host: string): boolean {
  return JOB_BOARD_DOMAINS.some((board) => host === board || host.endsWith(`.${board}`));
}

/**
 * Reduces a URL, "www." form or bare domain to a lowercase hostname without "www.".
 * Returns null for empty input, IP addresses, localhost, single-label names and
 * job-board hosts. Pure string work: no network calls.
 */
export function normalizeCompanyDomain(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value) || value.includes("@")) return null;

  let host: string;
  try {
    const url = new URL(SCHEME.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname;
  } catch {
    return null;
  }

  host = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host === "localhost" || host.startsWith("[") || IPV4.test(host)) return null;

  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  // The last label must not be numeric (e.g. a malformed IP).
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  if (isJobBoardHost(host)) return null;
  return host;
}

// Subdomains companies use for hiring pages; the company site is the rest of the host.
const CAREERS_PREFIX = /^(?:careers?|jobs?|apply|hiring|talent|recruiting|work)\./;

/**
 * Company website domain for a job page URL, or null when the page is on a job board
 * or the URL is unusable. "careers.stripe.com" becomes "stripe.com".
 */
export function companyDomainFromJobUrl(jobUrl: string): string | null {
  const domain = normalizeCompanyDomain(jobUrl);
  if (!domain) return null;
  const stripped = domain.replace(CAREERS_PREFIX, "");
  return stripped.includes(".") ? stripped : domain;
}
