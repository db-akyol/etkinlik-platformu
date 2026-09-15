// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here. This file is the direct guard for the
// "every event displayed 3 hours early on Vercel" bug: these assertions only
// hold if `formatEventDateTime` names its timezone explicitly.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { formatEventDateTime, formatEventPrice } from "./format-event";

describe("formatEventDateTime", () => {
  test("renders a stored UTC instant as Turkey local time", () => {
    // 17:00 UTC is 20:00 in Istanbul. A runtime-timezone regression would
    // render "17:00" (UTC) or "13:00" (New York).
    assert.equal(formatEventDateTime("2026-09-18T17:00:00.000Z"), "18 Eylül 2026, 20:00");
  });

  test("uses Turkish month names", () => {
    assert.equal(formatEventDateTime("2026-01-05T17:00:00.000Z"), "5 Ocak 2026, 20:00");
    assert.equal(formatEventDateTime("2026-12-05T17:00:00.000Z"), "5 Aralık 2026, 20:00");
  });

  test("rolls the displayed date forward when Istanbul is already tomorrow", () => {
    // 22:00 UTC on the 17th is 01:00 on the 18th in Istanbul. The card must
    // show the 18th, which is the date a visitor would actually turn up on.
    assert.equal(formatEventDateTime("2026-09-17T22:00:00.000Z"), "18 Eylül 2026, 01:00");
  });

  test("renders midnight as 00:00, not 24:00", () => {
    // `hour12: false` selects the h24 cycle in some locales — see the
    // matching note in lib/istanbul-time.ts, where it produced a literally
    // invalid form value.
    assert.equal(formatEventDateTime("2026-09-17T21:00:00.000Z"), "18 Eylül 2026, 00:00");
  });

  test("is stable across a US DST transition", () => {
    // Both of these are 20:00 Istanbul; the runtime's clock changes between
    // them and must not leak into the output.
    assert.ok(formatEventDateTime("2026-03-05T17:00:00.000Z").endsWith("20:00"));
    assert.ok(formatEventDateTime("2026-03-12T17:00:00.000Z").endsWith("20:00"));
  });

  test("pads single-digit hours", () => {
    assert.equal(formatEventDateTime("2026-09-18T06:00:00.000Z"), "18 Eylül 2026, 09:00");
  });
});

describe("formatEventPrice", () => {
  test("passes a real price through unchanged", () => {
    assert.equal(formatEventPrice("896 TL"), "896 TL");
  });

  test("shows 'Ücretsiz' when the source gave no price", () => {
    // NOTE: this conflates "genuinely free" with "we failed to scrape a
    // price", which is why the missing-price bug looked like every event
    // being free. Kept deliberately — a free municipality event is the
    // common case — but worth knowing when reading the site.
    assert.equal(formatEventPrice(null), "Ücretsiz");
    assert.equal(formatEventPrice(""), "Ücretsiz");
    assert.equal(formatEventPrice("   "), "Ücretsiz");
  });
});
