import { test } from "node:test";
import assert from "node:assert/strict";

// Run every date check with the process in India Standard Time (UTC+05:30),
// where `new Date("March 12, 2026")` + toISOString() would give 2026-03-11.
process.env.TZ = "Asia/Calcutta";

test("timezone is really Asia/Calcutta", () => {
  assert.equal(new Date(2026, 2, 12).getTimezoneOffset(), -330);
});

test("no off-by-one in IST", async () => {
  const { findPostedDate, toIsoDate } = await import("@/server/services/jobParsing/utils/dates");
  // The bug this guards against: local midnight on the 12th is the 11th in UTC.
  assert.equal(new Date("March 12, 2026").toISOString().slice(0, 10), "2026-03-11");

  assert.equal(toIsoDate("March 12, 2026"), "2026-03-01");
  assert.equal(toIsoDate("March 1, 2026"), "2026-03-01");
  assert.equal(toIsoDate("1 March 2026"), "2026-03-01");
  assert.equal(toIsoDate("2026-03-01"), "2026-03-01");
  assert.equal(toIsoDate("2026-04-01T00:00:00+05:30"), "2026-04-01");

  // 1 June 2026 02:00 IST is still 31 May in UTC: relative math must use UTC.
  const now = new Date("2026-06-01T02:00:00+05:30");
  assert.equal(toIsoDate("1 day ago", now), "2026-05-01");
  assert.equal(findPostedDate("Posted yesterday", now), "2026-05-01");
});
