/**
 * Tests for the category page wording: known categories get hand-written
 * copy, unknown ones a generic fallback that still names the city.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { categoryPageCopy } from "./category-pages";

describe("categoryPageCopy", () => {
  test("uses the hand-written copy for a known category", () => {
    const copy = categoryPageCopy("konser", "Konser");
    assert.equal(copy.heading, "Diyarbakır konserleri");
    assert.equal(copy.title, "Diyarbakır Konserleri — Yaklaşan Konser Takvimi");
    assert.ok(copy.description.startsWith("Diyarbakır'daki yaklaşan konserler"));
    assert.ok(copy.description.endsWith("Liste günde iki kez güncellenir."));
  });

  test("falls back to a generic wording that names the city", () => {
    const copy = categoryPageCopy("film-gosterimi", "Film Gösterimi");
    assert.equal(copy.heading, "Diyarbakır'da film gösterimi etkinlikleri");
    assert.equal(copy.title, "Diyarbakır Film Gösterimi Etkinlikleri");
    assert.ok(copy.description.includes("film gösterimi"));
  });

  test("keeps every description within a search result's length", () => {
    for (const slug of ["konser", "tiyatro", "stand-up", "atolye", "spor", "fuar"]) {
      const { description } = categoryPageCopy(slug, slug);
      assert.ok(description.length <= 160, `${slug}: ${description.length}`);
    }
  });
});
