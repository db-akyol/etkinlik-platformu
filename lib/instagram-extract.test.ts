import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { parseExtractionResponse, EMPTY_EXTRACTED_FIELDS } from "./instagram-extract";

describe("parseExtractionResponse", () => {
  test("parses a full valid JSON response", () => {
    const raw = JSON.stringify({
      title: "Dodan Konseri",
      description: "Akustik bir gece.",
      start_at: "2026-09-18T20:00",
      end_at: "2026-09-18T22:00",
      venue_name: "Holly Stone Performance Hall",
      price: "250 TL",
    });

    assert.deepEqual(parseExtractionResponse(raw), {
      title: "Dodan Konseri",
      description: "Akustik bir gece.",
      start_at: "2026-09-18T20:00",
      end_at: "2026-09-18T22:00",
      venue_name: "Holly Stone Performance Hall",
      price: "250 TL",
    });
  });

  test("strips a ```json markdown fence some models add despite instructions", () => {
    const raw = '```json\n{"title": "Dodan Konseri", "description": null, "start_at": null, "end_at": null, "venue_name": null, "price": null}\n```';

    assert.equal(parseExtractionResponse(raw).title, "Dodan Konseri");
  });

  test("returns all-null fields for malformed JSON rather than throwing", () => {
    assert.deepEqual(parseExtractionResponse("this is not json{{{"), EMPTY_EXTRACTED_FIELDS);
  });

  test("returns all-null fields for a JSON array instead of an object", () => {
    assert.deepEqual(parseExtractionResponse("[1, 2, 3]"), EMPTY_EXTRACTED_FIELDS);
  });

  test("returns all-null fields for a bare JSON string", () => {
    assert.deepEqual(parseExtractionResponse('"just a string"'), EMPTY_EXTRACTED_FIELDS);
  });

  test("nulls out a start_at that isn't the exact YYYY-MM-DDTHH:mm shape", () => {
    // The model returning a natural-language date, or one with seconds/an
    // offset, must not be stored as-is — better blank than wrong.
    const raw = JSON.stringify({
      title: "Dodan Konseri",
      description: null,
      start_at: "18 Eylül 2026 saat 20:00",
      end_at: null,
      venue_name: null,
      price: null,
    });

    assert.equal(parseExtractionResponse(raw).start_at, null);
  });

  test("nulls out a field with the wrong JSON type instead of coercing it", () => {
    const raw = JSON.stringify({
      title: "Dodan Konseri",
      description: null,
      start_at: null,
      end_at: null,
      venue_name: null,
      price: 250, // number, not the expected string
    });

    assert.equal(parseExtractionResponse(raw).price, null);
  });

  test("treats missing keys the same as explicit nulls", () => {
    assert.deepEqual(parseExtractionResponse(JSON.stringify({ title: "Dodan Konseri" })), {
      ...EMPTY_EXTRACTED_FIELDS,
      title: "Dodan Konseri",
    });
  });

  test("trims whitespace-only string fields down to null", () => {
    const raw = JSON.stringify({
      title: "Dodan Konseri",
      description: "   ",
      start_at: null,
      end_at: null,
      venue_name: null,
      price: null,
    });

    assert.equal(parseExtractionResponse(raw).description, null);
  });

  test("ignores unrecognized extra keys without failing", () => {
    const raw = JSON.stringify({
      title: "Dodan Konseri",
      description: null,
      start_at: null,
      end_at: null,
      venue_name: null,
      price: null,
      confidence: 0.9,
    });

    assert.equal(parseExtractionResponse(raw).title, "Dodan Konseri");
  });
});
