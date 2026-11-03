import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateKey } from "../lib/crm/format";

test("deadline comparisons use the local calendar day on either side of UTC", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const [timezone, instant, expected] of [
      ["Asia/Kolkata", "2026-11-03T18:45:00Z", "2026-11-04"],
      ["America/Los_Angeles", "2026-11-04T03:30:00Z", "2026-11-03"],
      ["Asia/Kolkata", "2026-12-31T18:45:00Z", "2027-01-01"],
      ["America/Los_Angeles", "2027-01-01T03:30:00Z", "2026-12-31"],
    ]) {
      process.env.TZ = timezone;
      assert.equal(localDateKey(new Date(instant)), expected, timezone);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
