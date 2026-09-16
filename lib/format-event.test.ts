// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here. This file is the direct guard for the
// "every event displayed 3 hours early on Vercel" bug: these assertions only
// hold if `formatEventDateTime` names its timezone explicitly.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { formatEventBadge, formatEventDateTime, formatEventPrice } from "./format-event";

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

describe("formatEventBadge", () => {
  // 10:00 UTC on the 18th = 13:00 Istanbul, safely mid-afternoon there.
  const now = new Date("2026-09-18T10:00:00.000Z");

  test("labels an event later the same Istanbul day as 'Bugün'", () => {
    assert.deepEqual(formatEventBadge("2026-09-18T17:00:00.000Z", now), {
      text: "Bugün 20:00",
      soon: true,
    });
  });

  test("labels the next Istanbul day as 'Yarın'", () => {
    assert.deepEqual(formatEventBadge("2026-09-19T17:00:00.000Z", now), {
      text: "Yarın 20:00",
      soon: true,
    });
  });

  test("falls back to a short day/month for anything further out", () => {
    assert.deepEqual(formatEventBadge("2026-09-24T17:00:00.000Z", now), {
      text: "24 Eyl 20:00",
      soon: false,
    });
  });

  test("counts an after-midnight Istanbul event as its own local day", () => {
    // 22:00 UTC on the 18th is 01:00 on the 19th in Istanbul: "Yarın", not
    // "Bugün". Comparing UTC dates instead would get this backwards.
    assert.deepEqual(formatEventBadge("2026-09-18T22:00:00.000Z", now), {
      text: "Yarın 01:00",
      soon: true,
    });
  });

  test("uses Istanbul's calendar day for 'now' as well", () => {
    // 22:00 UTC on the 18th is already the 19th in Istanbul, so an event at
    // 20:00 Istanbul on the 19th is "Bugün" for a visitor there.
    const lateNight = new Date("2026-09-18T22:00:00.000Z");
    assert.deepEqual(formatEventBadge("2026-09-19T17:00:00.000Z", lateNight), {
      text: "Bugün 20:00",
      soon: true,
    });
  });

  test("renders midnight as 00:00, not 24:00", () => {
    assert.equal(formatEventBadge("2026-09-25T21:00:00.000Z", now).text, "26 Eyl 00:00");
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
