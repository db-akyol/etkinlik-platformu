/**
 * Tests for the Amedspor banner's countdown text.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { formatCountdown } from "./amedspor";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  test("days and hours when more than a day is left", () => {
    assert.equal(formatCountdown(7 * DAY + 21 * HOUR + 5 * MIN), "7 gün 21 saat");
    assert.equal(formatCountdown(2 * DAY + 10 * MIN), "2 gün");
  });

  test("hours and minutes on match day", () => {
    assert.equal(formatCountdown(5 * HOUR + 12 * MIN), "5 saat 12 dakika");
  });

  test("minutes in the last hour, never '0 dakika'", () => {
    assert.equal(formatCountdown(8 * MIN + 30_000), "8 dakika");
    assert.equal(formatCountdown(20_000), "1 dakika");
  });

  test("null once the match has started", () => {
    assert.equal(formatCountdown(0), null);
    assert.equal(formatCountdown(-5 * MIN), null);
  });
});
