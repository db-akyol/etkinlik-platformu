import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { clusterDuplicates, type DuplicateCandidateEvent } from "./merge-duplicate-events";

function event(overrides: Partial<DuplicateCandidateEvent> & { id: string }): DuplicateCandidateEvent {
  return {
    title: "Placeholder",
    start_at: "2026-09-18T17:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    source_url: null,
    ...overrides,
  };
}

describe("clusterDuplicates", () => {
  test("groups two near-duplicate titles at the same start_at", () => {
    const a = event({ id: "a", title: "Büyük Afrika Sirki" });
    const b = event({ id: "b", title: "Büyük Afrika Sirki Oyunu" });

    const clusters = clusterDuplicates([a, b]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(
      clusters[0].map((e) => e.id).sort(),
      ["a", "b"],
    );
  });

  test("does not cluster the same title at different start_at values on different days", () => {
    const a = event({ id: "a", title: "Büyük Afrika Sirki", start_at: "2026-09-18T17:00:00.000Z" });
    const b = event({ id: "b", title: "Büyük Afrika Sirki", start_at: "2026-09-19T17:00:00.000Z" });

    // Different start_at means different showtimes — not a dedup cluster,
    // exact-title match here is fine, no fallback needed.
    assert.equal(clusterDuplicates([a, b]).length, 0);
  });

  test("does not cluster the SAME source's two legitimate same-day sessions", () => {
    // "Alice Harikalar Diyarında" — one biletinial page listing a real 11:00
    // matinee and a real 13:00 evening show, confirmed live on 2026-09-16.
    // Same title, same source, same day, different start_at: must NOT merge.
    const a = event({
      id: "a",
      title: "Alice Harikalar Diyarında",
      start_at: "2026-09-26T11:00:00.000Z",
      source_url: "https://biletinial.com/tr-tr/tiyatro/alice",
    });
    const b = event({
      id: "b",
      title: "Alice Harikalar Diyarında",
      start_at: "2026-09-26T13:00:00.000Z",
      source_url: "https://biletinial.com/tr-tr/tiyatro/alice",
    });

    assert.equal(clusterDuplicates([a, b]).length, 0);
  });

  test("clusters a cross-source pair at DIFFERENT times on the same day", () => {
    // The actual bug reported live on 2026-09-16 after the first dedup fix:
    // biletix's "Dedublüman" and bubilet's "Dedublüman Konseri" 60 minutes
    // apart, same night — the same-start_at-only bucketing missed this.
    const a = event({
      id: "a",
      title: "Dedublüman",
      start_at: "2026-09-18T17:00:00.000Z",
      source_url: "https://www.biletix.com/etkinlik/x",
    });
    const b = event({
      id: "b",
      title: "Dedublüman Konseri",
      start_at: "2026-09-18T18:00:00.000Z",
      source_url: "https://www.bubilet.com.tr/y",
    });

    const clusters = clusterDuplicates([a, b]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(
      clusters[0].map((e) => e.id).sort(),
      ["a", "b"],
    );
  });

  test("does not cluster unrelated events sharing a start_at", () => {
    const a = event({ id: "a", title: "Emre Aydın Konseri" });
    const b = event({ id: "b", title: "Gökhan Türkmen Konseri" });

    assert.equal(clusterDuplicates([a, b]).length, 0);
  });

  test("chains a transitive match (A~B, B~C, but not A~C directly)", () => {
    // "Mustafa Keser Sizlerle" matches "...Sizlerle - Diyarbakır" by
    // containment, and that in turn exact-matches a third identical row —
    // all three must land in one cluster, not two separate pairs.
    const a = event({ id: "a", title: "Mustafa Keser Sizlerle" });
    const b = event({ id: "b", title: "Mustafa Keser Sizlerle - Diyarbakır" });
    const c = event({ id: "c", title: "Mustafa Keser Sizlerle - Diyarbakır" });

    const clusters = clusterDuplicates([a, b, c]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].length, 3);
  });

  test("returns multiple independent clusters", () => {
    const clusters = clusterDuplicates([
      event({ id: "a1", title: "Dodan Konseri", start_at: "2026-09-18T19:00:00.000Z" }),
      event({ id: "a2", title: "Dodan", start_at: "2026-09-18T19:00:00.000Z" }),
      event({ id: "b1", title: "Kalben Konseri", start_at: "2026-11-28T18:00:00.000Z" }),
      event({ id: "b2", title: "Kalben", start_at: "2026-11-28T18:00:00.000Z" }),
    ]);

    assert.equal(clusters.length, 2);
  });

  test("ignores a lone event with no match at its start_at", () => {
    const clusters = clusterDuplicates([event({ id: "a", title: "Solo Event" })]);
    assert.deepEqual(clusters, []);
  });
});
