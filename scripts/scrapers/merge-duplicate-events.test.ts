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

  test("does not cluster the same title at different start_at values", () => {
    const a = event({ id: "a", title: "Büyük Afrika Sirki", start_at: "2026-09-18T17:00:00.000Z" });
    const b = event({ id: "b", title: "Büyük Afrika Sirki", start_at: "2026-09-19T17:00:00.000Z" });

    // Different start_at means different showtimes — not a dedup cluster,
    // exact-title match here is fine, no fallback needed.
    assert.equal(clusterDuplicates([a, b]).length, 0);
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
