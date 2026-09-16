// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  formatPriceTL,
  istanbulCalendarDate,
  istanbulCalendarDayRangeUtc,
  normalizeText,
  normalizeTitleForDedup,
  parseIstanbulLocalTime,
  sameDayCrossSourceMatch,
  stripDateTimeOffset,
} from "./normalize";

describe("normalizeText", () => {
  test("collapses runs of whitespace and trims", () => {
    assert.equal(normalizeText("  Jül   Sezar  "), "Jül Sezar");
  });

  test("collapses the newlines/tabs sources embed mid-string", () => {
    // This is the case that matters: the dedup key is an exact match on
    // `title`, so a stray \r\n between two scrapes of the same event would
    // silently publish it twice.
    assert.equal(normalizeText("Dedublüman\r\n\tKonseri"), "Dedublüman Konseri");
  });

  test("leaves Turkish characters alone", () => {
    assert.equal(normalizeText("Atölye: Şiir ve Öykü"), "Atölye: Şiir ve Öykü");
  });

  test("returns an empty string for whitespace-only input", () => {
    assert.equal(normalizeText("   \n  "), "");
  });
});

describe("stripDateTimeOffset", () => {
  // biletinial's `SeanceDate` carries a trailing "Z" on some rows and not
  // others for what is the same Turkey wall-clock time either way. Comparing
  // the un-stripped value against the detail page's JSON-LD `startDate`
  // (always "+03:00") failed to match ~80% of the time in production, which
  // is what left most events with no price and no end time.
  test("strips a trailing Z", () => {
    assert.equal(stripDateTimeOffset("2026-10-05T20:00:00Z"), "2026-10-05T20:00:00");
  });

  test("strips a colon-separated offset", () => {
    assert.equal(stripDateTimeOffset("2026-10-05T20:00:00+03:00"), "2026-10-05T20:00:00");
  });

  test("strips a compact offset", () => {
    assert.equal(stripDateTimeOffset("2026-10-05T20:00:00-0300"), "2026-10-05T20:00:00");
  });

  test("leaves an already-offsetless value untouched", () => {
    assert.equal(stripDateTimeOffset("2026-10-05T20:00:00"), "2026-10-05T20:00:00");
  });

  test("normalizes both spellings to the same key", () => {
    // The actual invariant biletinial.ts relies on when matching a seance to
    // a JSON-LD entry: the two spellings must be interchangeable.
    assert.equal(
      stripDateTimeOffset("2026-10-05T20:00:00Z"),
      stripDateTimeOffset("2026-10-05T20:00:00+03:00"),
    );
  });

  test("does not mistake a date-only string's dashes for an offset", () => {
    assert.equal(stripDateTimeOffset("2026-10-05"), "2026-10-05");
  });
});

describe("parseIstanbulLocalTime", () => {
  test("reads an offsetless value as Turkey time", () => {
    assert.equal(parseIstanbulLocalTime("2026-09-18T20:00:00"), "2026-09-18T17:00:00.000Z");
  });

  test("treats a spurious trailing Z as Turkey time, not UTC", () => {
    // The whole point: biletinial's "Z" is a backend formatting artifact,
    // not a real UTC marker (confirmed against biletix's independently
    // sourced time for the same show). Both spellings must land on the same
    // instant, or the same event scraped twice lands as two rows 3h apart.
    assert.equal(parseIstanbulLocalTime("2026-09-18T20:00:00Z"), "2026-09-18T17:00:00.000Z");
    assert.equal(
      parseIstanbulLocalTime("2026-09-18T20:00:00Z"),
      parseIstanbulLocalTime("2026-09-18T20:00:00"),
    );
  });

  test("does not throw on a doubled offset (the original RangeError)", () => {
    // Naively appending "+03:00" to an already-suffixed value produced
    // "...Z+03:00" -> `RangeError: Invalid time value`.
    assert.doesNotThrow(() => parseIstanbulLocalTime("2026-09-18T20:00:00Z"));
  });

  test("is unaffected by the runtime's DST", () => {
    assert.equal(parseIstanbulLocalTime("2026-01-15T20:00:00"), "2026-01-15T17:00:00.000Z");
    assert.equal(parseIstanbulLocalTime("2026-07-15T20:00:00"), "2026-07-15T17:00:00.000Z");
  });

  test("handles the date-plus-time shape the belediye parser builds", () => {
    // diyarbakir-belediye.ts concatenates `${session.date}T${session.start_time}`.
    assert.equal(parseIstanbulLocalTime("2026-06-05T19:30:00"), "2026-06-05T16:30:00.000Z");
  });
});

describe("normalizeTitleForDedup", () => {
  // Every pair here was actually observed as a cross-source duplicate in
  // production on 2026-09-16 (biletinial/biletix vs bubilet) — not
  // hypothetical. `same` pairs must normalize to the exact same key;
  // `contained` pairs only normalize to a prefix/suffix of each other (one
  // source appends extra context, e.g. a city name), which is why
  // upsert-event.ts's fallback lookup checks containment too, not just
  // equality.
  const same: [string, string][] = [
    ["Dodan Konseri", "Dodan"],
    [
      'Zerzevan Kalesi Senfonik "Diyarbakır Türküleri"',
      "Zerzevan Kalesi Senfonik - Diyarbakır Türküleri",
    ],
    ["Haybeden Gerçeküstü Aşk Oyunu", "Haybeden Gerçeküstü Aşk"],
    ["Can Gox", "Can Gox Konseri"],
    ["Halil Sezai", "Halil Sezai Konseri"],
    ["Ufuk Beydemir", "Ufuk Beydemir Konseri"],
    ["TUANA", "Tuana"],
    ['HiraiZerdüş "Göğe Bak Benimle"', "HiraiZerdüş - Göğe Bak Benimle"],
    ["Emre Aydın Konseri", "Emre Aydın"],
    ["Eliott Tordo", "Eliott Tordo Konseri"],
    ["Kalben Konseri", "Kalben"],
    ["Ahmet Kaya ile Kardeş Türküler", "Ahmet Kaya İle Kardeş Türküler"],
    ["Soner Sarıkabadayı Konseri", "Soner Sarıkabadayı"],
    ["Büyük Afrika Sirki", "Büyük Afrika Sirki Oyunu"],
    ["Hijyenik Aşklar Oyunu", "Hijyenik Aşklar Tiyatro Oyunu"],
  ];

  for (const [a, b] of same) {
    test(`"${a}" and "${b}" normalize to the same key`, () => {
      assert.equal(normalizeTitleForDedup(a), normalizeTitleForDedup(b));
    });
  }

  test("one title containing the other (extra city context) is a prefix/suffix, not equal", () => {
    const a = normalizeTitleForDedup("Mustafa Keser Sizlerle");
    const b = normalizeTitleForDedup("Mustafa Keser Sizlerle - Diyarbakır");
    assert.notEqual(a, b);
    assert.ok(b.includes(a));
  });

  test("does not merge two different events with different names", () => {
    assert.notEqual(normalizeTitleForDedup("Emre Aydın Konseri"), normalizeTitleForDedup("Gökhan Türkmen Konseri"));
  });

  test("noise words only strip as whole words, not substrings", () => {
    // "Oyuncular" contains "oyun" but is not the word "oyunu" — must survive.
    assert.equal(normalizeTitleForDedup("Oyuncular Buluşması"), "oyuncularbuluşması");
  });
});

describe("istanbulCalendarDate", () => {
  test("converts a UTC instant to its Istanbul calendar day", () => {
    assert.equal(istanbulCalendarDate("2026-09-18T17:00:00.000Z"), "2026-09-18");
  });

  test("rolls over correctly for the first hours of the Istanbul day", () => {
    // 00:30 Istanbul = 21:30 UTC the previous day — a naive UTC-date read
    // would misreport this as still the 17th.
    assert.equal(istanbulCalendarDate("2026-09-17T21:30:00.000Z"), "2026-09-18");
  });
});

describe("istanbulCalendarDayRangeUtc", () => {
  test("returns the UTC instants bounding an Istanbul calendar day", () => {
    const { start, end } = istanbulCalendarDayRangeUtc("2026-09-18");
    assert.equal(start, "2026-09-17T21:00:00.000Z");
    assert.equal(end, "2026-09-18T20:59:59.999Z");
  });

  test("round-trips with istanbulCalendarDate for an instant near midnight", () => {
    const day = istanbulCalendarDate("2026-09-18T17:00:00.000Z");
    const { start, end } = istanbulCalendarDayRangeUtc(day);
    assert.ok("2026-09-18T17:00:00.000Z" >= start && "2026-09-18T17:00:00.000Z" <= end);
  });
});

describe("sameDayCrossSourceMatch", () => {
  // Confirmed live on 2026-09-16: biletix's "Dedublüman" and bubilet's
  // "Dedublüman Konseri" 60 minutes apart, same night, same venue.
  test("matches a fuzzy title from a different source at a nearby time", () => {
    const a = { title: "Dedublüman", start_at: "2026-09-18T17:00:00.000Z", source_url: "https://biletix.com/x" };
    const b = {
      title: "Dedublüman Konseri",
      start_at: "2026-09-18T18:00:00.000Z",
      source_url: "https://bubilet.com.tr/y",
    };
    assert.equal(sameDayCrossSourceMatch(a, b), true);
  });

  test("does NOT match the same source's two legitimate same-day sessions", () => {
    // "Alice Harikalar Diyarında" — one biletinial page listing a real 11:00
    // matinee and a real 13:00 evening show. Same title, same source,
    // different start_at: this must stay two rows.
    const a = {
      title: "Alice Harikalar Diyarında",
      start_at: "2026-09-26T11:00:00.000Z",
      source_url: "https://biletinial.com/tr-tr/tiyatro/alice",
    };
    const b = {
      title: "Alice Harikalar Diyarında",
      start_at: "2026-09-26T13:00:00.000Z",
      source_url: "https://biletinial.com/tr-tr/tiyatro/alice",
    };
    assert.equal(sameDayCrossSourceMatch(a, b), false);
  });

  test("matches an exact start_at regardless of source", () => {
    const a = { title: "Jül Sezar", start_at: "2026-09-18T17:00:00.000Z", source_url: "https://a.example" };
    const b = { title: "Jül Sezar", start_at: "2026-09-18T17:00:00.000Z", source_url: "https://a.example" };
    assert.equal(sameDayCrossSourceMatch(a, b), true);
  });

  test("does not match unrelated titles even across sources", () => {
    const a = { title: "Emre Aydın Konseri", start_at: "2026-09-18T17:00:00.000Z", source_url: "https://a.example" };
    const b = {
      title: "Gökhan Türkmen Konseri",
      start_at: "2026-09-18T18:00:00.000Z",
      source_url: "https://b.example",
    };
    assert.equal(sameDayCrossSourceMatch(a, b), false);
  });
});

describe("formatPriceTL", () => {
  test("formats a whole number with Turkish thousands separators", () => {
    assert.equal(formatPriceTL(896), "896 TL");
    assert.equal(formatPriceTL(2000), "2.000 TL");
  });

  test("rounds fractional amounts", () => {
    // biletix gives kuruş (TL*100), so a /100 can land on a fraction.
    assert.equal(formatPriceTL(450.4), "450 TL");
    assert.equal(formatPriceTL(450.6), "451 TL");
  });

  test("formats zero rather than returning something falsy", () => {
    assert.equal(formatPriceTL(0), "0 TL");
  });
});
