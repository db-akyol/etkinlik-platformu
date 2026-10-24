/**
 * Tests for the search-engine metadata built for event pages: the <title>,
 * the meta description, the schema.org Event JSON-LD and the "has this
 * event ended" check that drops old events from the index.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { eventJsonLd, eventMetaDescription, eventPageTitle, isPastEvent, serializeJsonLd } from "./event-seo";

const EVENT = {
  title: "Hep Yek - İSTANBUL DT - 22.DOA",
  description: "Bir aile komedisi.",
  // 20:00 Istanbul.
  start_at: "2026-10-02T17:00:00.000Z",
  end_at: null as string | null,
  price: "80 TL",
  image_url: "https://cdn.example.com/hep-yek.jpg",
  source_url: "https://biletinial.com/tr-tr/tiyatro/hep-yek",
  venue: { name: "Diyarbakır DT", address: "Ofis, Diyarbakır", lat: 37.91, lng: 40.23 },
};

describe("eventPageTitle", () => {
  test("names the show, the date and the venue", () => {
    assert.equal(eventPageTitle(EVENT), "Hep Yek – 2 Ekim 2026, Diyarbakır Devlet Tiyatrosu");
  });

  test("adds the city when the venue name lacks it", () => {
    const event = { ...EVENT, title: "Jurnal", venue: { ...EVENT.venue, name: "Holly Stone Performance Hall" } };
    assert.equal(eventPageTitle(event), "Jurnal – 2 Ekim 2026, Holly Stone Performance Hall, Diyarbakır");
  });

  test("falls back to the city when there is no venue", () => {
    assert.equal(eventPageTitle({ ...EVENT, title: "Jurnal", venue: null }), "Jurnal – 2 Ekim 2026, Diyarbakır");
  });
});

describe("eventMetaDescription", () => {
  test("leads with the facts, then the source description", () => {
    assert.equal(
      eventMetaDescription(EVENT),
      "Hep Yek (İstanbul Devlet Tiyatrosu): 2 Ekim 2026 Cuma 20:00, Diyarbakır Devlet Tiyatrosu. Bilet: 80 TL. Bir aile komedisi.",
    );
  });

  test("skips an unknown price and stays within 160 characters", () => {
    const text = eventMetaDescription({ ...EVENT, price: null, description: "a".repeat(300) });
    assert.ok(!text.includes("Bilet"));
    assert.ok(text.length <= 160, `length ${text.length}`);
    assert.ok(text.endsWith("…"));
  });
});

describe("eventJsonLd", () => {
  const ld = eventJsonLd(EVENT, "https://site.example/etkinlik/1");

  test("is a schema.org Event with the required fields", () => {
    assert.equal(ld["@context"], "https://schema.org");
    assert.equal(ld["@type"], "Event");
    assert.equal(ld.name, "Hep Yek");
    assert.equal(ld.startDate, "2026-10-02T20:00:00+03:00");
    assert.equal(ld.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
    assert.deepEqual(ld.location, {
      "@type": "Place",
      name: "Diyarbakır Devlet Tiyatrosu",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Ofis, Diyarbakır",
        addressLocality: "Diyarbakır",
        addressCountry: "TR",
      },
      geo: { "@type": "GeoCoordinates", latitude: 37.91, longitude: 40.23 },
    });
  });

  test("offers a TRY price pointing at the ticket page", () => {
    assert.deepEqual(ld.offers, {
      "@type": "Offer",
      price: 80,
      priceCurrency: "TRY",
      url: "https://biletinial.com/tr-tr/tiyatro/hep-yek",
    });
  });

  test("prices a free event at 0 and leaves out an unknown price", () => {
    assert.equal(eventJsonLd({ ...EVENT, price: "Ücretsiz" }, "u").offers?.price, 0);
    assert.equal(eventJsonLd({ ...EVENT, price: null }, "u").offers, undefined);
  });

  test("uses a real end time", () => {
    assert.equal(eventJsonLd({ ...EVENT, end_at: "2026-10-02T19:00:00.000Z" }, "u").endDate, "2026-10-02T22:00:00+03:00");
  });

  test("without a real end time, ends on the start day with no time made up", () => {
    assert.equal(eventJsonLd({ ...EVENT, end_at: null }, "u").endDate, "2026-10-02");
    assert.equal(eventJsonLd({ ...EVENT, end_at: EVENT.start_at }, "u").endDate, "2026-10-02");
  });

  test("names the company of a Devlet Tiyatroları listing as the performer", () => {
    assert.deepEqual(ld.performer, [{ "@type": "PerformingGroup", name: "İstanbul Devlet Tiyatrosu" }]);
  });

  test("reads performers from a 'Sanatçılar:' description", () => {
    const event = { ...EVENT, title: "Jurnal", description: "Sanatçılar: Bülent Emrah, Barış" };
    assert.deepEqual(eventJsonLd(event, "u").performer, [
      { "@type": "Person", name: "Bülent Emrah" },
      { "@type": "Person", name: "Barış" },
    ]);
  });

  test("reads the performer from an 'X Konseri' title", () => {
    const event = { ...EVENT, title: "Rewşan Konseri", description: null };
    assert.deepEqual(eventJsonLd(event, "u").performer, [{ "@type": "Person", name: "Rewşan" }]);
  });

  test("leaves the performer out when nothing names one", () => {
    assert.equal(eventJsonLd({ ...EVENT, title: "Diyarbakır'da 3 Dev Eğlence", description: "Çocuk şenliği." }, "u").performer, undefined);
  });

  test("still has a location without a venue", () => {
    const location = eventJsonLd({ ...EVENT, venue: null }, "u").location;
    assert.equal(location.name, "Diyarbakır");
  });
});

describe("serializeJsonLd", () => {
  test("escapes '<' so scraped text can't close the script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    assert.ok(!json.includes("<"));
    assert.deepEqual(JSON.parse(json), { name: "</script><script>alert(1)</script>" });
  });
});

describe("isPastEvent", () => {
  // Midnight Istanbul on 2026-10-03.
  const floor = "2026-10-02T21:00:00.000Z";

  test("an event that started before today is past", () => {
    assert.equal(isPastEvent({ start_at: "2026-10-02T17:00:00.000Z", end_at: null }, floor), true);
  });

  test("an event today is not past", () => {
    assert.equal(isPastEvent({ start_at: "2026-10-03T17:00:00.000Z", end_at: null }, floor), false);
  });

  test("a multi-day event still running is not past", () => {
    assert.equal(
      isPastEvent({ start_at: "2026-09-30T07:00:00.000Z", end_at: "2026-10-05T15:00:00.000Z" }, floor),
      false,
    );
  });
});
