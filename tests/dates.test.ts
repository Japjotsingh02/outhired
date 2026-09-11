import { test } from "node:test";
import assert from "node:assert/strict";
import { findPostedDate, toIsoDate, toIsoMonth } from "@/server/services/jobParsing/utils/dates";

// Fixed "now": 15 June 2026 (UTC).
const NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));

test("ISO dates keep only year and month", () => {
  assert.equal(toIsoDate("2026-03-12"), "2026-03-01");
  assert.equal(toIsoDate("2026-03"), "2026-03-01");
  assert.equal(toIsoDate("2026-03-12T23:30:00-08:00"), "2026-03-01");
});

test('"March 12, 2026" -> 2026-03-01', () => {
  assert.equal(toIsoDate("March 12, 2026"), "2026-03-01");
  assert.equal(toIsoDate("Mar 12, 2026"), "2026-03-01");
  assert.equal(toIsoDate("March 2026"), "2026-03-01");
});

test('"12 March 2026" -> 2026-03-01', () => {
  assert.equal(toIsoDate("12 March 2026"), "2026-03-01");
  assert.equal(toIsoDate("1st Sept 2025"), "2025-09-01");
});

test('"3 weeks ago" uses UTC epoch math', () => {
  // 15 Jun minus 21 days = 25 May.
  assert.equal(toIsoDate("3 weeks ago", NOW), "2026-05-01");
  assert.equal(toIsoDate("1 week ago", NOW), "2026-06-01");
});

test('"2 months ago" -> two calendar months back', () => {
  assert.equal(toIsoDate("2 months ago", NOW), "2026-04-01");
  assert.equal(toIsoDate("8 months ago", NOW), "2025-10-01");
});

test("days ago can cross a month boundary", () => {
  assert.equal(toIsoDate("20 days ago", NOW), "2026-05-01");
  assert.equal(toIsoDate("yesterday", NOW), "2026-06-01");
});

test("garbage and impossible dates return null", () => {
  assert.equal(toIsoDate("not a date"), null);
  assert.equal(toIsoDate("2026-13-01"), null);
  assert.equal(toIsoDate("Smarch 12, 2026"), null);
  assert.equal(toIsoDate(""), null);
  assert.equal(toIsoDate(undefined), null);
});

test("toIsoMonth returns YYYY-MM-01", () => {
  assert.equal(toIsoMonth("2026-03-12"), "2026-03-01");
});

test("findPostedDate handles posted-on, posted-ago and LinkedIn text", () => {
  assert.equal(findPostedDate("Great role. Posted on March 12, 2026. Apply now", NOW), "2026-03-01");
  assert.equal(findPostedDate("Posted 3 days ago", NOW), "2026-06-01");
  assert.equal(findPostedDate("Senior PM Stripe Bengaluru 3 weeks ago 54 applicants", NOW), "2026-05-01");
  assert.equal(findPostedDate("We were founded 5 years ago", NOW), null);
});
