"use client";

import { useState } from "react";
import {
  formatYearMonth,
  isAllowedPostedMonth,
  parseYearMonth,
  postedMonthBounds,
} from "@/lib/postedMonth";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthYearSelectProps {
  id: string;
  /** "YYYY-MM", or "" when nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Month + year dropdowns for "when was the job posted". Months in the future
 * and months more than 3 years back are not selectable. `onChange` receives
 * "YYYY-MM" once both are chosen, and "" while the selection is incomplete.
 */
export function MonthYearSelect({ id, value, onChange, disabled }: MonthYearSelectProps) {
  const parsed = parseYearMonth(value);
  // Keeps a half-finished choice (e.g. only the year) between renders.
  const [draftYear, setDraftYear] = useState<number | null>(null);
  const [draftMonth, setDraftMonth] = useState<number | null>(null);

  const year = parsed?.year ?? draftYear;
  const month = parsed?.month ?? draftMonth;

  const { min, max } = postedMonthBounds();
  const years: number[] = [];
  for (let y = max.year; y >= min.year; y--) years.push(y);

  function update(nextYear: number | null, nextMonth: number | null) {
    setDraftYear(nextYear);
    setDraftMonth(nextMonth);
    if (nextYear !== null && nextMonth !== null && isAllowedPostedMonth({ year: nextYear, month: nextMonth })) {
      onChange(formatYearMonth({ year: nextYear, month: nextMonth }));
    } else {
      onChange("");
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        id={id}
        className="input"
        aria-label="Month posted"
        value={month ?? ""}
        disabled={disabled}
        onChange={(event) => update(year, event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">Month</option>
        {MONTH_LABELS.map((label, index) => (
          <option
            key={label}
            value={index + 1}
            disabled={year !== null && !isAllowedPostedMonth({ year, month: index + 1 })}
          >
            {label}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label="Year posted"
        value={year ?? ""}
        disabled={disabled}
        onChange={(event) => update(event.target.value ? Number(event.target.value) : null, month)}
      >
        <option value="">Year</option>
        {years.map((optionYear) => (
          <option key={optionYear} value={optionYear}>{optionYear}</option>
        ))}
      </select>
    </div>
  );
}
