// See lib/istanbul-time.test.ts for why the runtime timezone is pinned to a
// non-Turkey, DST-observing zone here. This file is the direct guard for the
// "every event displayed 3 hours early on Vercel" bug: these assertions only
// hold if `formatEventDateTime` names its timezone explicitly.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  cardVenueLine,
  listingSection,
  formatDayChip,
  formatDayHeading,
  formatDayLong,
  formatEventBadge,
  formatEventDateTime,
  formatEventPrice,
  formatEventStamp,
  formatEventTime,
  formatMonthLabel,
  istanbulDayKey,
  shortVenueName,
  splitEventTitle,
} from "./format-event";

describe("istanbulDayKey", () => {
  test("uses the Istanbul calendar day, not UTC's", () => {
    // 22:00 UTC on the 25th is 01:00 on the 26th in Istanbul.
    assert.equal(istanbulDayKey("2026-09-25T22:00:00.000Z"), "2026-09-26");
    assert.equal(istanbulDayKey("2026-09-25T20:59:00.000Z"), "2026-09-25");
  });
});

describe("formatEventTime / formatEventStamp", () => {
  test("show Istanbul wall-clock values", () => {
    assert.equal(formatEventTime("2026-09-25T22:15:00.000Z"), "01:15");
    assert.deepEqual(formatEventStamp("2026-09-25T22:15:00.000Z"), { day: "26", month: "Eyl" });
  });
});

describe("formatDayHeading", () => {
  test("names today and tomorrow, with the date as detail", () => {
    assert.deepEqual(formatDayHeading("2026-09-25", "2026-09-25"), {
      title: "Bugün",
      detail: "Cuma, 25 Eylül",
    });
    assert.deepEqual(formatDayHeading("2026-09-26", "2026-09-25"), {
      title: "Yarın",
      detail: "Cumartesi, 26 Eylül",
    });
  });

  test("uses the weekday as title further out", () => {
    assert.deepEqual(formatDayHeading("2026-10-01", "2026-09-25"), {
      title: "Perşembe",
      detail: "1 Ekim",
    });
  });

  test("counts days across a US DST change correctly", () => {
    // Runtime is America/New_York, which falls back on 2026-11-01.
    assert.equal(formatDayHeading("2026-11-01", "2026-10-31").title, "Yarın");
  });
});

describe("day key labels", () => {
  test("format the chip, month and long forms", () => {
    assert.deepEqual(formatDayChip("2026-09-26"), { weekday: "Cmt", day: "26" });
    assert.equal(formatMonthLabel("2026-10-01"), "Ekim 2026");
    assert.equal(formatDayLong("2026-09-26"), "26 Eylül Cumartesi");
  });
});

describe("splitEventTitle", () => {
  test("splits the Devlet Tiyatroları festival suffix", () => {
    assert.deepEqual(splitEventTitle("Hep Yek - İSTANBUL DT - 22.DOA"), {
      title: "Hep Yek",
      subtitle: "İstanbul Devlet Tiyatrosu",
    });
    assert.deepEqual(splitEventTitle("Nalınlar - DİYARBAKIR DT - 22.DOA"), {
      title: "Nalınlar",
      subtitle: "Diyarbakır Devlet Tiyatrosu",
    });
  });

  test("keeps a dash inside the play's own name", () => {
    assert.deepEqual(splitEventTitle("Düğün Ya Da Davul - KAYSERİ DT - 22.DOA").title, "Düğün Ya Da Davul");
    assert.deepEqual(splitEventTitle("Gramofon - Hala Çalıyor - ANTALYA DT - 22.DOA").title, "Gramofon - Hala Çalıyor");
  });

  test("leaves every other title alone", () => {
    assert.deepEqual(splitEventTitle("JAVADOFF - We Don't Say I Love You"), {
      title: "JAVADOFF - We Don't Say I Love You",
      subtitle: null,
    });
  });
});

describe("shortVenueName", () => {
  test("drops a leading 'Diyarbakır '", () => {
    assert.equal(
      shortVenueName("Diyarbakır Sezai Karakoç Kültür ve Kongre Merkezi"),
      "Sezai Karakoç Kültür ve Kongre Merkezi",
    );
    assert.equal(shortVenueName("Diyarbakır Surları"), "Diyarbakır Surları");
    assert.equal(shortVenueName("Cegerxwîn Kültür Merkezi"), "Cegerxwîn Kültür Merkezi");
  });
});

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

  test("returns null when the source gave no price, rather than calling it free", () => {
    // A missing price means "unknown": scrapers write "Ücretsiz" themselves
    // when a source marks an event free. Showing null as "Ücretsiz" listed
    // stand-up shows and a circus as free whenever a detail page failed.
    assert.equal(formatEventPrice(null), null);
    assert.equal(formatEventPrice(""), null);
    assert.equal(formatEventPrice("   "), null);
  });

  test("passes an explicit 'Ücretsiz' through", () => {
    assert.equal(formatEventPrice("Ücretsiz"), "Ücretsiz");
  });
});

describe("cardVenueLine", () => {
  test("drops the venue when it repeats the company line", () => {
    assert.equal(cardVenueLine("Diyarbakır DT", "Diyarbakır Devlet Tiyatrosu"), null);
  });

  test("spells out DT for a visiting company", () => {
    assert.equal(cardVenueLine("Diyarbakır DT", "İzmir Devlet Tiyatrosu"), "Diyarbakır Devlet Tiyatrosu");
  });

  test("shortens other venues as before", () => {
    assert.equal(cardVenueLine("Diyarbakır Mordem Sanat Merkezi", null), "Mordem Sanat Merkezi");
    assert.equal(cardVenueLine("Diyarbakır DT Cahit Sıtkı Tarancı Kültür Merkezi", null), "DT Cahit Sıtkı Tarancı Kültür Merkezi");
  });
});

describe("listingSection", () => {
  // 2026-09-23 is a Wednesday.
  const today = "2026-09-23";

  test("names today and tomorrow", () => {
    assert.equal(listingSection("2026-09-23", today).title, "Bugün");
    assert.equal(listingSection("2026-09-24", today).title, "Yarın");
  });

  test("groups the rest of this week, Monday-based", () => {
    const section = listingSection("2026-09-27", today); // Sunday
    assert.equal(section.key, "bu-hafta");
    assert.equal(section.title, "Bu hafta");
    assert.equal(section.detail, "25 – 27 Eylül");
  });

  test("groups next week", () => {
    const monday = listingSection("2026-09-28", today);
    const sunday = listingSection("2026-10-04", today);
    assert.equal(monday.key, "gelecek-hafta");
    assert.equal(sunday.key, "gelecek-hafta");
    assert.equal(monday.detail, "28 Eylül – 4 Ekim");
  });

  test("groups anything later by month, with the year only when it differs", () => {
    assert.deepEqual(listingSection("2026-10-05", today), { key: "ay-2026-10", title: "Ekim", detail: "" });
    assert.equal(listingSection("2027-01-17", today).title, "Ocak 2027");
  });

  test("on a Sunday, tomorrow starts next week", () => {
    assert.equal(listingSection("2026-09-28", "2026-09-27").title, "Yarın");
    assert.equal(listingSection("2026-09-29", "2026-09-27").key, "gelecek-hafta");
  });
});
