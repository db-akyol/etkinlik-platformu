/**
 * Tests for `slugify`, which generates `categories.slug` values.
 *
 * Worth pinning because the slug is not cosmetic: the public listing filters
 * by `?kategori=<slug>` (see components/FilterBar.tsx), so a slug that comes
 * out with a non-ASCII character in it produces a category whose filter link
 * silently matches nothing.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { slugify } from "./resolve-refs";

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    assert.equal(slugify("Stand Up"), "stand-up");
  });

  test("folds every Turkish-specific letter to ASCII", () => {
    // The reason for the explicit fold table: dotless "ı" and dotted "İ" are
    // not accented variants of "i" in Unicode, so NFD leaves them untouched
    // and they'd survive into the slug.
    assert.equal(slugify("Atölye"), "atolye");
    assert.equal(slugify("Sergi ve Gösteri"), "sergi-ve-gosteri");
    assert.equal(slugify("Çocuk Şenliği"), "cocuk-senligi");
    assert.equal(slugify("İstanbul"), "istanbul");
    assert.equal(slugify("Işık"), "isik");
    assert.equal(slugify("ĞÜÖÇŞİ"), "guocsi");
  });

  test("produces a pure-ASCII slug for every category the parsers emit", () => {
    // These are the exact strings the CATEGORY_MAPs in biletinial.ts,
    // biletix.ts and diyarbakir-belediye.ts can produce.
    for (const name of ["Konser", "Tiyatro", "Atölye", "Fuar", "Spor", "Sergi"]) {
      assert.match(slugify(name), /^[a-z0-9-]+$/, `slug for "${name}" must be URL-safe ASCII`);
    }
  });

  test("collapses runs of punctuation into a single hyphen", () => {
    assert.equal(slugify("Rock & Pop!!! Gecesi"), "rock-pop-gecesi");
  });

  test("does not leave leading or trailing hyphens", () => {
    assert.equal(slugify("  -Konser-  "), "konser");
  });

  test("keeps digits", () => {
    assert.equal(slugify("90'lar Konseri"), "90-lar-konseri");
  });
});
