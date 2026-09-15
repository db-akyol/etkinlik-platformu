/**
 * Tests for biletinial.ts's HTML extraction helpers.
 *
 * These are offline and fixture-based on purpose — no network. The point is
 * not to check that biletinial's page still has the shape we expect (only a
 * real run can tell us that, and the run logs it), but that the parsing
 * logic itself is correct given that shape. The nesting case below is the
 * one that actually mattered: a naive regex stops at the first nested
 * `</div>` and returns a fragment.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { extractDivByClass, extractFullDescription } from "./biletinial";

const CONTAINER = "yds_cinema_movie_thread_info";

describe("extractDivByClass", () => {
  test("returns the inner HTML of a flat container", () => {
    const html = `<body><div class="${CONTAINER}">Merhaba</div></body>`;
    assert.equal(extractDivByClass(html, CONTAINER), "Merhaba");
  });

  test("spans nested divs instead of stopping at the first close tag", () => {
    // The whole reason this isn't a regex: `[\s\S]*?</div>` would return
    // just "<div>bir</div" and drop everything after it.
    const html = `<div class="${CONTAINER}">bir<div>iki</div>üç</div><div>sonra</div>`;
    assert.equal(extractDivByClass(html, CONTAINER), "bir<div>iki</div>üç");
  });

  test("handles several levels of nesting", () => {
    const html = `<div class="${CONTAINER}">a<div>b<div>c</div>d</div>e</div>`;
    assert.equal(extractDivByClass(html, CONTAINER), "a<div>b<div>c</div>d</div>e");
  });

  test("keeps attributes on the container's own opening tag out of the result", () => {
    const html = `<div id="x" class="${CONTAINER}" data-y="1">içerik</div>`;
    assert.equal(extractDivByClass(html, CONTAINER), "içerik");
  });

  test("returns null when the class is absent", () => {
    assert.equal(extractDivByClass("<div class=\"other\">x</div>", CONTAINER), null);
  });

  test("returns null on truncated HTML rather than a partial string", () => {
    // A half-downloaded page must not silently yield a half description.
    const html = `<div class="${CONTAINER}">bir<div>iki</div>`;
    assert.equal(extractDivByClass(html, CONTAINER), null);
  });
});

describe("extractFullDescription", () => {
  test("strips tags and collapses whitespace", () => {
    const html = `<div class="${CONTAINER}"><p>Birinci   satır.</p>\n<p>İkinci satır.</p></div>`;
    assert.equal(extractFullDescription(html), "Birinci satır. İkinci satır.");
  });

  test("does not truncate at 500 characters", () => {
    // The bug this replaced: biletinial's own JSON-LD `description` is hard
    // capped at exactly 500 chars, so the site showed a sentence cut off
    // mid-word. The page-body text has no such cap.
    const long = "a".repeat(1200);
    const html = `<div class="${CONTAINER}"><p>${long}</p></div>`;
    assert.equal(extractFullDescription(html)?.length, 1200);
  });

  test("returns null, not an empty string, for an empty container", () => {
    // `description` is nullable in the DB; "" would render as a blank
    // paragraph on the detail page instead of being omitted.
    assert.equal(extractFullDescription(`<div class="${CONTAINER}">  </div>`), null);
  });

  test("returns null when the container is missing entirely", () => {
    assert.equal(extractFullDescription("<div class=\"nope\">x</div>"), null);
  });

  test("keeps the text of nested markup", () => {
    const html = `<div class="${CONTAINER}">Yönetmen: <div class="x"><b>Ali</b> Veli</div></div>`;
    assert.equal(extractFullDescription(html), "Yönetmen: Ali Veli");
  });
});
