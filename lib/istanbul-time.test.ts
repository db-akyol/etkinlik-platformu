// Run these in a timezone that is BOTH not Turkey and observes DST. Every
// function under test is supposed to produce identical output no matter what
// the runtime's clock is set to, so if any of them ever regresses to an
// implicit `new Date(offsetlessString)` or a `timeZone`-less
// `Intl.DateTimeFormat`, these assertions break here even though they'd
// still pass on a developer machine set to Europe/Istanbul.
//
// (Assigning process.env.TZ takes effect immediately in Node — and node:test
// runs each test file in its own process, so this can't leak into the others.)
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  istanbulLocalToUtcIso,
  istanbulTodayDateString,
  utcIsoToIstanbulLocal,
} from "./istanbul-time";

describe("istanbulLocalToUtcIso", () => {
  test("reads a datetime-local value as Turkey time, not runtime time", () => {
    // 20:00 in Istanbul is 17:00 UTC. If this ever returns 20:00Z (runtime
    // = UTC) or 00:00Z (runtime = New York), the 3-hour bug is back.
    assert.equal(istanbulLocalToUtcIso("2026-09-18T20:00"), "2026-09-18T17:00:00.000Z");
  });

  test("is unaffected by northern-hemisphere DST (Turkey has none)", () => {
    // Same wall-clock time in January and July must map to the same offset.
    assert.equal(istanbulLocalToUtcIso("2026-01-15T20:00"), "2026-01-15T17:00:00.000Z");
    assert.equal(istanbulLocalToUtcIso("2026-07-15T20:00"), "2026-07-15T17:00:00.000Z");
  });

  test("handles a midnight value crossing back into the previous UTC day", () => {
    assert.equal(istanbulLocalToUtcIso("2026-09-18T00:00"), "2026-09-17T21:00:00.000Z");
  });

  test("accepts a seconds-precision value too", () => {
    assert.equal(istanbulLocalToUtcIso("2026-09-18T20:30:00"), "2026-09-18T17:30:00.000Z");
  });
});

describe("utcIsoToIstanbulLocal", () => {
  test("round-trips with istanbulLocalToUtcIso", () => {
    const local = "2026-09-18T20:00";
    assert.equal(utcIsoToIstanbulLocal(istanbulLocalToUtcIso(local)), local);
  });

  test("renders in Turkey time, not the runtime's", () => {
    assert.equal(utcIsoToIstanbulLocal("2026-09-18T17:00:00.000Z"), "2026-09-18T20:00");
  });

  test("uses a 24-hour clock (never '08:00 PM' or a '24:00' hour)", () => {
    assert.equal(utcIsoToIstanbulLocal("2026-09-18T17:00:00.000Z"), "2026-09-18T20:00");
    // 00:xx Istanbul is where `hour12: false` famously yields "24" in some
    // locales — this must stay "00" or the admin form's value is invalid.
    assert.equal(utcIsoToIstanbulLocal("2026-09-17T21:15:00.000Z"), "2026-09-18T00:15");
  });

  test("returns an empty string for null/invalid input", () => {
    // The admin edit form feeds `end_at` straight in, which is nullable.
    assert.equal(utcIsoToIstanbulLocal(null), "");
    assert.equal(utcIsoToIstanbulLocal("not a date"), "");
  });
});

describe("istanbulTodayDateString", () => {
  test("returns a YYYY-MM-DD shape", () => {
    assert.match(istanbulTodayDateString(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test("agrees with Istanbul's calendar date, not the runtime's", () => {
    // Between 00:00 and 03:00 Istanbul, the UTC date is still the previous
    // day (and the New York date is two steps behind) — this is the window
    // where a naive `new Date().getFullYear()/getMonth()/getDate()` would
    // silently pick the wrong day and shift the whole listing's floor.
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    assert.equal(istanbulTodayDateString(), expected);
  });
});
