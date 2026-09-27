// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here. It matters especially for this file:
// the bug this guards against is date arithmetic that silently uses the
// runtime's calendar instead of Istanbul's.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  addCalendarDays,
  buildListingHref,
  calendarStartMonth,
  getUpcomingFloor,
  isFreePrice,
  matchesPriceFilter,
  parseDayParam,
  parsePriceTL,
} from "./event-filters";

describe("getUpcomingFloor", () => {
  test("is midnight Istanbul (21:00 UTC the previous day)", () => {
    assert.equal(getUpcomingFloor("2026-09-18"), "2026-09-17T21:00:00.000Z");
  });
});

describe("addCalendarDays", () => {
  test("crosses a month boundary", () => {
    assert.equal(addCalendarDays("2026-09-28", 7), "2026-10-05");
  });

  test("crosses a year boundary", () => {
    assert.equal(addCalendarDays("2026-12-30", 3), "2027-01-02");
  });

  test("steps exactly one day across a US DST transition", () => {
    // The runtime is America/New_York, which springs forward on 2026-03-08.
    assert.equal(addCalendarDays("2026-03-07", 1), "2026-03-08");
    assert.equal(addCalendarDays("2026-03-08", 1), "2026-03-09");
  });
});

describe("calendarStartMonth", () => {
  const days = ["2026-10-01", "2026-10-04", "2026-11-12"];

  test("prefers the selected day's month", () => {
    assert.equal(calendarStartMonth(days, "2026-09-27", "2026-11-12"), "2026-11");
  });

  test("otherwise opens on the next event's month", () => {
    assert.equal(calendarStartMonth(days, "2026-09-27"), "2026-10");
  });

  test("falls back to this month when nothing is coming up", () => {
    assert.equal(calendarStartMonth([], "2026-09-27"), "2026-09");
  });
});

describe("parseDayParam", () => {
  test("accepts a real date", () => {
    assert.equal(parseDayParam("2026-09-26"), "2026-09-26");
  });

  test("rejects junk and impossible dates", () => {
    // ?gun= is user-controllable.
    assert.equal(parseDayParam(undefined), undefined);
    assert.equal(parseDayParam("yarin"), undefined);
    assert.equal(parseDayParam("2026-9-26"), undefined);
    assert.equal(parseDayParam("2026-02-30"), undefined);
  });
});

describe("buildListingHref", () => {
  test("adds a param and keeps the others", () => {
    assert.equal(
      buildListingHref({ kategori: "konser" }, { gun: "2026-09-26" }),
      "/?kategori=konser&gun=2026-09-26",
    );
  });

  test("removes a param set to undefined or empty", () => {
    assert.equal(buildListingHref({ kategori: "konser", gun: "2026-09-26" }, { gun: undefined }), "/?kategori=konser");
    assert.equal(buildListingHref({ fiyat: "300" }, { fiyat: "" }), "/");
  });

  test("always emits keys in the same order", () => {
    assert.equal(
      buildListingHref({ gorunum: "harita", q: "caz" }, { kategori: "konser" }),
      "/?q=caz&kategori=konser&gorunum=harita",
    );
  });

  test("encodes search text", () => {
    assert.equal(buildListingHref({}, { q: "Şehinşah & co" }), "/?q=%C5%9Eehin%C5%9Fah+%26+co");
  });
});

describe("parsePriceTL", () => {
  test("reads a plain amount", () => {
    assert.equal(parsePriceTL("600 TL"), 600);
  });

  test("treats '.' as a thousands separator", () => {
    assert.equal(parsePriceTL("1.000 TL"), 1000);
    assert.equal(parsePriceTL("₺1.250,00"), 1250);
  });

  test("drops kuruş", () => {
    assert.equal(parsePriceTL("150,50 TL"), 150);
  });

  test("takes the lowest end of a range", () => {
    assert.equal(parsePriceTL("300 - 500 TL"), 300);
  });

  test("returns 0 for free and null for unknown or no number", () => {
    assert.equal(parsePriceTL(null), null);
    assert.equal(parsePriceTL("  "), null);
    assert.equal(parsePriceTL("Ücretsiz"), 0);
    assert.equal(parsePriceTL("Kapıda satış"), null);
  });
});

describe("isFreePrice", () => {
  test("recognizes spelled-out free prices, but not a missing one", () => {
    assert.equal(isFreePrice(null), false);
    assert.equal(isFreePrice(""), false);
    assert.equal(isFreePrice("Ücretsiz giriş"), true);
    assert.equal(isFreePrice("75 TL"), false);
  });
});

describe("matchesPriceFilter", () => {
  test("'ucretsiz' keeps only free events", () => {
    assert.equal(matchesPriceFilter("Ücretsiz", "ucretsiz"), true);
    assert.equal(matchesPriceFilter("70 TL", "ucretsiz"), false);
    assert.equal(matchesPriceFilter(null, "ucretsiz"), false);
  });

  test("'300' keeps free events and anything up to 300 TL", () => {
    assert.equal(matchesPriceFilter("Ücretsiz", "300"), true);
    assert.equal(matchesPriceFilter(null, "300"), false);
    assert.equal(matchesPriceFilter("300 TL", "300"), true);
    assert.equal(matchesPriceFilter("301 TL", "300"), false);
    assert.equal(matchesPriceFilter("1.000 TL", "300"), false);
  });

  test("'300' drops events whose price can't be read", () => {
    assert.equal(matchesPriceFilter("Kapıda satış", "300"), false);
  });

  test("no filter or an unknown value keeps everything", () => {
    assert.equal(matchesPriceFilter("1.000 TL", undefined), true);
    assert.equal(matchesPriceFilter("1.000 TL", "bedava"), true);
  });
});
