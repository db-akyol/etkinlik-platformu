// `itemToEvents` converts Istanbul wall-clock session times, so pin the
// runtime timezone away from Turkey — see lib/istanbul-time.test.ts.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { extractItems, hasRealText, itemToEvents, type BelediyeItem } from "./diyarbakir-belediye";

/**
 * Builds a page whose RSC payload is split across several
 * `self.__next_f.push([1,"..."])` chunks, the way the real page ships it.
 *
 * The escaping here is not decorative: each chunk's contents are a JSON
 * string literal, and `extractItems` reassembles them by re-parsing the
 * concatenation as one. `JSON.stringify(...).slice(1, -1)` produces exactly
 * that encoding, so a fixture built this way exercises the real unescaping
 * path rather than a hand-simplified version of it.
 */
function buildPage(payload: string, chunkSize = 40): string {
  const escaped = JSON.stringify(payload).slice(1, -1);
  const chunks: string[] = [];
  for (let i = 0; i < escaped.length; i += chunkSize) {
    let chunk = escaped.slice(i, i + chunkSize);
    // Never split a backslash escape across two chunks — the real streamer
    // doesn't either, and a lone trailing backslash isn't valid JSON.
    while (chunk.endsWith("\\")) chunk = chunk.slice(0, -1);
    chunks.push(chunk);
    i -= chunkSize - chunk.length;
  }
  return chunks
    .map((c) => `<script>self.__next_f.push([1,"${c}"])</script>`)
    .join("\n");
}

const SAMPLE_ITEM: BelediyeItem = {
  title: "Kırmızı Başlıklı Kız",
  slug: "kirmizi-baslikli-kiz",
  summary: "...",
  content_html: "<p>Çocuklar için bir oyun.</p>",
  startDate: "2026-06-05T16:30:00.000Z",
  endDate: null,
  location: "Cegerxwîn Kültür Merkezi",
  isFree: true,
  price: null,
  event_category: { code: "tiyatro", name: "Tiyatro" },
  cover: { url: "/uploads/a.jpg", formats: { medium: { url: "/uploads/medium_a.jpg" } } },
  sessions: [
    { date: "2026-06-05", start_time: "19:30:00", end_time: "21:00:00" },
    { date: "2026-06-06", start_time: "19:30:00", end_time: null },
  ],
};

describe("extractItems", () => {
  test("reassembles chunks and returns the items array", () => {
    const payload =
      `{"categories":[{"code":"tiyatro"}],"items":${JSON.stringify([SAMPLE_ITEM])}}`;
    const items = extractItems(buildPage(payload));

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Kırmızı Başlıklı Kız");
    assert.equal(items[0].sessions.length, 2);
  });

  test("skips the unrelated breadcrumb 'items' array that appears first", () => {
    // The page has a breadcrumb `"items"` BEFORE the event list, which is
    // why extraction anchors on the `"categories"` key rather than just
    // grabbing the first `"items"` it sees.
    const payload =
      `{"breadcrumb":{"items":[{"label":"Anasayfa"}]},` +
      `"categories":[{"code":"tiyatro"}],"items":${JSON.stringify([SAMPLE_ITEM])}}`;
    const items = extractItems(buildPage(payload));

    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Kırmızı Başlıklı Kız");
  });

  test("finds the closing bracket past nested arrays and bracket-bearing strings", () => {
    // Depth counting has to ignore `[` / `]` inside string values, which is
    // where a regex-based scan goes wrong.
    const tricky: BelediyeItem = { ...SAMPLE_ITEM, title: "Gösteri [Özel] \"Gala\"" };
    const payload = `{"categories":[],"items":${JSON.stringify([tricky])},"total":1}`;
    const items = extractItems(buildPage(payload));

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Gösteri [Özel] "Gala"');
  });

  test("returns an empty array for a page with no events (end of pagination)", () => {
    // fetchAndParse stops paginating on this, so it must not throw.
    const items = extractItems(buildPage(`{"categories":[],"items":[]}`));
    assert.deepEqual(items, []);
  });

  test("throws a descriptive error when the page has no RSC chunks at all", () => {
    // Loud failure beats silently scraping zero events forever.
    assert.throws(() => extractItems("<html><body>nope</body></html>"), /page structure may have changed/);
  });

  test("throws when the expected keys are gone", () => {
    assert.throws(() => extractItems(buildPage(`{"something":"else"}`)), /categories.*not found/);
  });

  test("throws on an unterminated items array", () => {
    assert.throws(() => extractItems(buildPage(`{"categories":[],"items":[{"a":1}`)), /Unterminated/);
  });
});

describe("hasRealText", () => {
  test("rejects the placeholder dots this CMS is full of", () => {
    assert.equal(hasRealText("..."), false);
    assert.equal(hasRealText("<p>...</p>"), false);
    assert.equal(hasRealText(".............."), false);
  });

  test("rejects null/empty", () => {
    assert.equal(hasRealText(null), false);
    assert.equal(hasRealText(undefined), false);
    assert.equal(hasRealText("   "), false);
  });

  test("accepts genuine text, including text that ends in an ellipsis", () => {
    assert.equal(hasRealText("<p>Çocuklar için bir oyun.</p>"), true);
    assert.equal(hasRealText("Devamı var..."), true);
  });
});

describe("itemToEvents", () => {
  test("emits one event per session for a multi-day run", () => {
    const events = itemToEvents(SAMPLE_ITEM);
    assert.equal(events.length, 2);
    assert.equal(events[0].start_at, "2026-06-05T16:30:00.000Z"); // 19:30 Istanbul
    assert.equal(events[1].start_at, "2026-06-06T16:30:00.000Z");
  });

  test("reads session times as Istanbul time, not the runtime's", () => {
    const [first] = itemToEvents(SAMPLE_ITEM);
    assert.equal(first.start_at, "2026-06-05T16:30:00.000Z");
    assert.equal(first.end_at, "2026-06-05T18:00:00.000Z"); // 21:00 Istanbul
  });

  test("leaves end_at null when a session has no end time", () => {
    assert.equal(itemToEvents(SAMPLE_ITEM)[1].end_at, null);
  });

  test("falls back to the top-level dates when there are no sessions", () => {
    const events = itemToEvents({ ...SAMPLE_ITEM, sessions: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].start_at, "2026-06-05T16:30:00.000Z");
  });

  test("prefers content_html over a placeholder summary", () => {
    assert.equal(itemToEvents(SAMPLE_ITEM)[0].description, "Çocuklar için bir oyun.");
  });

  test("stores no description at all when both fields are placeholders", () => {
    const events = itemToEvents({ ...SAMPLE_ITEM, content_html: "<p>...</p>", summary: "..." });
    assert.equal(events[0].description, null);
  });

  test("maps a known category and leaves an unknown one null", () => {
    assert.equal(itemToEvents(SAMPLE_ITEM)[0].category_name, "Tiyatro");
    const unknown = itemToEvents({
      ...SAMPLE_ITEM,
      event_category: { code: "film-gosterimi", name: "Film Gösterimi" },
    });
    assert.equal(unknown[0].category_name, null);
  });

  test("reports a free event as having no price, not '0 TL'", () => {
    assert.equal(itemToEvents(SAMPLE_ITEM)[0].price, null);
  });

  test("formats a paid event's price", () => {
    const paid = itemToEvents({ ...SAMPLE_ITEM, isFree: false, price: 150 });
    assert.equal(paid[0].price, "150 TL");
  });

  test("builds absolute source and image URLs", () => {
    const [event] = itemToEvents(SAMPLE_ITEM);
    assert.equal(event.source_url, "https://diyarbakir.bel.tr/etkinlikler/kirmizi-baslikli-kiz");
    assert.equal(event.image_url, "https://diyarbakir.bel.tr/uploads/medium_a.jpg");
  });

  test("falls back to the original image when no medium/small format exists", () => {
    const events = itemToEvents({ ...SAMPLE_ITEM, cover: { url: "/uploads/a.jpg" } });
    assert.equal(events[0].image_url, "https://diyarbakir.bel.tr/uploads/a.jpg");
  });

  test("leaves image_url null when there is no cover", () => {
    assert.equal(itemToEvents({ ...SAMPLE_ITEM, cover: null })[0].image_url, null);
  });
});
