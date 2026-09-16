// itemToEvent parses an ISO string with an explicit offset (not a bare
// wall-clock string), so unlike biletinial/diyarbakir-belediye's tests this
// one doesn't need the runtime timezone pinned away from Turkey — there's no
// "assume Turkey local time" step for a regression to hide behind. Pinned
// anyway for consistency with the rest of the scraper test suite.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { itemToEvent, type BubiletRawEvent } from "./bubilet";

const SAMPLE: BubiletRawEvent = {
  id: 19691,
  title: "Dedublüman Konseri",
  url: "https://www.bubilet.com.tr/diyarbakir/etkinlik/dedubluman--konseri-",
  category_name: "Konser",
  date_iso: "2026-09-18T18:00:00+00:00",
  venue: "Diyarbakır Sezai Karakoç Kültür ve Kongre Merkezi",
  performers: ["Dedublüman"],
  price: 1750.0,
  discounted_price: 1750.0,
  is_free: false,
  currency: "TRY",
  image_url: "https://www.bubilet.com.tr/files/Etkinlik/dedubluman.jpg",
};

describe("itemToEvent", () => {
  test("maps a normal paid event", () => {
    const event = itemToEvent(SAMPLE);
    assert.ok(event);
    assert.equal(event.title, "Dedublüman Konseri");
    assert.equal(event.venue_name, "Diyarbakır Sezai Karakoç Kültür ve Kongre Merkezi");
    assert.equal(event.category_name, "Konser");
    assert.equal(event.price, "1.750 TL");
    assert.equal(event.source_url, SAMPLE.url);
    assert.equal(event.image_url, SAMPLE.image_url);
    assert.equal(event.end_at, null);
  });

  test("parses the already-offset date_iso as a correct UTC instant", () => {
    // 18:00+00:00 IS already UTC — no Turkey-local assumption applies here,
    // unlike biletinial's offset-less times. This must come out unchanged.
    const event = itemToEvent(SAMPLE);
    assert.equal(event?.start_at, "2026-09-18T18:00:00.000Z");
  });

  test("prefers the discounted price over the full price", () => {
    const event = itemToEvent({ ...SAMPLE, price: 1000, discounted_price: 750 });
    assert.equal(event?.price, "750 TL");
  });

  test("falls back to the full price when there is no discount", () => {
    const event = itemToEvent({ ...SAMPLE, price: 900, discounted_price: null });
    assert.equal(event?.price, "900 TL");
  });

  test("stores a free event's price as null, not '0 TL'", () => {
    const event = itemToEvent({ ...SAMPLE, is_free: true });
    assert.equal(event?.price, null);
  });

  test("composes a description from performers", () => {
    const event = itemToEvent({ ...SAMPLE, performers: ["Dedublüman", "Misafir Sanatçı"] });
    assert.equal(event?.description, "Sanatçılar: Dedublüman, Misafir Sanatçı");
  });

  test("has no description when there are no performers", () => {
    const event = itemToEvent({ ...SAMPLE, performers: [] });
    assert.equal(event?.description, null);
  });

  test("stores venue_id as resolvable null when bubilet gives no venue", () => {
    const event = itemToEvent({ ...SAMPLE, venue: null });
    assert.equal(event?.venue_name, null);
  });

  test("skips an item with no title", () => {
    assert.equal(itemToEvent({ ...SAMPLE, title: null }), null);
  });

  test("skips an item with no date", () => {
    assert.equal(itemToEvent({ ...SAMPLE, date_iso: null }), null);
  });

  test("skips an item with an unparseable date", () => {
    assert.equal(itemToEvent({ ...SAMPLE, date_iso: "not-a-date" }), null);
  });

  test("collapses whitespace in the title, same as every other parser", () => {
    const event = itemToEvent({ ...SAMPLE, title: "  Dedublüman   Konseri  " });
    assert.equal(event?.title, "Dedublüman Konseri");
  });
});
