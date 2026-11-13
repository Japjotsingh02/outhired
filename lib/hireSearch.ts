// Shared by server and client: no server imports here.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar 2026" from an ISO date or timestamp, read as UTC without building a Date. */
export function formatMonthYear(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})/);
  const month = match ? Number(match[2]) : 0;
  return match && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${match[1]}` : null;
}

/** "Nov 3, 2026" from an ISO timestamp (UTC day). */
export function formatDay(iso: string | null | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const month = match ? Number(match[2]) : 0;
  return match && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${Number(match[3])}, ${match[1]}` : null;
}

/** "Joined Mar 2026", or "Joined 2026" when only the year is known. */
export function joinedLabel(candidate: {
  startedMonth?: string | null;
  startedYearOnly?: boolean;
}): string | null {
  if (!candidate.startedMonth) return null;
  if (candidate.startedYearOnly) {
    const year = candidate.startedMonth.match(/^(\d{4})/)?.[1];
    return year ? `Joined ${year}` : null;
  }
  const label = formatMonthYear(candidate.startedMonth);
  return label ? `Joined ${label}` : null;
}
