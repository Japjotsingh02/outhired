import { test } from "node:test";
import assert from "node:assert/strict";
import { hireWindow } from "@/lib/apollo";
import { postedMonthBounds, validatePostedMonth } from "@/lib/postedMonth";

const NOW = new Date(Date.UTC(2026, 5, 15)); // June 2026

test("current month is allowed; next month is not", () => {
  assert.equal(validatePostedMonth("2026-06", NOW), null);
  assert.match(validatePostedMonth("2026-07", NOW) ?? "", /future/);
});

test("exactly 36 months back is allowed; 37 is not", () => {
  assert.deepEqual(postedMonthBounds(NOW).min, { year: 2023, month: 6 });
  assert.equal(validatePostedMonth("2023-06", NOW), null);
  assert.match(validatePostedMonth("2023-05", NOW) ?? "", /3 years/);
});

test("accepts the stored YYYY-MM-01 form and rejects junk", () => {
  assert.equal(validatePostedMonth("2026-03-01", NOW), null);
  assert.notEqual(validatePostedMonth("", NOW), null);
  assert.notEqual(validatePostedMonth("2026-13", NOW), null);
});

test("Apollo window: start of posted month to end of month + 90 days", () => {
  const window = hireWindow(new Date(Date.UTC(2026, 1, 1)), new Date(Date.UTC(2026, 5, 15)));
  assert.equal(window.start.toISOString(), "2026-02-01T00:00:00.000Z");
  // End of Feb 2026 is 28 Feb 23:59:59.999; + 90 days = 29 May.
  assert.equal(window.end.toISOString(), "2026-05-29T23:59:59.999Z");
  assert.equal(window.daysBack, 134); // 1 Feb -> 15 Jun
});
