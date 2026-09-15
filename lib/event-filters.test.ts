// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here. It matters especially for this file:
// the bug this guards against is date arithmetic that silently uses the
// runtime's calendar instead of Istanbul's.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { getDateRange } from "./event-filters";

describe("getDateRange", () => {
  test("floors at midnight Istanbul (21:00 UTC the previous day)", () => {
    assert.equal(getDateRange(undefined, "2026-09-18").gte, "2026-09-17T21:00:00.000Z");
  });

  test("applies the floor even with no filter, so past events never show", () => {
    // Regression guard: this used to return `{}` when `tarih` was absent,
    // which let the municipality's already-finished events sort to the top
    // of the ascending-by-date listing.
    const range = getDateRange(undefined, "2026-09-18");
    assert.ok(range.gte);
    assert.equal(range.lt, undefined);
  });

  test("keeps the floor for an unrecognized filter value", () => {
    // ?tarih= is user-controllable; a junk value must not remove the floor.
    const range = getDateRange("yarin", "2026-09-18");
    assert.equal(range.gte, "2026-09-17T21:00:00.000Z");
    assert.equal(range.lt, undefined);
  });

  test("'bugun' spans exactly one Istanbul day", () => {
    const range = getDateRange("bugun", "2026-09-18");
    assert.equal(range.gte, "2026-09-17T21:00:00.000Z");
    assert.equal(range.lt, "2026-09-18T21:00:00.000Z");
  });

  test("'hafta' spans exactly seven Istanbul days", () => {
    const range = getDateRange("hafta", "2026-09-18");
    assert.equal(range.lt, "2026-09-24T21:00:00.000Z");
  });

  test("'ay' spans one calendar month", () => {
    // 18 Ekim 00:00 Istanbul == 17 Ekim 21:00 UTC.
    const range = getDateRange("ay", "2026-09-18");
    assert.equal(range.lt, "2026-10-17T21:00:00.000Z");
  });

  test("'ay' clamps instead of overflowing past a short month", () => {
    // 31 Ocak + 1 ay must be 28 Şubat, not 3 Mart — plain setMonth(+1)
    // overflows and would quietly widen the "Bu ay" window by a few days
    // several times a year.
    assert.equal(getDateRange("ay", "2026-01-31").lt, "2026-02-27T21:00:00.000Z");
    // ...and respects a leap year.
    assert.equal(getDateRange("ay", "2028-01-31").lt, "2028-02-28T21:00:00.000Z");
  });

  test("'hafta' crosses a month boundary correctly", () => {
    assert.equal(getDateRange("hafta", "2026-09-28").lt, "2026-10-04T21:00:00.000Z");
  });

  test("'ay' crosses a year boundary correctly", () => {
    assert.equal(getDateRange("ay", "2026-12-15").lt, "2027-01-14T21:00:00.000Z");
  });

  test("windows never overlap or leave a gap between consecutive days", () => {
    // Today's `lt` must equal tomorrow's `gte` — an event starting exactly at
    // midnight belongs to exactly one day's window, not zero or two.
    assert.equal(getDateRange("bugun", "2026-09-18").lt, getDateRange("bugun", "2026-09-19").gte);
  });

  test("spans a US DST transition without drifting an hour", () => {
    // The runtime is America/New_York, which springs forward on 2026-03-08.
    // Turkey has no DST, so a 7-day window across that date must still be
    // exactly 7 * 24 hours.
    const range = getDateRange("hafta", "2026-03-05");
    const hours = (new Date(range.lt!).getTime() - new Date(range.gte).getTime()) / 3_600_000;
    assert.equal(hours, 168);
  });
});
